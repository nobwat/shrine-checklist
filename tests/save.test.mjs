// 3-1 差分保存（applyChanges・commitChanges）のテスト
import { test } from "node:test";
import assert from "node:assert/strict";
import { FakeStorage, loadCore, OLD_RECORDS } from "./helpers.mjs";

const clone = (v) => JSON.parse(JSON.stringify(v));
const stored = (core) => JSON.parse(core.storage.getItem(core.STORAGE_KEY));

// 架空の記録を保存した状態から始める
function setup(records = Object.values(OLD_RECORDS), quota) {
  const core = loadCore(new FakeStorage(quota));
  core.storage.setItem(core.STORAGE_KEY, JSON.stringify(records));
  return core;
}
const set = (id, field, key, value) => ({ op: "set", id, field, key, value });

test("applyChanges: 追加は末尾に足し、同じ id は二重に足さない", () => {
  const { applyChanges } = loadCore();
  const e = { id: "s_new", name: "", checks: {}, visit: {}, updatedAt: 1 };
  const list = applyChanges([clone(OLD_RECORDS.v1NoVisit)], [{ op: "add", entry: e }, { op: "add", entry: e }]);
  assert.deepEqual(list.map(x => x.id), [OLD_RECORDS.v1NoVisit.id, "s_new"]);
});

test("applyChanges: 削除。無い id の削除は何もしない", () => {
  const { applyChanges } = loadCore();
  const list = applyChanges(clone(Object.values(OLD_RECORDS)), [{ op: "delete", id: OLD_RECORDS.emptyName.id }, { op: "delete", id: "s_none" }]);
  assert.deepEqual(list.map(x => x.id), [OLD_RECORDS.v1NoVisit.id, OLD_RECORDS.v1WithVisit.id, OLD_RECORDS.extraField.id]);
});

test("applyChanges: visit が無い古い記録にも項目を書ける", () => {
  const { applyChanges } = loadCore();
  const [e] = applyChanges([clone(OLD_RECORDS.v1NoVisit)], [set(OLD_RECORDS.v1NoVisit.id, "visit", "v_date", "2026-10-21")]);
  assert.deepEqual(e.visit, { v_date: "2026-10-21" });
});

test("applyChanges: replace はその項目を丸ごと置き換える", () => {
  const { applyChanges } = loadCore();
  const id = OLD_RECORDS.v1WithVisit.id;
  const [e] = applyChanges([clone(OLD_RECORDS.v1WithVisit)], [{ op: "replace", id, field: "visit", value: {} }]);
  assert.deepEqual(e.visit, {});
  assert.deepEqual(e.checks, {});
});

test("applyChanges: updatedAt は新しい方を残す", () => {
  const { applyChanges } = loadCore();
  const id = OLD_RECORDS.v1NoVisit.id;
  assert.equal(applyChanges([clone(OLD_RECORDS.v1NoVisit)], [set(id, "updatedAt", undefined, 1)])[0].updatedAt, 1700000000000);
  assert.equal(applyChanges([clone(OLD_RECORDS.v1NoVisit)], [set(id, "updatedAt", undefined, 1800000000000)])[0].updatedAt, 1800000000000);
});

test("applyChanges: 削除済みの記録への変更は捨てる", () => {
  const { applyChanges } = loadCore();
  const list = applyChanges([], [set("s_gone", "name", undefined, "x"), { op: "replace", id: "s_gone", field: "visit", value: {} }]);
  assert.deepEqual(list, []);
});

test("applyChanges: 変えていない項目・知らない項目はそのまま残る", () => {
  const { applyChanges } = loadCore();
  const id = OLD_RECORDS.extraField.id;
  const [e] = applyChanges([clone(OLD_RECORDS.extraField)], [set(id, "name", undefined, "改名")]);
  assert.deepEqual(e, { ...OLD_RECORDS.extraField, name: "改名" });
});

test("commitChanges: 保存内容が無い状態から追加できる", () => {
  const core = loadCore();
  const e = { id: "s_new", name: "", checks: {}, visit: {}, updatedAt: 1 };
  const r = core.commitChanges([{ op: "add", entry: e }], null);
  assert.equal(r.ok, true);
  assert.equal(r.othersChanged, false);
  assert.deepEqual(stored(core), [e]);
});

test("2つの画面：同じ記録の別の項目を変えると、両方残る", () => {
  const core = setup();
  const start = core.storage.getItem(core.STORAGE_KEY);
  const id = OLD_RECORDS.v1WithVisit.id;
  const a = core.commitChanges([set(id, "visit", "v_weather", "晴れ")], start);
  const b = core.commitChanges([set(id, "checks", "b1", true)], start);
  assert.equal(a.othersChanged, false);
  assert.equal(b.othersChanged, true);
  const e = stored(core).find(x => x.id === id);
  assert.equal(e.visit.v_weather, "晴れ");
  assert.equal(e.visit.v_date, "2026-01-02");
  assert.equal(e.checks.b1, true);
});

test("2つの画面：別の記録を変えると、両方残る", () => {
  const core = setup();
  const start = core.storage.getItem(core.STORAGE_KEY);
  core.commitChanges([set(OLD_RECORDS.v1NoVisit.id, "name", undefined, "A改")], start);
  core.commitChanges([set(OLD_RECORDS.emptyName.id, "name", undefined, "C改")], start);
  const names = stored(core).map(x => x.name);
  assert.deepEqual(names, ["A改", "テスト神社B", "C改", "テスト神社D"]);
});

test("2つの画面：片方が追加、もう片方が削除しても、両方反映される", () => {
  const core = setup();
  const start = core.storage.getItem(core.STORAGE_KEY);
  const e = { id: "s_new", name: "新", checks: {}, visit: {}, updatedAt: 1 };
  core.commitChanges([{ op: "add", entry: e }], start);
  core.commitChanges([{ op: "delete", id: OLD_RECORDS.v1NoVisit.id }], start);
  assert.deepEqual(stored(core).map(x => x.id), [OLD_RECORDS.v1WithVisit.id, OLD_RECORDS.emptyName.id, OLD_RECORDS.extraField.id, "s_new"]);
});

test("2つの画面：同じ項目は、後から保存した方になる", () => {
  const core = setup();
  const start = core.storage.getItem(core.STORAGE_KEY);
  const id = OLD_RECORDS.v1WithVisit.id;
  core.commitChanges([set(id, "visit", "v_weather", "晴れ")], start);
  core.commitChanges([set(id, "visit", "v_weather", "雨")], start);
  assert.equal(stored(core).find(x => x.id === id).visit.v_weather, "雨");
});

test("2つの画面：片方が削除した記録に、もう片方が書いても復活しない", () => {
  const core = setup();
  const start = core.storage.getItem(core.STORAGE_KEY);
  const id = OLD_RECORDS.v1NoVisit.id;
  core.commitChanges([{ op: "delete", id }], start);
  core.commitChanges([set(id, "name", undefined, "編集")], start);
  assert.equal(stored(core).some(x => x.id === id), false);
});

test("commitChanges: 保存内容が読めなければ書かない", () => {
  const core = loadCore();
  core.storage.setItem(core.STORAGE_KEY, "{壊れたJSON");
  const r = core.commitChanges([{ op: "add", entry: { id: "s_new" } }], null);
  assert.equal(r.ok, false);
  assert.equal(core.storage.getItem(core.STORAGE_KEY), "{壊れたJSON");
});

test("commitChanges: 形式が正しくない保存内容にも書かない", () => {
  const core = loadCore();
  const bad = JSON.stringify([{ name: "id が無い" }]);
  core.storage.setItem(core.STORAGE_KEY, bad);
  const r = core.commitChanges([{ op: "delete", id: "x" }], null);
  assert.equal(r.ok, false);
  assert.equal(core.storage.getItem(core.STORAGE_KEY), bad);
});

test("commitChanges: 容量不足なら例外になり、保存内容は変わらない", () => {
  const records = Object.values(OLD_RECORDS);
  const before = JSON.stringify(records);
  const core = setup(records, "shrine-entries-offline".length + before.length + 10);
  const id = OLD_RECORDS.v1NoVisit.id;
  assert.throws(() => core.commitChanges([set(id, "name", undefined, "とても長い名前".repeat(20))], before), { name: "QuotaExceededError" });
  assert.equal(core.storage.getItem(core.STORAGE_KEY), before);
});

test("1つの記録を変えても、他の古い形の記録は1文字も変わらない", () => {
  const core = setup();
  const start = core.storage.getItem(core.STORAGE_KEY);
  core.commitChanges([set(OLD_RECORDS.extraField.id, "name", undefined, "改")], start);
  const after = stored(core);
  for (const key of ["v1NoVisit", "v1WithVisit", "emptyName"]) {
    assert.equal(JSON.stringify(after.find(x => x.id === OLD_RECORDS[key].id)), JSON.stringify(OLD_RECORDS[key]));
  }
});
