// 3-2 移行処理（migrateEntries・verifyMigration・runMigration・recordMigration）のテスト
import { test } from "node:test";
import assert from "node:assert/strict";
import { FakeStorage, loadCore, OLD_RECORDS, V2_RECORD } from "./helpers.mjs";

const clone = (v) => JSON.parse(JSON.stringify(v));
const OLD = Object.values(OLD_RECORDS);
const NOW = new Date(2026, 9, 21, 10, 30, 0);
const LATER = new Date(2026, 9, 21, 11, 0, 0);

function setup(records = OLD, quota) {
  const core = loadCore(new FakeStorage(quota));
  if (records !== null) core.storage.setItem(core.STORAGE_KEY, JSON.stringify(records));
  return core;
}
const stored = (core) => JSON.parse(core.storage.getItem(core.STORAGE_KEY));
const keys = (core) => [...core.storage.map.keys()].sort();

// ---------- 変換 ----------

test("migrateEntries: v1 の記録に足すのは schemaVersion と status だけ", () => {
  const { migrateEntries } = loadCore();
  const after = migrateEntries(clone(OLD));
  after.forEach((a, i) => assert.deepEqual(a, { ...OLD[i], schemaVersion: 2, status: "final" }));
});

test("migrateEntries: 元の配列・記録を書き換えない", () => {
  const { migrateEntries } = loadCore();
  const before = clone(OLD);
  migrateEntries(before);
  assert.deepEqual(before, OLD);
});

test("migrateEntries: schemaVersion を持つ記録には触らない", () => {
  const { migrateEntries } = loadCore();
  const v2 = clone(V2_RECORD);
  const future = { id: "s_test0006ffff", schemaVersion: 3, status: "draft" };
  const [a, b] = migrateEntries([v2, future]);
  assert.equal(a, v2);
  assert.equal(b, future);
});

test("migrateEntries: 2回かけても1回と同じ（冪等）", () => {
  const { migrateEntries } = loadCore();
  const once = migrateEntries(clone(OLD));
  assert.deepEqual(migrateEntries(clone(once)), once);
});

test("migrateEntries: checks・visit・updatedAt・name が無い記録も扱える", () => {
  const { migrateEntries } = loadCore();
  assert.deepEqual(migrateEntries([{ id: "s_test0007gggg" }]), [{ id: "s_test0007gggg", schemaVersion: 2, status: "final" }]);
});

// ---------- 検証 ----------

test("verifyMigration: 追加だけなら null", () => {
  const { migrateEntries, verifyMigration } = loadCore();
  assert.equal(verifyMigration(OLD, migrateEntries(clone(OLD))), null);
});

test("verifyMigration: 件数・id の並び・値の変化・項目の消失・想定外の追加を見つける", () => {
  const { migrateEntries, verifyMigration } = loadCore();
  const ok = () => migrateEntries(clone(OLD));
  let a = ok(); a.pop();
  assert.match(verifyMigration(OLD, a), /件数/);
  a = ok(); [a[0], a[1]] = [a[1], a[0]];
  assert.match(verifyMigration(OLD, a), /id/);
  a = ok(); a[1].visit.v_date = "2000-01-01";
  assert.match(verifyMigration(OLD, a), /visit/);
  a = ok(); delete a[3].memoFromFuture;
  assert.match(verifyMigration(OLD, a), /memoFromFuture/);
  a = ok(); a[0].field = {};
  assert.match(verifyMigration(OLD, a), /想定外の項目 field/);
});

// ---------- 起動時の手順 ----------

test("runMigration: 保存内容が無ければ何も書かない", () => {
  const core = setup(null);
  assert.equal(core.runMigration(NOW).status, "none");
  assert.deepEqual(keys(core), []);
});

test("runMigration: JSON が壊れていれば何も書かない", () => {
  const core = loadCore();
  core.storage.setItem(core.STORAGE_KEY, "[{壊れた");
  const r = core.runMigration(NOW);
  assert.equal(r.status, "failed");
  assert.equal(r.stage, "read");
  assert.equal(core.storage.getItem(core.STORAGE_KEY), "[{壊れた");
  assert.deepEqual(keys(core), [core.STORAGE_KEY]);
});

test("runMigration: 形式が正しくなければ何も書かない", () => {
  const bad = [{ name: "id が無い" }];
  const core = setup(bad);
  const r = core.runMigration(NOW);
  assert.equal(r.stage, "read");
  assert.deepEqual(keys(core), [core.STORAGE_KEY]);
  assert.deepEqual(stored(core), bad);
});

test("runMigration: 全部 v2 なら何も書かず、バックアップも作らない", () => {
  const core = setup([V2_RECORD]);
  const before = core.storage.getItem(core.STORAGE_KEY);
  assert.deepEqual(core.runMigration(NOW), { status: "unchanged", count: 1 });
  assert.equal(core.storage.getItem(core.STORAGE_KEY), before);
  assert.deepEqual(core.listBackups(), []);
});

test("runMigration: 0件の配列なら何も書かない", () => {
  const core = setup([]);
  assert.equal(core.runMigration(NOW).status, "unchanged");
  assert.deepEqual(core.listBackups(), []);
});

test("runMigration: 成功すると、元の文字列そのままのバックアップを作り、v2 で書く", () => {
  const core = setup([...OLD, V2_RECORD]);
  const raw = core.storage.getItem(core.STORAGE_KEY);
  const r = core.runMigration(NOW);
  assert.equal(r.status, "migrated");
  assert.equal(r.count, 5);
  assert.equal(r.migrated, 4);
  assert.equal(r.backupKey, `${core.BACKUP_PREFIX}20261021T103000`);
  assert.equal(core.storage.getItem(r.backupKey), raw);
  const after = stored(core);
  OLD.forEach((o, i) => assert.deepEqual(after[i], { ...o, schemaVersion: 2, status: "final" }));
  assert.deepEqual(after[4], V2_RECORD);
});

test("runMigration: 2回目・3回目は何も書かず、バックアップも増えない", () => {
  const core = setup();
  core.runMigration(NOW);
  const snapshot = new Map(core.storage.map);
  assert.equal(core.runMigration(LATER).status, "unchanged");
  assert.equal(core.runMigration(LATER).status, "unchanged");
  assert.deepEqual(core.storage.map, snapshot);
});

test("runMigration: 古い版のアプリが後から足した v1 の記録も、次の起動で揃う", () => {
  const core = setup();
  core.runMigration(NOW);
  const list = stored(core);
  list.push({ id: "s_test0008hhhh", name: "古い版で追加", checks: {}, visit: {}, updatedAt: 1 });
  core.storage.setItem(core.STORAGE_KEY, JSON.stringify(list));
  const r = core.runMigration(LATER);
  assert.equal(r.migrated, 1);
  assert.equal(stored(core)[4].schemaVersion, 2);
});

test("runMigration: バックアップを書けない（容量不足）なら、元データは変えない", () => {
  const raw = JSON.stringify(OLD);
  // 元データは入るが、同じ大きさのバックアップは入らない容量
  const core = setup(OLD, "shrine-entries-offline".length + raw.length + 100);
  const r = core.runMigration(NOW);
  assert.equal(r.status, "failed");
  assert.equal(r.stage, "backup");
  assert.equal(core.storage.getItem(core.STORAGE_KEY), raw);
  assert.deepEqual(core.listBackups(), []);
});

test("runMigration: 元データを書けない（容量不足）なら、元データは変わらずバックアップは残る", () => {
  const raw = JSON.stringify(OLD);
  // バックアップまでは入るが、少し大きくなった移行後のデータは入らない容量
  const quota = "shrine-entries-offline".length + raw.length + `shrine-entries-offline_backup_v1_20261021T103000`.length + raw.length + 20;
  const core = setup(OLD, quota);
  const r = core.runMigration(NOW);
  assert.equal(r.status, "failed");
  assert.equal(r.stage, "write");
  assert.equal(r.restored, true);
  assert.equal(core.storage.getItem(core.STORAGE_KEY), raw);
  assert.equal(core.storage.getItem(r.backupKey), raw);
});

test("runMigration: 読み戻した内容が違えば、元の文字列で書き戻す", () => {
  const core = setup();
  const raw = core.storage.getItem(core.STORAGE_KEY);
  // 書いた内容と違うものが読み戻される保存先（壊れた端末を想定）
  const realSet = core.storage.setItem.bind(core.storage);
  core.storage.setItem = (k, v) => realSet(k, k === core.STORAGE_KEY && v !== raw ? v.replace("テスト神社A", "テスト神社X") : v);
  const r = core.runMigration(NOW);
  assert.equal(r.status, "failed");
  assert.equal(r.stage, "write");
  assert.equal(r.restored, true);
  assert.equal(core.storage.getItem(core.STORAGE_KEY), raw);
});

test("runMigration: 成功したらバックアップを新しい3件に整理する", () => {
  const core = setup();
  for (const t of ["20261001T000000", "20261002T000000", "20261003T000000"]) core.storage.setItem(core.BACKUP_PREFIX + t, "[]");
  const r = core.runMigration(NOW);
  assert.deepEqual(core.listBackups(), [r.backupKey, core.BACKUP_PREFIX + "20261003T000000", core.BACKUP_PREFIX + "20261002T000000"]);
});

test("runMigration: 失敗したときはバックアップを整理しない", () => {
  const raw = JSON.stringify(OLD);
  const olds = ["20261001T000000", "20261002T000000", "20261003T000000"].map(t => "shrine-entries-offline_backup_v1_" + t);
  let quota = "shrine-entries-offline".length + raw.length + olds.reduce((s, k) => s + k.length + 2, 0) + 100;
  const core = setup(OLD, quota);
  olds.forEach(k => core.storage.setItem(k, "[]"));
  assert.equal(core.runMigration(NOW).stage, "backup");
  assert.deepEqual(core.listBackups(), olds.slice().reverse());
});

// ---------- 移行ログ ----------

test("recordMigration: shrine-meta.migrations に残し、他のメタ情報は消さない", () => {
  const core = setup();
  core.storage.setItem(core.META_KEY, JSON.stringify({ lastExportAt: "2026-10-21T09:00:00+09:00" }));
  const r = core.runMigration(NOW);
  core.recordMigration(r, NOW);
  const meta = core.readMeta();
  assert.equal(meta.lastExportAt, "2026-10-21T09:00:00+09:00");
  assert.equal(meta.migrations.length, 1);
  assert.deepEqual({ ...meta.migrations[0], at: meta.migrations[0].at.slice(0, 19) },
    { at: "2026-10-21T10:30:00", from: 1, to: 2, count: 4, migrated: 4, backupKey: r.backupKey });
});

test("recordMigration: 直近20件だけ残す", () => {
  const core = setup();
  for (let i = 0; i < 25; i++) core.recordMigration({ count: i, migrated: 1, backupKey: "k" }, NOW);
  const log = core.readMeta().migrations;
  assert.equal(log.length, 20);
  assert.equal(log[0].count, 5);
});

// ---------- 判定 ----------

test("entryProblem: 追加した項目は、型が違うときだけ弾く", () => {
  const { entryProblem } = loadCore();
  assert.equal(entryProblem(V2_RECORD), null);
  assert.equal(entryProblem({ id: "s_x" }), null);
  assert.match(entryProblem({ id: "s_x", schemaVersion: "2" }), /schemaVersion/);
  assert.match(entryProblem({ id: "s_x", status: 1 }), /status/);
  assert.match(entryProblem({ id: "s_x", createdAt: 1 }), /createdAt/);
});
