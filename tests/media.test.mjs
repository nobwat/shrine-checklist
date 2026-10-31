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

// ---------- 3-4 削除の確認文 ----------

test("deleteConfirmText: メディアが無ければ、これまでと同じ文", () => {
  const { summarizeMedia, deleteConfirmText } = loadCore();
  assert.equal(deleteConfirmText(summarizeMedia([], ["s_a"])), "この神社の記録を削除します。元に戻せません。よろしいですか？");
});

test("deleteConfirmText: 種類ごとの件数を出す（0件の種類は出さない）", () => {
  const { summarizeMedia, deleteConfirmText } = loadCore();
  const list = [media("m1", "s_a", "photo"), media("m2", "s_a", "photo"), media("m3", "s_a", "memo")];
  const text = deleteConfirmText(summarizeMedia(list, ["s_a"]));
  assert.match(text, /写真2枚・メモ1件も削除されます/);
  assert.doesNotMatch(text, /録音/);
  assert.match(text, /元に戻せません/);
});

test("deleteConfirmText: 録音・その他も数える", () => {
  const { summarizeMedia, deleteConfirmText } = loadCore();
  const text = deleteConfirmText(summarizeMedia([media("m1", "s_a", "audio"), media("m2", "s_a", "video")], ["s_a"]));
  assert.match(text, /録音1本・その他1件も削除されます/);
});

test("deleteConfirmText: IndexedDB を読めなければ「記録だけを削除しますか」と聞く", () => {
  const { deleteConfirmText } = loadCore();
  assert.match(deleteConfirmText(null), /^メディア（写真・録音・メモ）を確認できません。記録だけを削除しますか？/);
});

test("summarizeMedia: 記録が1件も無ければ、すべて孤立", () => {
  const { summarizeMedia } = loadCore();
  assert.equal(summarizeMedia([media("m1", "s_a", "photo"), media("m2", "s_b", "memo")], []).orphans, 2);
});

// ---------- 6-4 一覧のバッジ ----------

test("mediaTypeCounts: 記録ごとに写真・録音・メモを数え、知らない種類は数えない", () => {
  const { mediaTypeCounts } = loadCore();
  const counts = mediaTypeCounts([
    media("m1", "s_a", "photo"), media("m2", "s_a", "photo"), media("m3", "s_a", "audio"),
    media("m4", "s_b", "memo"), media("m5", "s_b", "video"), media("m6", "s_c", "toString"),
  ]);
  assert.deepEqual(counts.get("s_a"), { photo: 2, audio: 1, memo: 0 });
  assert.deepEqual(counts.get("s_b"), { photo: 0, audio: 0, memo: 1 });
  assert.equal(counts.has("s_c"), false, "知らない種類だけの記録は載せない");
  assert.equal(mediaTypeCounts([]).size, 0);
});

test("mediaBadgeText: 「写真N・音声M・メモK」の形。0 の種類は出さない", () => {
  const { mediaBadgeText } = loadCore();
  assert.equal(mediaBadgeText({ photo: 3, audio: 1, memo: 2 }), "写真3・音声1・メモ2");
  assert.equal(mediaBadgeText({ photo: 3, audio: 0, memo: 2 }), "写真3・メモ2");
  assert.equal(mediaBadgeText({ photo: 0, audio: 2, memo: 0 }), "音声2");
});

test("mediaBadgeText: どれも 0・件数が無い記録は空（バッジを出さない）", () => {
  const { mediaBadgeText } = loadCore();
  assert.equal(mediaBadgeText({ photo: 0, audio: 0, memo: 0 }), "");
  assert.equal(mediaBadgeText(undefined), "");
});
