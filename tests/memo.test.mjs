// 4-4 一言メモ（メタ情報の形・一覧に出す冒頭の文・文字の大きさ）のテスト
import { test } from "node:test";
import assert from "node:assert/strict";
import { loadCore } from "./helpers.mjs";

const core = loadCore();

test("入力が止まってから1秒で保存する", () => {
  assert.equal(core.MEMO_SAVE_DELAY_MS, 1000);
});

test("textByteSize: UTF-8 のバイト数（日本語は1文字3バイト）", () => {
  assert.equal(core.textByteSize(""), 0);
  assert.equal(core.textByteSize("abc"), 3);
  assert.equal(core.textByteSize("鳥居"), 6);
  assert.equal(core.textByteSize(undefined), 0);
});

test("newMemoMeta: media ストアの1件の形。本文は text に持つ", () => {
  const now = new Date(2026, 9, 21, 11, 0, 0);
  const m = core.newMemoMeta({ id: "m1", visitId: "s_a", seq: 7, now, text: "苔むした狛犬" });
  assert.deepEqual({ ...m, createdAt: m.createdAt.slice(0, 19), updatedAt: m.updatedAt.slice(0, 19) }, {
    id: "m1", visitId: "s_a", type: "memo", seq: 7, createdAt: "2026-10-21T11:00:00", updatedAt: "2026-10-21T11:00:00",
    mimeType: "text/plain", ext: "txt", size: 18, text: "苔むした狛犬",
  });
});

test("memoPreview: 改行や続く空白は1つの空白にまとめる", () => {
  assert.equal(core.memoPreview("  一行目\n\n二行目　\t三行目  "), "一行目 二行目 三行目");
});

test("memoPreview: 40文字を超えたら「…」で切る（ちょうど40文字なら切らない）", () => {
  const forty = "あ".repeat(40);
  assert.equal(core.memoPreview(forty), forty);
  assert.equal(core.memoPreview(forty + "い"), forty + "…");
  assert.equal(core.memoPreview("abcdef", 3), "abc…");
});

test("memoPreview: 絵文字などを途中で切らない", () => {
  assert.equal(core.memoPreview("⛩".repeat(3) + "🦊🦊", 4), "⛩⛩⛩🦊…");
});

test("memoPreview: 空・空白だけなら空文字", () => {
  assert.equal(core.memoPreview(""), "");
  assert.equal(core.memoPreview(" \n "), "");
  assert.equal(core.memoPreview(undefined), "");
});
