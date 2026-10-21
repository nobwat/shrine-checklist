// 5-2 位置（取得の条件・エラーの状態・手入力・失敗したときの残し方・表示）のテスト
// 座標はすべて架空（実在の誰かの場所ではない、海の上など）
import { test } from "node:test";
import assert from "node:assert/strict";
import { loadCore } from "./helpers.mjs";

const core = loadCore();
const NOW = new Date(2026, 9, 21, 10, 0, 0);
const pos = (lat, lon, accuracy) => ({ coords: { latitude: lat, longitude: lon, accuracy } });

test("取得の条件：高精度・15秒で時間切れ・1分以内の値は使い回す。アプリ側は20秒で打ち切る", () => {
  assert.deepEqual({ ...core.GEO_OPTIONS }, { enableHighAccuracy: true, timeout: 15000, maximumAge: 60000 });
  assert.equal(core.GEO_APP_TIMEOUT_MS, 20000);
  assert.equal(core.GEO_COARSE_M, 100);
});

test("geoErrorStatus: 1 → 拒否、3 → 時間切れ、2・それ以外・API なし → 使えない", () => {
  assert.equal(core.geoErrorStatus({ code: 1 }), "denied");
  assert.equal(core.geoErrorStatus({ code: 3 }), "timeout");
  assert.equal(core.geoErrorStatus({ code: 2 }), "unavailable");
  assert.equal(core.geoErrorStatus(new Error("x")), "unavailable");
  assert.equal(core.geoErrorStatus(undefined), "unavailable");
});

test("locationFromPosition: 端末の中の記録は丸めない。精度は m の整数", () => {
  const loc = core.locationFromPosition(pos(30.123456789, 140.987654321, 12.7), NOW);
  assert.deepEqual({ ...loc, fetchedAt: loc.fetchedAt.slice(0, 19) }, {
    lat: 30.123456789, lon: 140.987654321, accuracyM: 13, status: "ok", fetchedAt: "2026-10-21T10:00:00",
  });
  assert.equal(core.locationFromPosition(pos(30, 140, undefined), NOW).accuracyM, null);
});

test("parseManualLocation: 2つの欄、または「緯度, 経度」を1つの欄に貼ったもの", () => {
  assert.deepEqual(core.parseManualLocation("30.12345", "140.98765"), { lat: 30.12345, lon: 140.98765 });
  assert.deepEqual(core.parseManualLocation(" 30.12345, 140.98765 ", ""), { lat: 30.12345, lon: 140.98765 });
  assert.deepEqual(core.parseManualLocation("-33.5", "-70"), { lat: -33.5, lon: -70 });
});

test("parseManualLocation: 全角の数字・読点も読む", () => {
  assert.deepEqual(core.parseManualLocation("３０．５、１４０．２５", ""), { lat: 30.5, lon: 140.25 });
});

test("parseManualLocation: 数字でない・範囲外は理由を返す", () => {
  assert.match(core.parseManualLocation("", "").error, /数字で/);
  assert.match(core.parseManualLocation("北緯30度", "140").error, /数字で/);
  assert.match(core.parseManualLocation("91", "140").error, /緯度は -90 から 90/);
  assert.match(core.parseManualLocation("30", "181").error, /経度は -180 から 180/);
});

test("manualLocation: 状態は manual、精度は無し", () => {
  const m = core.manualLocation(30.5, 140.25, NOW);
  assert.deepEqual({ ...m, fetchedAt: undefined }, { lat: 30.5, lon: 140.25, accuracyM: null, status: "manual", fetchedAt: undefined });
});

test("locationAfterFailure: まだ位置が無ければ、失敗の状態を記録する", () => {
  const r = core.locationAfterFailure(undefined, "denied", NOW);
  assert.equal(r.status, "denied");
  assert.equal(core.hasCoords(r), false);
  assert.equal(core.locationAfterFailure({ status: "timeout" }, "denied", NOW).status, "denied", "前も失敗なら新しい状態にする");
});

test("locationAfterFailure: 前に取れた位置（取得・手入力）があれば、失敗しても消さない（null）", () => {
  assert.equal(core.locationAfterFailure(core.locationFromPosition(pos(30, 140, 10), NOW), "timeout", NOW), null);
  assert.equal(core.locationAfterFailure(core.manualLocation(30, 140, NOW), "denied", NOW), null);
});

test("isCoarseLocation: 精度が100mを超えたら粗い（ちょうど100mは粗くない）。手入力は対象外", () => {
  assert.equal(core.isCoarseLocation(core.locationFromPosition(pos(30, 140, 100), NOW)), false);
  assert.equal(core.isCoarseLocation(core.locationFromPosition(pos(30, 140, 101), NOW)), true);
  assert.equal(core.isCoarseLocation(core.manualLocation(30, 140, NOW)), false);
  assert.equal(core.isCoarseLocation(undefined), false);
});

test("locationText: 状態ごとの表示", () => {
  assert.equal(core.locationText(undefined), "位置：まだ取得していません");
  assert.equal(core.locationText(core.locationFromPosition(pos(30.123456789, 140.98765, 12), NOW)), "位置：30.12346, 140.98765（精度12m）");
  assert.equal(core.locationText(core.locationFromPosition(pos(30, 140, 350), NOW)), "位置：30.00000, 140.00000（精度350m）　位置が粗いです");
  assert.equal(core.locationText(core.manualLocation(30.5, 140.25, NOW)), "位置：30.50000, 140.25000（手入力）");
  assert.equal(core.locationText({ status: "denied" }), "位置：使用が許可されていません");
  assert.equal(core.locationText({ status: "timeout" }), "位置：時間内に取得できませんでした");
  assert.equal(core.locationText({ status: "unavailable" }), "位置：この端末・場所では取得できませんでした");
});
