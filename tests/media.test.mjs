// 3-3 メディアの集計（summarizeMedia）のテスト。IndexedDB 自体は PC の Chrome で確認する
import { test } from "node:test";
import assert from "node:assert/strict";
import { loadCore } from "./helpers.mjs";

const media = (id, visitId, type) => ({ id, visitId, type });

test("summarizeMedia: 0件", () => {
  const { summarizeMedia } = loadCore();
  assert.deepEqual(summarizeMedia([], ["s_test0001aaaa"]), { total: 0, byType: { photo: 0, audio: 0, memo: 0, other: 0 }, orphans: 0 });
});

test("summarizeMedia: 種類ごとに数え、記録が無いものを孤立として数える", () => {
  const { summarizeMedia } = loadCore();
  const list = [
    media("m1", "s_test0001aaaa", "photo"),
    media("m2", "s_test0001aaaa", "photo"),
    media("m3", "s_test0001aaaa", "audio"),
    media("m4", "s_test0002bbbb", "memo"),
    media("m5", "s_deleted", "photo"),
    media("m6", undefined, "audio"),
  ];
  assert.deepEqual(summarizeMedia(list, ["s_test0001aaaa", "s_test0002bbbb"]), {
    total: 6, byType: { photo: 3, audio: 2, memo: 1, other: 0 }, orphans: 2,
  });
});

test("summarizeMedia: 知らない種類は「その他」に数える", () => {
  const { summarizeMedia } = loadCore();
  const r = summarizeMedia([media("m1", "s_a", "video"), media("m2", "s_a", "toString"), media("m3", "s_a")], ["s_a"]);
  assert.deepEqual(r.byType, { photo: 0, audio: 0, memo: 0, other: 3 });
  assert.equal(r.orphans, 0);
});

test("summarizeMedia: 記録が1件も無ければ、すべて孤立", () => {
  const { summarizeMedia } = loadCore();
  assert.equal(summarizeMedia([media("m1", "s_a", "photo"), media("m2", "s_b", "memo")], []).orphans, 2);
});
