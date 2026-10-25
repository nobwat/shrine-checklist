// 5-4 取得待ちの天候をあとで取る（API の選び方・URL・hourly の読み方・取り直す記録の選び方）のテスト
// 座標はすべて架空（海の上など）。日時は時差付きで書き、テストを動かす端末の時差に左右されないようにする
import { test } from "node:test";
import assert from "node:assert/strict";
import { loadCore } from "./helpers.mjs";

const core = loadCore();
const NOW = new Date("2026-10-22T10:30:00+09:00");
const MIN = 60 * 1000;
const at = (min) => core.isoLocal(new Date(NOW.getTime() + min * MIN));
const pending = (over = {}, weather = { status: "pending", source: "open-meteo", lastTriedAt: at(-30) }) => ({
  id: "s_test1", name: "", checks: {}, visit: {}, updatedAt: 0, schemaVersion: 2, status: "draft",
  field: { startedAt: at(-120), visitAt: at(-120), location: { lat: 30.1, lon: 140.2, accuracyM: 10, status: "ok", fetchedAt: at(-120) }, weather },
  ...over,
});
const hourlyJson = (time, code, temp, precip) => ({
  hourly: { time, weather_code: code, temperature_2m: temp, precipitation: precip },
});

test("取り直しは10分あける。92日までは予報 API の past_days", () => {
  assert.equal(core.WEATHER_RETRY_GAP_MS, 10 * MIN);
  assert.equal(core.WEATHER_PAST_DAYS_MAX, 92);
});

test("hourlyUrl: 予報 API に hourly と past_days・forecast_days=1 を頼む", () => {
  const u = new URL(core.WEATHER_PROVIDER.hourlyUrl(30.12, 140.98, 3));
  assert.equal(u.origin + u.pathname, "https://api.open-meteo.com/v1/forecast");
  assert.equal(u.searchParams.get("latitude"), "30.12");
  assert.equal(u.searchParams.get("longitude"), "140.98");
  assert.equal(u.searchParams.get("hourly"), "weather_code,temperature_2m,precipitation");
  assert.equal(u.searchParams.get("past_days"), "3");
  assert.equal(u.searchParams.get("forecast_days"), "1");
  assert.equal(u.searchParams.get("timezone"), "Asia/Tokyo");
  assert.equal(u.searchParams.get("current"), null);
});

test("archiveUrl: archive API にその日1日分の hourly を頼む", () => {
  const u = new URL(core.WEATHER_PROVIDER.archiveUrl(30.12, 140.98, "2026-05-01"));
  assert.equal(u.origin + u.pathname, "https://archive-api.open-meteo.com/v1/archive");
  assert.equal(u.searchParams.get("start_date"), "2026-05-01");
  assert.equal(u.searchParams.get("end_date"), "2026-05-01");
  assert.equal(u.searchParams.get("hourly"), "weather_code,temperature_2m,precipitation");
  assert.equal(u.searchParams.get("timezone"), "Asia/Tokyo");
});

test("weatherPastRequest: 同じ日なら past_days=0、参拝した時の「時」の値を使う", () => {
  assert.deepEqual(core.weatherPastRequest("2026-10-22T08:59:59+09:00", NOW), { kind: "hourly", pastDays: 0, hour: "2026-10-22T08:00" });
  assert.deepEqual(core.weatherPastRequest("2026-10-21T23:10:00+09:00", NOW), { kind: "hourly", pastDays: 1, hour: "2026-10-21T23:00" });
});

test("weatherPastRequest: 日付と時刻は日本時間で数える（時差の違う書き方でも同じ）", () => {
  // 2026-10-21T15:10Z ＝ 日本時間 22日 0:10
  assert.deepEqual(core.weatherPastRequest("2026-10-21T15:10:00Z", NOW), { kind: "hourly", pastDays: 0, hour: "2026-10-22T00:00" });
  assert.deepEqual(core.weatherPastRequest("2026-10-21T14:50:00Z", NOW), { kind: "hourly", pastDays: 1, hour: "2026-10-21T23:00" });
});

test("weatherPastRequest: 92日目までは予報 API、93日目からは archive", () => {
  // 2026-10-22 の92日前は 2026-07-22
  assert.deepEqual(core.weatherPastRequest("2026-07-22T10:00:00+09:00", NOW), { kind: "hourly", pastDays: 92, hour: "2026-07-22T10:00" });
  assert.deepEqual(core.weatherPastRequest("2026-07-21T23:30:00+09:00", NOW), { kind: "archive", date: "2026-07-21", hour: "2026-07-21T23:00" });
  assert.deepEqual(core.weatherPastRequest("2025-01-05T06:00:00+09:00", NOW), { kind: "archive", date: "2025-01-05", hour: "2025-01-05T06:00" });
});

test("weatherPastRequest: 参拝日時が未来・読めないときは null（API を呼ばない）", () => {
  assert.equal(core.weatherPastRequest(at(5), NOW), null);
  assert.equal(core.weatherPastRequest("", NOW), null);
  assert.equal(core.weatherPastRequest(undefined, NOW), null);
  assert.equal(core.weatherPastRequest("きのう", NOW), null);
});

test("parseHourly: その時刻の値で記録を作る。basis と時刻を残す", () => {
  const json = hourlyJson(["2026-10-22T07:00", "2026-10-22T08:00", "2026-10-22T09:00"], [3, 63, 61], [12.1, 13.4, 14], [0, 1.24, 0.3]);
  const w = core.WEATHER_PROVIDER.parseHourly(json, "2026-10-22T08:00", "hourly", NOW);
  assert.deepEqual({ ...w, fetchedAt: w.fetchedAt.slice(0, 16), lastTriedAt: w.lastTriedAt.slice(0, 16) }, {
    code: 63, label: null, tempC: 13.4, precipitationMm: 1.24, source: "open-meteo", basis: "hourly", hour: "2026-10-22T08:00",
    status: "ok", fetchedAt: core.isoLocal(NOW).slice(0, 16), lastTriedAt: core.isoLocal(NOW).slice(0, 16),
  });
  assert.equal(core.weatherText(w), "雨 13℃ 降水1.2mm");
  assert.equal(core.WEATHER_PROVIDER.parseHourly(json, "2026-10-22T07:00", "archive", NOW).basis, "archive");
  // 降水量が無くても天気と気温があれば記録する
  const noPrecip = core.WEATHER_PROVIDER.parseHourly(hourlyJson(["2026-10-22T07:00"], [1], [10], [null]), "2026-10-22T07:00", "hourly", NOW);
  assert.equal(noPrecip.precipitationMm, null);
});

test("parseHourly: 時刻が無い・値が null（archive がまだ揃っていない）なら notYet の例外 → 取得待ちのまま", () => {
  const bads = [
    null, {}, { hourly: {} },
    hourlyJson(["2026-10-22T07:00"], [1], [10], [0]),                // 頼んだ時刻が無い
    hourlyJson(["2026-10-22T08:00"], [null], [null], [null]),        // archive の未確定
    hourlyJson(["2026-10-22T08:00"], [1], [null], [0]),
  ];
  for (const bad of bads) {
    let err = null;
    try { core.WEATHER_PROVIDER.parseHourly(bad, "2026-10-22T08:00", "archive", NOW); } catch (e) { err = e; }
    assert.ok(err && err.notYet, JSON.stringify(bad));
    assert.equal(core.weatherFailureStatus(err, true), "pending");
  }
});

test("weatherRetryTargets: 取得待ちで、前回から10分たったものを選ぶ", () => {
  const list = [
    pending({ id: "s_test_due" }),
    pending({ id: "s_test_recent" }, { status: "pending", lastTriedAt: at(-9) }),
    pending({ id: "s_test_10min" }, { status: "pending", lastTriedAt: at(-10) }),
    pending({ id: "s_test_never" }, { status: "pending" }),
    pending({ id: "s_test_ok" }, { code: 1, tempC: 18, status: "ok" }),
    pending({ id: "s_test_failed" }, { status: "failed", lastTriedAt: at(-60) }),
    { id: "s_test_plain", name: "テスト神社", checks: {}, visit: {}, updatedAt: 0 },
  ];
  assert.deepEqual(core.weatherRetryTargets(list, NOW), ["s_test_due", "s_test_10min", "s_test_never"]);
});

test("weatherRetryTargets: 参拝から1時間以内の取得待ち（機内モードで始めた）も選ぶ", () => {
  const e = pending({ id: "s_test_now" }, { status: "pending", lastTriedAt: at(-15) });
  e.field.visitAt = at(-20);
  assert.equal(core.weatherPlan(e, NOW), "current");
  assert.deepEqual(core.weatherRetryTargets([e], NOW), ["s_test_now"]);
});

test("weatherRetryTargets: 位置が無いものは選ばない。手入力済みは manual にするため10分以内でも選ぶ", () => {
  const noLoc = pending({ id: "s_test_noloc" });
  delete noLoc.field.location;
  const manual = pending({ id: "s_test_manual", visit: { v_weather: "雨" } }, { status: "pending", lastTriedAt: at(-1) });
  assert.deepEqual(core.weatherRetryTargets([noLoc, manual], NOW), ["s_test_manual"]);
});

test("weatherStatusText: 参拝時刻の値で取れたときは、そうと分かる文にする", () => {
  const e = pending({}, { code: 1, tempC: 18, precipitationMm: 0, status: "ok", basis: "hourly" });
  assert.equal(core.weatherStatusText(e, "done"), "天候：晴れ 18℃（参拝した時刻の値）");
  e.field.weather.basis = "archive";
  assert.equal(core.weatherStatusText(e, "done"), "天候：晴れ 18℃（参拝した時刻の値）");
  e.field.weather.basis = "current";
  assert.equal(core.weatherStatusText(e, "done"), "天候：晴れ 18℃");
});

test("archive の表記の文", () => {
  assert.equal(core.WEATHER_PROVIDER.archiveCredit, "Generated using Copernicus Climate Change Service information");
});
