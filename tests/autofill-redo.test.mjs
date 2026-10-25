// 5-5 「自動値を入れ直す」で使う値と、診断画面の天候の集計のテスト
// 記録はすべて架空（s_test… の id）。座標も架空（海の上）
import { test } from "node:test";
import assert from "node:assert/strict";
import { loadCore } from "./helpers.mjs";

const core = loadCore();
const TB = { early: "04:00", day: "07:00", evening: "16:00", night: "19:00" };
const NOW = new Date(2026, 9, 22, 10, 0, 0);
const visitAt = core.isoLocal(new Date(2026, 9, 21, 17, 30, 0)); // 前日の夕方（端末の時差で記録した文字）
const loc = { lat: 30.1, lon: 140.2, accuracyM: 10, status: "ok", fetchedAt: visitAt };
const okWeather = { code: 63, label: null, tempC: 15.4, precipitationMm: 1.2, source: "open-meteo", basis: "hourly", status: "ok" };
const fieldEntry = (over = {}, field = {}) => ({
  id: "s_test1", name: "テスト神社", checks: {}, visit: {}, updatedAt: 0, schemaVersion: 2, status: "final",
  field: { startedAt: visitAt, visitAt, location: loc, ...field },
  ...over,
});

test("autoFillValuesFor: 参拝日時から参拝日と時間帯、取れている天候を出す", () => {
  assert.deepEqual(core.autoFillValuesFor(fieldEntry({}, { weather: okWeather }), TB), {
    v_date: "2026-10-21", v_timeband: "夕方", v_weather: "雨 15℃ 降水1.2mm",
  });
});

test("autoFillValuesFor: 時間帯は今の設定の境界で決める", () => {
  assert.equal(core.autoFillValuesFor(fieldEntry(), { ...TB, evening: "18:00" }).v_timeband, "日中");
});

test("autoFillValuesFor: 天候が取れていなければ天候は出さない", () => {
  for (const weather of [undefined, { status: "pending" }, { status: "failed" }, { status: "manual", code: 1, tempC: 10 }]) {
    const v = core.autoFillValuesFor(fieldEntry({}, { weather }), TB);
    assert.equal("v_weather" in v, false, JSON.stringify(weather));
    assert.equal(v.v_date, "2026-10-21");
  }
});

test("autoFillValuesFor: 参拝日時が無い・読めない・現地モードの記録でなければ何も出さない", () => {
  assert.deepEqual(core.autoFillValuesFor(fieldEntry({}, { startedAt: undefined, visitAt: undefined }), TB), {});
  assert.deepEqual(core.autoFillValuesFor(fieldEntry({}, { startedAt: "きのう", visitAt: "きのう" }), TB), {});
  assert.deepEqual(core.autoFillValuesFor({ id: "s_test2", name: "テスト神社", checks: {}, visit: {}, updatedAt: 0 }, TB), {});
  // visitAt が無ければ startedAt を使う
  assert.equal(core.autoFillValuesFor(fieldEntry({}, { visitAt: undefined }), TB).v_date, "2026-10-21");
});

test("入れ直し: リセットの後（visit と autoFill が空）は全部入る", () => {
  const e = fieldEntry({}, { weather: okWeather });
  const plan = core.planAutoFill(e, core.autoFillValuesFor(e, TB), NOW);
  assert.deepEqual(plan.visit, { v_date: "2026-10-21", v_timeband: "夕方", v_weather: "雨 15℃ 降水1.2mm" });
  for (const k of ["v_date", "v_timeband", "v_weather"]) assert.equal(plan.autoFill[k].state, "auto");
});

test("入れ直し: 手入力の欄と、手で直した（manual）項目には入れない", () => {
  const e = fieldEntry({
    visit: { v_weather: "雨", v_timeband: "" },
    autoFill: { v_timeband: { value: "夕方", state: "manual", at: visitAt } },
  }, { weather: okWeather });
  const plan = core.planAutoFill(e, core.autoFillValuesFor(e, TB), NOW);
  assert.deepEqual(plan.visit, { v_date: "2026-10-21" });
});

test("summarizeWeather: 現地モードの記録だけを、状態と取り方ごとに数える", () => {
  const list = [
    fieldEntry({ id: "s_test_a" }, { weather: { ...okWeather, basis: "current" } }),
    fieldEntry({ id: "s_test_b" }, { weather: okWeather }),
    fieldEntry({ id: "s_test_c" }, { weather: { ...okWeather, basis: "archive" } }),
    fieldEntry({ id: "s_test_d" }, { weather: { status: "pending" } }),
    fieldEntry({ id: "s_test_e" }, { weather: { status: "failed" } }),
    fieldEntry({ id: "s_test_f" }, { weather: { status: "manual" } }),
    fieldEntry({ id: "s_test_g" }),
    fieldEntry({ id: "s_test_h" }, { weather: { status: "知らない状態" } }),
    { id: "s_test_plain", name: "テスト神社", checks: {}, visit: {}, updatedAt: 0 },
  ];
  assert.deepEqual(core.summarizeWeather(list), {
    visits: 8, ok: 3, current: 1, hourly: 1, archive: 1, pending: 1, failed: 1, manual: 1, none: 2,
  });
  assert.deepEqual(core.summarizeWeather([]), { visits: 0, ok: 0, current: 0, hourly: 0, archive: 0, pending: 0, failed: 0, manual: 0, none: 0 });
});
