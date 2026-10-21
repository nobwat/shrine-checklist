// 4-3 録音（形式の選び方・拡張子・時間の表示・メタ情報・途中で終わった録音の回収）のテスト
import { test } from "node:test";
import assert from "node:assert/strict";
import { loadCore } from "./helpers.mjs";

const core = loadCore();

// ---------- 形式 ----------

test("pickAudioMime: webm/opus → mp4(AAC) → mp4 → 指定なし の順に、使えるものを選ぶ", () => {
  assert.deepEqual(core.AUDIO_MIME_CANDIDATES, ["audio/webm;codecs=opus", "audio/mp4;codecs=mp4a.40.2", "audio/mp4", ""]);
  const only = (...ok) => (t) => ok.includes(t);
  assert.equal(core.pickAudioMime(only("audio/webm;codecs=opus", "audio/mp4")), "audio/webm;codecs=opus"); // Android の想定
  assert.equal(core.pickAudioMime(only("audio/mp4;codecs=mp4a.40.2", "audio/mp4")), "audio/mp4;codecs=mp4a.40.2"); // iPhone の想定
  assert.equal(core.pickAudioMime(only("audio/mp4")), "audio/mp4");
  assert.equal(core.pickAudioMime(only()), "", "どれも使えなければ指定なし");
});

test("pickAudioMime: 判定でエラーになる形式は使わない", () => {
  assert.equal(core.pickAudioMime((t) => { if (t.includes("webm")) throw new Error("x"); return t === "audio/mp4"; }), "audio/mp4");
});

test("audioExt: 種類から拡張子（codecs は見ない）", () => {
  assert.equal(core.audioExt("audio/webm;codecs=opus"), "webm");
  assert.equal(core.audioExt("audio/mp4;codecs=mp4a.40.2"), "m4a");
  assert.equal(core.audioExt("audio/mp4"), "m4a");
  assert.equal(core.audioExt("AUDIO/OGG; codecs=opus"), "ogg");
  assert.equal(core.audioExt(""), "bin");
  assert.equal(core.audioExt(undefined), "bin");
});

test("formatDuration: 0:42、10:05 の形", () => {
  assert.equal(core.formatDuration(0), "0:00");
  assert.equal(core.formatDuration(42.9), "0:42");
  assert.equal(core.formatDuration(180), "3:00");
  assert.equal(core.formatDuration(605), "10:05");
  assert.equal(core.formatDuration(-3), "0:00");
  assert.equal(core.formatDuration(undefined), "0:00");
});

test("録音の上限：既定3分、選べるのは1・3・5・10分", () => {
  assert.equal(core.AUDIO_MAX_SEC_DEFAULT, 180);
  assert.deepEqual(core.AUDIO_MAX_SEC_CHOICES, [60, 180, 300, 600]);
});

test("newAudioMeta: media ストアの1件の形。作成日時は録音を始めた時刻", () => {
  const now = new Date(2026, 9, 21, 10, 31, 0);
  const m = core.newAudioMeta({ id: "r1", visitId: "s_a", seq: 4, startedAt: "2026-10-21T10:30:00+09:00", now, mimeType: "audio/webm;codecs=opus", size: 50000, durationSec: 42, interrupted: false });
  assert.deepEqual({ ...m, updatedAt: m.updatedAt.slice(0, 19) }, {
    id: "r1", visitId: "s_a", type: "audio", seq: 4, createdAt: "2026-10-21T10:30:00+09:00", updatedAt: "2026-10-21T10:31:00",
    mimeType: "audio/webm;codecs=opus", ext: "webm", size: 50000, durationSec: 42, interrupted: false,
  });
  assert.equal(core.newAudioMeta({ id: "r2", now, interrupted: undefined }).interrupted, false);
});

// ---------- 回収 ----------

const NOW = 1_800_000_000_000;
const chunk = (recId, seq, at, extra = {}) => ({ recId, seq, at, blob: `${recId}#${seq}`, visitId: "s_a", mimeType: "audio/webm", startedAt: "2026-10-21T10:00:00+09:00", ...extra });

test("planRecovery: 保存されていない録音を、チャンクを番号順に並べて回収する", () => {
  const chunks = [chunk("r1", 2, NOW - 60000), chunk("r1", 0, NOW - 62000), chunk("r1", 1, NOW - 61000)];
  const { recover, cleanup } = core.planRecovery(chunks, new Set(), NOW);
  assert.deepEqual(cleanup, []);
  assert.equal(recover.length, 1);
  assert.deepEqual(recover[0].chunks.map(c => c.blob), ["r1#0", "r1#1", "r1#2"]);
  assert.deepEqual({ ...recover[0], chunks: undefined }, {
    recId: "r1", visitId: "s_a", mimeType: "audio/webm", startedAt: "2026-10-21T10:00:00+09:00", chunks: undefined, durationSec: 3,
  });
});

test("planRecovery: 途中保存が新しい録音（別の画面で録音中かもしれない）には触らない", () => {
  const { recover, cleanup } = core.planRecovery([chunk("r1", 0, NOW - 30000), chunk("r1", 1, NOW - 5000)], new Set(), NOW);
  assert.deepEqual(recover, []);
  assert.deepEqual(cleanup, []);
  assert.equal(core.REC_RECOVER_IDLE_MS, 20000);
  assert.equal(core.planRecovery([chunk("r1", 0, NOW - 20000)], new Set(), NOW).recover.length, 1, "ちょうど20秒止まっていれば回収する");
});

test("planRecovery: 録音は保存済みなのにチャンクが残っているものは、消してよい方に分ける", () => {
  const { recover, cleanup } = core.planRecovery([chunk("r1", 0, NOW - 60000), chunk("r2", 0, NOW - 60000)], new Set(["r1"]), NOW);
  assert.deepEqual(cleanup, ["r1"]);
  assert.deepEqual(recover.map(g => g.recId), ["r2"]);
});

test("planRecovery: 複数の録音を、それぞれ別に回収する（記録も別）", () => {
  const chunks = [chunk("r1", 0, NOW - 90000), chunk("r2", 1, NOW - 90000, { visitId: "s_b" }), chunk("r2", 0, NOW - 91000, { visitId: "s_b" })];
  const { recover } = core.planRecovery(chunks, new Set(), NOW);
  assert.deepEqual(recover.map(g => [g.recId, g.visitId, g.durationSec]), [["r1", "s_a", 1], ["r2", "s_b", 2]]);
});

test("planRecovery: チャンクが無ければ何もしない", () => {
  assert.deepEqual(core.planRecovery([], new Set(), NOW), { recover: [], cleanup: [] });
});
