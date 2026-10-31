// 6-3 写真ラベルからの自動チェック（planAutoCheck・autoChecksToUndo・autoChecks の1項目の unset）のテスト。記録はすべて架空
import { test } from "node:test";
import assert from "node:assert/strict";
import { loadCore } from "./helpers.mjs";

const core = loadCore();
const NOW = new Date(2026, 9, 31, 10, 0, 0);
const draft = (visit = {}, autoChecks) => ({
  id: "s_test0010jjjj", name: "テスト神社J", checks: {}, visit, updatedAt: 1700000000000,
  schemaVersion: 2, status: "draft", ...(autoChecks ? { autoChecks } : {}),
});

// ---------- ラベルを付けたとき ----------

test("planAutoCheck: 鳥居ラベル → 未チェックの鳥居に付け、写真の id と日時を残す", () => {
  const p = core.planAutoCheck(draft(), "torii", "m1", NOW);
  assert.equal(p.check, "v_spot_torii_chk");
  assert.equal(p.autoCheck.mediaId, "m1");
  assert.equal(p.autoCheck.at.slice(0, 19), "2026-10-31T10:00:00");
});

test("planAutoCheck: ラベル表のすべての対応先に付けられる（撮影チェック以外の欄も）", () => {
  for (const l of core.PHOTO_LABELS.filter(x => x.check)) {
    assert.equal(core.planAutoCheck(draft(), l.key, "m1", NOW).check, l.check, l.key);
  }
});

test("planAutoCheck: 手水舎・御朱印はどこにもチェックを付けない", () => {
  assert.equal(core.planAutoCheck(draft(), "temizuya", "m1", NOW), null);
  assert.equal(core.planAutoCheck(draft(), "goshuin", "m1", NOW), null);
});

test("planAutoCheck: ラベルを外した（null）・知らないラベルは何もしない", () => {
  assert.equal(core.planAutoCheck(draft(), null, "m1", NOW), null);
  assert.equal(core.planAutoCheck(draft(), "unknown", "m1", NOW), null);
});

test("planAutoCheck: 既に手でチェック済みなら記録しない（取り消しの対象にしない）", () => {
  assert.equal(core.planAutoCheck(draft({ v_spot_komainu_chk: true }), "komainu", "m1", NOW), null);
});

test("planAutoCheck: 別の写真で既に自動で付いていれば、最初の記録のまま", () => {
  const e = draft({ v_spot_torii_chk: true }, { v_spot_torii_chk: { mediaId: "m1", at: "2026-10-31T09:00:00+09:00" } });
  assert.equal(core.planAutoCheck(e, "torii", "m2", NOW), null);
});

test("planAutoCheck: 手で外したチェックには、もう一度ラベルを付けると付く", () => {
  assert.equal(core.planAutoCheck(draft({ v_spot_torii_chk: false }), "torii", "m1", NOW).check, "v_spot_torii_chk");
});

test("planAutoCheck: visit が無い古い形の記録でも付けられる", () => {
  const e = { id: "s_test0011kkkk", name: "テスト神社K", checks: {}, updatedAt: 1 };
  assert.equal(core.planAutoCheck(e, "haiden", "m1", NOW).check, "v_spot_haiden_chk");
});

// ---------- 取り消し ----------

test("autoChecksToUndo: 計画書の確認3。狛犬は手でチェック済み → 取り消すのは鳥居だけ", () => {
  let e = draft({ v_spot_komainu_chk: true });
  for (const [key, id] of [["torii", "m1"], ["komainu", "m2"]]) {
    const p = core.planAutoCheck(e, key, id, NOW);
    if (p) e = draft({ ...e.visit, [p.check]: true }, { ...(e.autoChecks || {}), [p.check]: p.autoCheck });
  }
  assert.deepEqual(core.autoChecksToUndo(e), ["v_spot_torii_chk"]);
});

test("autoChecksToUndo: 今チェックが外れている項目・自動の記録が無い記録は対象にしない", () => {
  const a = { mediaId: "m1", at: "2026-10-31T10:00:00+09:00" };
  assert.deepEqual(core.autoChecksToUndo(draft({ v_spot_torii_chk: false }, { v_spot_torii_chk: a })), []);
  assert.deepEqual(core.autoChecksToUndo(draft({ v_spot_torii_chk: true })), []);
  assert.deepEqual(core.autoChecksToUndo({ id: "s_test0011kkkk", name: "", checks: {}, updatedAt: 1 }), []);
});

test("autoChecksToUndo: ラベル表の順に並べ、表に無い項目は含めない", () => {
  const a = { mediaId: "m1", at: "2026-10-31T10:00:00+09:00" };
  const e = draft({ v_chk_juyohin: true, v_spot_torii_chk: true, v_chk_signage: true, v_x: true },
    { v_chk_juyohin: a, v_spot_torii_chk: a, v_chk_signage: a, v_x: a });
  assert.deepEqual(core.autoChecksToUndo(e), ["v_chk_signage", "v_spot_torii_chk", "v_chk_juyohin"]);
});

test("autoCheckName: チェックからラベルの表示名", () => {
  assert.equal(core.autoCheckName("v_spot_torii_chk"), "鳥居");
  assert.equal(core.autoCheckName("v_chk_signage"), "案内板・由緒書き");
  assert.equal(core.autoCheckName("v_x"), null);
});

// ---------- 保存（autoChecks から1項目だけ外す） ----------

test("applyChanges: unset に key があれば、その項目の中の key だけを取り除く", () => {
  const a = { mediaId: "m1", at: "2026-10-31T10:00:00+09:00" };
  const e = draft({ v_spot_torii_chk: true }, { v_spot_torii_chk: a, v_spot_haiden_chk: a });
  const [r] = core.applyChanges([JSON.parse(JSON.stringify(e))], [{ op: "unset", id: e.id, field: "autoChecks", key: "v_spot_torii_chk" }]);
  assert.deepEqual(r.autoChecks, { v_spot_haiden_chk: a });
  assert.deepEqual(r.visit, { v_spot_torii_chk: true }, "チェック自体は変えない");
});

test("applyChanges: key 付きの unset は、項目が無い・オブジェクトでない記録では何もしない", () => {
  const e = draft();
  const [r] = core.applyChanges([JSON.parse(JSON.stringify(e))], [{ op: "unset", id: e.id, field: "autoChecks", key: "v_spot_torii_chk" }]);
  assert.deepEqual(r, e);
});

test("applyChanges: 別の画面で付いた自動チェックの記録は、取り消した項目と別なら残る", () => {
  const a = { mediaId: "m1", at: "2026-10-31T10:00:00+09:00" };
  // 保存内容には、別の画面が付けた拝殿の記録が増えている
  const stored = draft({ v_spot_torii_chk: true, v_spot_haiden_chk: true }, { v_spot_torii_chk: a, v_spot_haiden_chk: a });
  const [r] = core.applyChanges([JSON.parse(JSON.stringify(stored))], [
    { op: "set", id: stored.id, field: "visit", key: "v_spot_torii_chk", value: false },
    { op: "unset", id: stored.id, field: "autoChecks", key: "v_spot_torii_chk" },
  ]);
  assert.deepEqual(r.visit, { v_spot_torii_chk: false, v_spot_haiden_chk: true });
  assert.deepEqual(r.autoChecks, { v_spot_haiden_chk: a });
});
