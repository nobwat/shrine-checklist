// 5-3 天候（URL・応答の読み方・表示の文字・取るかどうか・失敗したときの状態）のテスト
// 座標はすべて架空（海の上など）
import { test } from "node:test";
import assert from "node:assert/strict";
import { loadCore } from "./helpers.mjs";

const core = loadCore();
const NOW = new Date(2026, 9, 22, 10, 0, 0);
const at = (min) => core.isoLocal(new Date(NOW.getTime() + min * 60 * 1000));
const draft = (over = {}) => ({
  id: "s_test1", name: "", checks: {}, visit: {}, updatedAt: 0, schemaVersion: 2, status: "draft",
  field: { startedAt: at(-5), visitAt: at(-5), location: { lat: 30.1, lon: 140.2, accuracyM: 10, status: "ok", fetchedAt: at(-5) } },
  ...over,
});

test("時間切れは10秒。現在の天候を使うのは参拝から1時間以内", () => {
  assert.equal(core.WEATHER_TIMEOUT_MS, 10000);
  assert.equal(core.WEATHER_CURRENT_MAX_MS, 60 * 60 * 1000);
});

test("currentUrl: 予報 API の current に、天気コード・気温・降水量を頼む", () => {
  const u = new URL(core.WEATHER_PROVIDER.currentUrl(30.12, 140.98));
  assert.equal(u.origin + u.pathname, "https://api.open-meteo.com/v1/forecast");
  assert.equal(u.searchParams.get("latitude"), "30.12");
  assert.equal(u.searchParams.get("longitude"), "140.98");
  assert.equal(u.searchParams.get("current"), "weather_code,temperature_2m,precipitation");
  assert.equal(u.searchParams.get("timezone"), "Asia/Tokyo");
});

test("roundCoordForApi: 丸める設定なら小数2桁、丸めない設定ならそのまま", () => {
  assert.equal(core.roundCoordForApi(30.123456, true), 30.12);
  assert.equal(core.roundCoordForApi(140.987654, true), 140.99);
  assert.equal(core.roundCoordForApi(-33.456789, true), -33.46);
  assert.equal(core.roundCoordForApi(30.123456, false), 30.123456);
});

test("parseCurrent: 応答から記録を作る。label は null（表示のときに変換表から作る）", () => {
  const w = core.WEATHER_PROVIDER.parseCurrent({ current: { weather_code: 1, temperature_2m: 18.2, precipitation: 0 } }, NOW);
  assert.deepEqual({ ...w, fetchedAt: w.fetchedAt.slice(0, 19), lastTriedAt: w.lastTriedAt.slice(0, 19) }, {
    code: 1, label: null, tempC: 18.2, precipitationMm: 0, source: "open-meteo", basis: "current", status: "ok",
    fetchedAt: "2026-10-22T10:00:00", lastTriedAt: "2026-10-22T10:00:00",
  });
  assert.equal(core.WEATHER_PROVIDER.parseCurrent({ current: { weather_code: 3, temperature_2m: 5 } }, NOW).precipitationMm, null);
});

test("parseCurrent: 天気コードか気温が無ければ例外（記録しない）", () => {
  for (const bad of [null, {}, { current: {} }, { current: { weather_code: 1 } }, { current: { temperature_2m: 10 } }, { current: { weather_code: "1", temperature_2m: 10 } }]) {
    assert.throws(() => core.WEATHER_PROVIDER.parseCurrent(bad, NOW));
  }
});

test("weatherLabel: WMO コードの変換表。知らないコードは番号を出す", () => {
  assert.equal(core.weatherLabel(0), "快晴");
  assert.equal(core.weatherLabel(1), "晴れ");
  assert.equal(core.weatherLabel(2), "晴れ時々曇り");
  assert.equal(core.weatherLabel(3), "曇り");
  assert.equal(core.weatherLabel(48), "霧");
  assert.equal(core.weatherLabel(63), "雨");
  assert.equal(core.weatherLabel(75), "大雪");
  assert.equal(core.weatherLabel(81), "にわか雨（並）");
  assert.equal(core.weatherLabel(99), "雷雨（ひょう）");
  assert.equal(core.weatherLabel(42), "天気コード42");
});

test("weatherText: 「晴れ 18℃」、降水があれば「雨 15℃ 降水1.2mm」", () => {
  assert.equal(core.weatherText({ code: 1, tempC: 18.2, precipitationMm: 0 }), "晴れ 18℃");
  assert.equal(core.weatherText({ code: 63, tempC: 15.4, precipitationMm: 1.24 }), "雨 15℃ 降水1.2mm");
  assert.equal(core.weatherText({ code: 3, tempC: -0.4, precipitationMm: null }), "曇り 0℃");
  assert.equal(core.weatherText({ code: 71, tempC: -3.6, precipitationMm: 0.5 }), "小雪 -4℃ 降水0.5mm");
  assert.equal(core.weatherText({ status: "manual", label: "雨" }), "雨");
  assert.equal(core.weatherText({ status: "pending" }), "");
  assert.equal(core.weatherText(null), "");
});

test("weatherPlan: 参拝から1時間以内で位置があれば、今の天候を取る", () => {
  assert.equal(core.weatherPlan(draft(), NOW), "current");
  const manualLoc = draft();
  manualLoc.field.location = { lat: 30.1, lon: 140.2, accuracyM: null, status: "manual", fetchedAt: at(0) };
  assert.equal(core.weatherPlan(manualLoc, NOW), "current");
});

test("weatherPlan: 位置が無い・拒否されたときは取れない", () => {
  const e = draft();
  delete e.field.location;
  assert.equal(core.weatherPlan(e, NOW), "no-location");
  e.field.location = { status: "denied", fetchedAt: at(0) };
  assert.equal(core.weatherPlan(e, NOW), "no-location");
});

test("weatherPlan: 参拝から1時間を超えたら、あとで参拝時刻の値を取る", () => {
  const e = draft();
  e.field.visitAt = at(-61);
  assert.equal(core.weatherPlan(e, NOW), "later");
  e.field.visitAt = at(-60);
  assert.equal(core.weatherPlan(e, NOW), "current");
});

test("weatherPlan: 取得済みなら取らない", () => {
  const e = draft();
  e.field.weather = { code: 1, tempC: 18, status: "ok" };
  assert.equal(core.weatherPlan(e, NOW), "done");
  e.field.weather = { status: "pending" };
  assert.equal(core.weatherPlan(e, NOW), "current");
});

test("weatherPlan: 天候を手で入れていれば取らない（既存の神社の手入力・自動の値を手で直したとき）", () => {
  assert.equal(core.weatherPlan(draft({ visit: { v_weather: "雨" } }), NOW), "manual");
  const fixed = draft({ visit: { v_weather: "曇り" }, autoFill: { v_weather: { value: "晴れ 18℃", state: "manual", at: at(0) } } });
  assert.equal(core.weatherPlan(fixed, NOW), "manual");
  // 手で直してから空欄に戻しても、自動では入れない
  const cleared = draft({ visit: { v_weather: "" }, autoFill: { v_weather: { value: "晴れ 18℃", state: "manual", at: at(0) } } });
  assert.equal(core.weatherPlan(cleared, NOW), "manual");
  // 自動で入れた値のままなら手入力ではない
  const auto = draft({ visit: { v_weather: "晴れ 18℃" }, autoFill: { v_weather: { value: "晴れ 18℃", state: "auto", at: at(0) } } });
  assert.equal(core.isManualWeather(auto), false);
  assert.equal(core.isManualWeather(draft({ visit: { v_weather: "  " } })), false);
});

test("取得に成功したら、天候の欄が空なら自動で入る。手で入れた欄には入らない", () => {
  const w = core.WEATHER_PROVIDER.parseCurrent({ current: { weather_code: 1, temperature_2m: 18.2, precipitation: 0 } }, NOW);
  const plan = core.planAutoFill(draft(), { v_weather: core.weatherText(w) }, NOW);
  assert.deepEqual(plan.visit, { v_weather: "晴れ 18℃" });
  assert.equal(plan.autoFill.v_weather.state, "auto");
  assert.deepEqual(core.planAutoFill(draft({ visit: { v_weather: "雨" } }), { v_weather: "晴れ 18℃" }, NOW).visit, {});
});

test("weatherFailureStatus: 通信できない・時間切れ・混雑はあとで取り直す。それ以外は失敗", () => {
  assert.equal(core.weatherFailureStatus(new Error("x"), false), "pending");
  assert.equal(core.weatherFailureStatus(Object.assign(new Error("x"), { name: "AbortError" }), true), "pending");
  assert.equal(core.weatherFailureStatus(new TypeError("Failed to fetch"), true), "pending");
  assert.equal(core.weatherFailureStatus(Object.assign(new Error("x"), { httpStatus: 429 }), true), "pending");
  assert.equal(core.weatherFailureStatus(Object.assign(new Error("x"), { httpStatus: 503 }), true), "pending");
  assert.equal(core.weatherFailureStatus(Object.assign(new Error("x"), { httpStatus: 400 }), true), "failed");
  assert.equal(core.weatherFailureStatus(new Error("天候の応答に必要な値がありません"), true), "failed");
});

test("weatherAfterFailure: 前に取れた天候は残す。無ければ状態と試した日時を記録する", () => {
  assert.equal(core.weatherAfterFailure({ code: 1, tempC: 18, status: "ok" }, "pending", NOW), null);
  const w = core.weatherAfterFailure(null, "pending", NOW);
  assert.deepEqual({ ...w, lastTriedAt: w.lastTriedAt.slice(0, 19) }, { status: "pending", source: "open-meteo", lastTriedAt: "2026-10-22T10:00:00" });
  assert.equal(core.weatherAfterFailure({ status: "pending" }, "failed", NOW).status, "failed");
});

test("weatherStatusText: 現地モードに出す文", () => {
  const ok = draft();
  ok.field.weather = { code: 63, tempC: 15, precipitationMm: 1.2, status: "ok" };
  assert.equal(core.weatherStatusText(ok, "done"), "天候：雨 15℃ 降水1.2mm");
  const pending = draft();
  pending.field.weather = { status: "pending" };
  assert.match(core.weatherStatusText(pending, "current"), /^天候：取得待ち/);
  assert.match(core.weatherStatusText(pending, "later"), /あとで取得/);
  const failed = draft();
  failed.field.weather = { status: "failed" };
  assert.match(core.weatherStatusText(failed, "current"), /取得できませんでした/);
  assert.match(core.weatherStatusText(draft(), "no-location"), /位置が分からない/);
  assert.equal(core.weatherStatusText(draft({ visit: { v_weather: "雨" } }), "manual"), "天候：手入力（雨）");
  assert.equal(core.weatherStatusText(draft(), "current"), "天候：まだ取得していません");
});
