// 4-5 設定（shrine-settings）と残り容量の警告のテスト
import { test } from "node:test";
import assert from "node:assert/strict";
import { FakeStorage, loadCore } from "./helpers.mjs";

const MB = 1024 * 1024;
const GB = 1024 * MB;
const stored = (core) => JSON.parse(core.storage.getItem(core.SETTINGS_KEY));

// ---------- 読む ----------

test("readSettings: 保存されていなければ既定値（写真2048・録音3分）", () => {
  const core = loadCore();
  assert.equal(core.SETTINGS_KEY, "shrine-settings");
  assert.deepEqual(core.readSettings(), { photoMaxEdge: 2048, audioMaxSec: 180 });
  assert.equal(core.storage.getItem(core.SETTINGS_KEY), null, "読むだけでは書かない");
});

test("readSettings: 壊れた JSON・配列・知らない値は既定値で補う", () => {
  for (const raw of ["{壊れた", "[1,2]", "null", JSON.stringify({ photoMaxEdge: 999, audioMaxSec: "180" })]) {
    const core = loadCore();
    core.storage.setItem(core.SETTINGS_KEY, raw);
    assert.deepEqual(core.readSettings(), { photoMaxEdge: 2048, audioMaxSec: 180 }, raw);
  }
});

test("readSettings: 選べる値はそのまま読む", () => {
  const core = loadCore();
  core.storage.setItem(core.SETTINGS_KEY, JSON.stringify({ photoMaxEdge: "max", audioMaxSec: 600 }));
  assert.deepEqual(core.readSettings(), { photoMaxEdge: "max", audioMaxSec: 600 });
});

test("normalizeSettings: STEP 5 で足す項目など、知らない項目は消さずに残す", () => {
  const core = loadCore();
  const tb = { early: "04:00", day: "07:00", evening: "16:00", night: "19:00" };
  assert.deepEqual(core.normalizeSettings({ timebands: tb, roundLocationForApi: true, photoMaxEdge: 1600 }),
    { timebands: tb, roundLocationForApi: true, photoMaxEdge: 1600, audioMaxSec: 180 });
});

// ---------- 書く ----------

test("writeSettings: 選べる値なら保存し、ほかの項目は残す", () => {
  const core = loadCore();
  core.storage.setItem(core.SETTINGS_KEY, JSON.stringify({ roundLocationForApi: false, audioMaxSec: 300 }));
  core.writeSettings({ photoMaxEdge: 1600 });
  assert.deepEqual(stored(core), { roundLocationForApi: false, audioMaxSec: 300, photoMaxEdge: 1600 });
  core.writeSettings({ photoMaxEdge: "max", audioMaxSec: 60 });
  assert.deepEqual(core.readSettings(), { roundLocationForApi: false, audioMaxSec: 60, photoMaxEdge: "max" });
});

test("writeSettings: 選べない値は例外にして、何も書かない", () => {
  const core = loadCore();
  core.writeSettings({ audioMaxSec: 300 });
  const before = core.storage.getItem(core.SETTINGS_KEY);
  assert.throws(() => core.writeSettings({ photoMaxEdge: 4000 }), /写真の大きさ/);
  assert.throws(() => core.writeSettings({ photoMaxEdge: "2048" }), /写真の大きさ/);
  assert.throws(() => core.writeSettings({ audioMaxSec: 120 }), /録音の上限/);
  assert.throws(() => core.writeSettings({ photoMaxEdge: 1600, audioMaxSec: 0 }), /録音の上限/, "片方でも選べなければ全部書かない");
  assert.equal(core.storage.getItem(core.SETTINGS_KEY), before);
});

test("writeSettings: 容量不足なら例外になり、元の設定は変わらない", () => {
  // 今の設定（{"audioMaxSec":300}）は入るが、項目の増えた設定は入らない容量
  const current = JSON.stringify({ audioMaxSec: 300 });
  const core = loadCore(new FakeStorage("shrine-settings".length + current.length + 5));
  core.storage.setItem(core.SETTINGS_KEY, current);
  const before = core.storage.getItem(core.SETTINGS_KEY);
  assert.throws(() => core.writeSettings({ photoMaxEdge: 1600 }), { name: "QuotaExceededError" });
  assert.equal(core.storage.getItem(core.SETTINGS_KEY), before);
});

test("選べる値：写真は 1600・2048・元サイズ", () => {
  assert.deepEqual(loadCore().PHOTO_MAX_EDGE_CHOICES, [1600, 2048, "max"]);
});

// ---------- 残り容量の警告 ----------

test("storageWarning: 残りが 200MB 以上、かつ上限の10%以上なら警告しない", () => {
  const { storageWarning } = loadCore();
  assert.equal(storageWarning(1 * GB, 10 * GB), null);
  assert.equal(storageWarning(1800 * MB, 2000 * MB), null, "残り200MBちょうど・10%ちょうどは警告しない");
});

test("storageWarning: 残りが 200MB 未満なら警告する（上限が大きくても）", () => {
  const { storageWarning } = loadCore();
  assert.deepEqual(storageWarning(100 * GB - 150 * MB, 100 * GB), { remaining: 150 * MB, quota: 100 * GB });
});

test("storageWarning: 残りが上限の10%未満なら警告する（残りが200MB以上でも）", () => {
  const { storageWarning } = loadCore();
  assert.deepEqual(storageWarning(9.5 * GB, 10 * GB), { remaining: 0.5 * GB, quota: 10 * GB });
});

test("storageWarning: 上限や使用量が分からなければ警告しない。使い切っていれば残り0", () => {
  const { storageWarning } = loadCore();
  assert.equal(storageWarning(undefined, undefined), null);
  assert.equal(storageWarning(100, 0), null);
  assert.equal(storageWarning(undefined, 10 * GB), null);
  assert.deepEqual(storageWarning(11 * GB, 10 * GB), { remaining: 0, quota: 10 * GB });
});
