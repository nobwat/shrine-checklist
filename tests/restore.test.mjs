// 3-5 バックアップからの復元（restoreBackup）と、書き出しJSONとの比較（parseExportFile・compareWithExport・compareVerdict）のテスト
import { test } from "node:test";
import assert from "node:assert/strict";
import { FakeStorage, loadCore, OLD_RECORDS, V2_RECORD } from "./helpers.mjs";

const clone = (v) => JSON.parse(JSON.stringify(v));
const OLD = Object.values(OLD_RECORDS);
const NOW = new Date(2026, 9, 21, 12, 0, 0);
const v2 = (e) => ({ ...e, schemaVersion: 2, status: "final" });

// 今の記録と、1件のバックアップがある状態
function setup({ current = OLD.map(v2), backup = OLD, quota } = {}) {
  const core = loadCore(new FakeStorage(quota));
  if (current !== null) core.storage.setItem(core.STORAGE_KEY, JSON.stringify(current));
  const key = core.BACKUP_PREFIX + "20261021T103000";
  core.storage.setItem(key, typeof backup === "string" ? backup : JSON.stringify(backup));
  return { core, key };
}

// ---------- 復元 ----------

test("restoreBackup: バックアップの文字列そのままに戻し、戻す前の内容を別のバックアップに残す", () => {
  const { core, key } = setup();
  const before = core.storage.getItem(core.STORAGE_KEY);
  const r = core.restoreBackup(key, NOW);
  assert.equal(r.ok, true);
  assert.equal(r.count, 4);
  assert.equal(r.preBackupKey, core.BACKUP_PREFIX + "20261021T120000");
  assert.equal(core.storage.getItem(core.STORAGE_KEY), JSON.stringify(OLD));
  assert.equal(core.storage.getItem(r.preBackupKey), before);
  assert.equal(core.storage.getItem(key), JSON.stringify(OLD), "戻した元のバックアップは残る");
});

test("restoreBackup: 今の記録が無ければ、戻す前のバックアップは作らない", () => {
  const { core, key } = setup({ current: null });
  const r = core.restoreBackup(key, NOW);
  assert.equal(r.ok, true);
  assert.equal(r.preBackupKey, null);
  assert.deepEqual(core.listBackups(), [key]);
});

test("restoreBackup: 今の記録が読めない状態でも戻せ、読めない文字列もバックアップに残す", () => {
  const { core, key } = setup();
  core.storage.setItem(core.STORAGE_KEY, "[{壊れた");
  const r = core.restoreBackup(key, NOW);
  assert.equal(r.ok, true);
  assert.equal(core.storage.getItem(r.preBackupKey), "[{壊れた");
});

test("restoreBackup: 今の記録と同じなら何も書かない", () => {
  const { core, key } = setup({ current: OLD, backup: OLD });
  const r = core.restoreBackup(key, NOW);
  assert.equal(r.ok, true);
  assert.equal(r.preBackupKey, null);
  assert.deepEqual(core.listBackups(), [key]);
});

test("restoreBackup: バックアップが無い・壊れている・形式が違うときは、何も変えない", () => {
  for (const [backup, pattern] of [["[{壊れた", /JSON/], [JSON.stringify([{ name: "id が無い" }]), /形式/]]) {
    const { core, key } = setup({ backup });
    const before = new Map(core.storage.map);
    const r = core.restoreBackup(key, NOW);
    assert.equal(r.ok, false);
    assert.match(r.error, pattern);
    assert.deepEqual(core.storage.map, before);
  }
  const { core } = setup();
  assert.equal(core.restoreBackup(core.BACKUP_PREFIX + "19990101T000000", NOW).ok, false);
  assert.equal(core.restoreBackup(core.STORAGE_KEY, NOW).ok, false, "バックアップ以外のキーからは戻さない");
});

test("restoreBackup: 今の記録をバックアップできない（容量不足）なら、何も変えない", () => {
  const current = JSON.stringify(OLD.map(v2));
  const backupKey = "shrine-entries-offline_backup_v1_20261021T103000";
  // 今の記録とバックアップ1件は入るが、もう1件は入らない容量
  const quota = "shrine-entries-offline".length + current.length + backupKey.length + JSON.stringify(OLD).length + 100;
  const { core, key } = setup({ quota });
  const before = new Map(core.storage.map);
  const r = core.restoreBackup(key, NOW);
  assert.equal(r.ok, false);
  assert.match(r.error, /バックアップできませんでした/);
  assert.equal(r.restored, true);
  assert.deepEqual(core.storage.map, before);
});

test("restoreBackup: 書き込んだ内容と読み戻しが違えば、元の内容に書き戻す", () => {
  const { core, key } = setup();
  const before = core.storage.getItem(core.STORAGE_KEY);
  const realSet = core.storage.setItem.bind(core.storage);
  core.storage.setItem = (k, v) => realSet(k, k === core.STORAGE_KEY && v !== before ? v.replace("テスト神社A", "テスト神社X") : v);
  const r = core.restoreBackup(key, NOW);
  assert.equal(r.ok, false);
  assert.equal(r.restored, true);
  assert.equal(core.storage.getItem(core.STORAGE_KEY), before);
});

// ---------- 同じ中身のバックアップ（makeBackup） ----------

const T1 = new Date(2026, 9, 21, 9, 0, 0);
const backupMap = (core) => Object.fromEntries(core.listBackups().map(k => [k, core.storage.getItem(k)]));

test("makeBackup: 同じ中身のバックアップがあれば、新しい日時のキーに移し替えて1件にする", () => {
  const core = loadCore();
  const raw = JSON.stringify(OLD);
  const oldKey = core.makeBackup(raw, T1);
  const newKey = core.makeBackup(raw, NOW);
  assert.notEqual(newKey, oldKey);
  assert.deepEqual(backupMap(core), { [newKey]: raw });
});

test("makeBackup: 中身が1文字でも違えば、別のバックアップとして両方残す", () => {
  const core = loadCore();
  const a = core.makeBackup(JSON.stringify(OLD), T1);
  const b = core.makeBackup(JSON.stringify(OLD) + " ", NOW);
  assert.deepEqual(core.listBackups(), [b, a]);
});

test("makeBackup: 同じ中身が既に複数あっても、1件にまとめる", () => {
  const core = loadCore();
  const raw = JSON.stringify(OLD);
  core.storage.setItem(core.BACKUP_PREFIX + "20261001T000000", raw);
  core.storage.setItem(core.BACKUP_PREFIX + "20261002T000000", raw);
  core.storage.setItem(core.BACKUP_PREFIX + "20261003T000000", "[]");
  const key = core.makeBackup(raw, NOW);
  assert.deepEqual(backupMap(core), { [key]: raw, [core.BACKUP_PREFIX + "20261003T000000"]: "[]" });
});

test("makeBackup: 同じ秒に同じ中身を2回書いても、1件だけ残る", () => {
  const core = loadCore();
  const raw = JSON.stringify(OLD);
  core.makeBackup(raw, NOW);
  const key = core.makeBackup(raw, NOW);
  assert.deepEqual(backupMap(core), { [key]: raw });
});

test("makeBackup: 新しいキーを書けない（容量不足）なら例外になり、同じ中身の古いバックアップは残る", () => {
  const raw = JSON.stringify(OLD);
  const oldKey = "shrine-entries-offline_backup_v1_20261021T090000";
  const core = loadCore(new FakeStorage(oldKey.length + raw.length + 50));
  core.storage.setItem(oldKey, raw);
  const before = new Map(core.storage.map);
  assert.throws(() => core.makeBackup(raw, NOW), { name: "QuotaExceededError" });
  assert.deepEqual(core.storage.map, before);
});

test("移行：同じ中身の古いバックアップが一番古くても、整理で消されずに残る", () => {
  const core = loadCore();
  const raw = JSON.stringify(OLD);
  core.storage.setItem(core.STORAGE_KEY, raw);
  // 移行前と同じ中身のバックアップが一番古く、その後に別の中身が3件ある
  core.storage.setItem(core.BACKUP_PREFIX + "20261001T000000", raw);
  for (const t of ["20261002T000000", "20261003T000000", "20261004T000000"]) core.storage.setItem(core.BACKUP_PREFIX + t, `[]${t}`);
  const r = core.runMigration(NOW);
  assert.equal(r.status, "migrated");
  const kept = backupMap(core);
  assert.equal(Object.keys(kept).length, 3);
  assert.equal(kept[r.backupKey], raw, "移行前の中身は、新しい日時で残る");
});

test("移行前のバックアップに戻して再び移行しても、同じ中身のバックアップは1件だけ", () => {
  const core = loadCore();
  core.storage.setItem(core.STORAGE_KEY, JSON.stringify(OLD));
  const first = core.runMigration(T1);                               // 移行前（v1）のバックアップができる
  const restored = core.restoreBackup(first.backupKey, new Date(2026, 9, 21, 10, 0, 0)); // 戻す前（v2）も残る
  core.pruneBackups();
  const second = core.runMigration(NOW);                              // 読み直し後の移行
  assert.equal(second.status, "migrated");
  const contents = Object.values(backupMap(core));
  assert.equal(contents.length, new Set(contents).size, "同じ中身のバックアップが無い");
  assert.deepEqual(core.listBackups().sort(), [restored.preBackupKey, second.backupKey].sort());
  assert.equal(core.storage.getItem(second.backupKey), JSON.stringify(OLD));
});

test("戻す前のバックアップ：今の記録と同じ中身のバックアップがあれば、新しい日時に移し替える", () => {
  const { core, key } = setup();
  const current = core.storage.getItem(core.STORAGE_KEY);
  const sameKey = core.BACKUP_PREFIX + "20261020T000000";
  core.storage.setItem(sameKey, current);
  const r = core.restoreBackup(key, NOW);
  assert.equal(r.ok, true);
  assert.equal(core.storage.getItem(sameKey), null);
  assert.equal(core.storage.getItem(r.preBackupKey), current);
  assert.deepEqual(core.listBackups(), [r.preBackupKey, key]);
});

// ---------- 書き出しファイルの読み取り ----------

test("parseExportFile: 書き出し形式と生の配列を読み、重なった id は後のものを使う", () => {
  const { parseExportFile } = loadCore();
  const dup = [OLD[0], { ...OLD[0], name: "後の方" }];
  const a = parseExportFile(JSON.stringify({ format: "shrine-checklist-backup", formatVersion: 1, entries: dup }));
  assert.equal(a.ok, true);
  assert.deepEqual(a.entries.map(e => e.name), ["後の方"]);
  assert.deepEqual(parseExportFile(JSON.stringify(OLD)).entries, OLD);
});

test("parseExportFile: 読めない・版が違う・このアプリの形式でないファイルを断る", () => {
  const { parseExportFile } = loadCore();
  assert.match(parseExportFile("{壊れた").error, /JSON/);
  assert.match(parseExportFile(JSON.stringify({ format: "shrine-checklist-backup", formatVersion: 2, entries: [] })).error, /新しいバージョン/);
  assert.match(parseExportFile(JSON.stringify({ format: "shrine-checklist-backup", entries: [] })).error, /formatVersion/);
  assert.match(parseExportFile(JSON.stringify({ hello: 1 })).error, /書き出しファイルではありません/);
  assert.match(parseExportFile(JSON.stringify([{ name: "id が無い" }])).error, /形式が正しくありません/);
});

// ---------- 比較 ----------

test("compareWithExport: 移行だけなら「件数一致・元の項目は全部一致・追加は schemaVersion/status のみ」", () => {
  const { compareWithExport, compareVerdict, migrateEntries } = loadCore();
  const r = compareWithExport(OLD, migrateEntries(clone(OLD)));
  assert.equal(r.allSame, true);
  assert.deepEqual(r.added, { schemaVersion: 4, status: 4 });
  assert.equal(compareVerdict(r), "件数一致・元の項目は全部一致・追加は schemaVersion/status のみ");
});

test("compareWithExport: まったく同じなら「追加なし」", () => {
  const { compareWithExport, compareVerdict } = loadCore();
  assert.equal(compareVerdict(compareWithExport([V2_RECORD], [clone(V2_RECORD)])), "件数一致・元の項目は全部一致・追加なし");
});

test("compareWithExport: 想定外の項目が増えていれば、その名前を出す", () => {
  const { compareWithExport, compareVerdict } = loadCore();
  const r = compareWithExport([OLD_RECORDS.v1NoVisit], [{ ...OLD_RECORDS.v1NoVisit, field: {} }]);
  assert.equal(compareVerdict(r), "件数一致・元の項目は全部一致・追加：field");
});

test("compareWithExport: 無くなった記録・増えた記録・変わった項目を見つける", () => {
  const { compareWithExport, compareVerdict } = loadCore();
  const current = [
    { ...OLD_RECORDS.v1NoVisit, name: "改名" },                    // name が変わった
    (({ visit, ...rest }) => rest)(OLD_RECORDS.v1WithVisit),         // visit が無くなった
    clone(OLD_RECORDS.extraField),                                    // そのまま
    clone(V2_RECORD),                                                 // 今だけにある
  ];
  const r = compareWithExport(OLD, current);                          // emptyName は今は無い
  assert.equal(r.allSame, false);
  assert.deepEqual(r.missing, [OLD_RECORDS.emptyName.id]);
  assert.deepEqual(r.extra, [V2_RECORD.id]);
  assert.deepEqual(r.changed, [
    { id: OLD_RECORDS.v1NoVisit.id, name: "改名", fields: ["name"] },
    { id: OLD_RECORDS.v1WithVisit.id, name: "テスト神社B", fields: ["visit"] },
  ]);
  assert.equal(compareVerdict(r), "一致しません（下の内訳を見てください）");
});

test("compareWithExport: 入れ子の値の違い（visit の中の1項目）も見つける", () => {
  const { compareWithExport } = loadCore();
  const cur = clone(OLD_RECORDS.v1WithVisit);
  cur.visit.v_spot_torii_chk = false;
  assert.deepEqual(compareWithExport([OLD_RECORDS.v1WithVisit], [cur]).changed[0].fields, ["visit"]);
});
