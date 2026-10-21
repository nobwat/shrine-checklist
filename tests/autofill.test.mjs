// 5-1 時間帯の判定と、自動で入れる値の規則（autoFill・「自動」バッジ）のテスト
import { test } from "node:test";
import assert from "node:assert/strict";
import { loadCore } from "./helpers.mjs";

const core = loadCore();
const TB = core.TIMEBANDS_DEFAULT;
const at = (h, m = 0) => new Date(2026, 9, 21, h, m, 0);
const NOW = at(10, 30);

// ---------- 時間帯 ----------

test("既定の境界は 早朝04:00・日中07:00・夕方16:00・夜19:00（計画書 3.5）", () => {
  assert.deepEqual(TB, { early: "04:00", day: "07:00", evening: "16:00", night: "19:00" });
  assert.deepEqual(core.TIMEBAND_LABELS, { early: "早朝", day: "日中", evening: "夕方", night: "夜" });
});

test("timebandOf: 境界ちょうどは、その時間帯に入る", () => {
  assert.equal(core.timebandOf(at(4, 0), TB), "早朝");
  assert.equal(core.timebandOf(at(7, 0), TB), "日中");
  assert.equal(core.timebandOf(at(16, 0), TB), "夕方");
  assert.equal(core.timebandOf(at(19, 0), TB), "夜");
});

test("timebandOf: 境界の1分前は、前の時間帯", () => {
  assert.equal(core.timebandOf(at(6, 59), TB), "早朝");
  assert.equal(core.timebandOf(at(15, 59), TB), "日中");
  assert.equal(core.timebandOf(at(18, 59), TB), "夕方");
  assert.equal(core.timebandOf(at(3, 59), TB), "夜", "夜は日をまたいで早朝の始まりまで");
});

test("timebandOf: 夜は日をまたぐ（23時・0時・2時）", () => {
  assert.equal(core.timebandOf(at(23, 30), TB), "夜");
  assert.equal(core.timebandOf(at(0, 0), TB), "夜");
  assert.equal(core.timebandOf(at(2, 15), TB), "夜");
});

test("timebandOf: 設定で夕方の始まりを17:00にすると、16:30は日中になる（計画書 STEP 5 の確認7）", () => {
  const tb = { ...TB, evening: "17:00" };
  assert.equal(core.timebandOf(at(16, 30), tb), "日中");
  assert.equal(core.timebandOf(at(17, 0), tb), "夕方");
});

test("parseHHMM: 時刻を分に。読めなければ null", () => {
  assert.equal(core.parseHHMM("07:00"), 420);
  assert.equal(core.parseHHMM("23:59"), 1439);
  assert.equal(core.parseHHMM("00:00"), 0);
  for (const bad of ["7:00", "24:00", "12:60", "", undefined, "0700"]) assert.equal(core.parseHHMM(bad), null, String(bad));
});

test("timebandsProblem: 早朝→日中→夕方→夜の順に並んでいれば null", () => {
  assert.equal(core.timebandsProblem(TB), null);
  assert.equal(core.timebandsProblem({ early: "00:00", day: "00:01", evening: "23:58", night: "23:59" }), null);
  assert.match(core.timebandsProblem({ ...TB, day: "04:00" }), /日中の始まりは、早朝の始まりより後/);
  assert.match(core.timebandsProblem(null), /形式/);
  assert.match(core.timebandsProblem({ early: "04:00" }), /日中の始まりの時刻が読めません/);
});

// ---------- 自動で入れる値 ----------

const entry = (visit = {}, autoFill) => ({ id: "s_test", visit, ...(autoFill ? { autoFill } : {}) });

test("planAutoFill: 空欄の項目にだけ入れ、autoFill に「auto」で記録する", () => {
  const plan = core.planAutoFill(entry({ v_weather: "" }), { v_date: "2026-10-21", v_timeband: "日中", v_weather: "晴れ 18℃" }, NOW);
  const a = core.isoLocal(NOW);
  assert.deepEqual(plan, {
    visit: { v_date: "2026-10-21", v_timeband: "日中", v_weather: "晴れ 18℃" },
    autoFill: { v_date: { value: "2026-10-21", state: "auto", at: a }, v_timeband: { value: "日中", state: "auto", at: a }, v_weather: { value: "晴れ 18℃", state: "auto", at: a } },
  });
});

test("planAutoFill: 手で入れてある項目には入れない（計画書の完了条件6）", () => {
  const plan = core.planAutoFill(entry({ v_weather: "雨", v_timeband: "夜" }), { v_date: "2026-10-21", v_timeband: "日中", v_weather: "晴れ 18℃" }, NOW);
  assert.deepEqual(Object.keys(plan.visit), ["v_date"]);
  assert.deepEqual(Object.keys(plan.autoFill), ["v_date"]);
});

test("planAutoFill: 一度手で直した（manual）項目には、空欄に戻しても二度と入れない", () => {
  const plan = core.planAutoFill(entry({ v_weather: "" }, { v_weather: { value: "晴れ 18℃", state: "manual", at: "x" } }), { v_weather: "曇り 15℃" }, NOW);
  assert.deepEqual(plan, { visit: {}, autoFill: {} });
});

test("planAutoFill: 入れる値が空なら入れない", () => {
  assert.deepEqual(core.planAutoFill(entry(), { v_weather: "", v_date: null }, NOW), { visit: {}, autoFill: {} });
});

test("planAutoFill: 空白だけの欄は空欄とみなし、visit が無い古い記録にも入れられる", () => {
  assert.deepEqual(Object.keys(core.planAutoFill(entry({ v_weather: "  " }), { v_weather: "晴れ" }, NOW).visit), ["v_weather"]);
  assert.deepEqual(Object.keys(core.planAutoFill({ id: "s_old" }, { v_date: "2026-10-21" }, NOW).visit), ["v_date"]);
});

test("isAutoValue: 値が自動で入れた値のままで、state が auto のときだけ「自動」", () => {
  const af = { v_weather: { value: "晴れ 18℃", state: "auto", at: "x" } };
  assert.equal(core.isAutoValue(entry({ v_weather: "晴れ 18℃" }, af), "v_weather"), true);
  assert.equal(core.isAutoValue(entry({ v_weather: "晴れ 18℃、風あり" }, af), "v_weather"), false, "古い版のアプリで直された");
  assert.equal(core.isAutoValue(entry({ v_weather: "晴れ 18℃" }, { v_weather: { ...af.v_weather, state: "manual" } }), "v_weather"), false, "手で直した");
  assert.equal(core.isAutoValue(entry({ v_weather: "晴れ 18℃" }), "v_weather"), false, "autoFill が無い");
  assert.equal(core.isAutoValue(entry({}, af), "v_weather"), false, "リセットで空になった");
});

test("自動で入れる項目は 参拝日・時間帯・天候", () => {
  assert.deepEqual(core.AUTO_FILL_KEYS, ["v_date", "v_timeband", "v_weather"]);
});
