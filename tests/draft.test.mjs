// 4-1 現地モードの下書き（作成・再開・空の判断）のテスト
import { test } from "node:test";
import assert from "node:assert/strict";
import { loadCore, V2_RECORD } from "./helpers.mjs";

const NOW = new Date(2026, 9, 21, 15, 0, 0);
const HOUR = 60 * 60 * 1000;
const at = (ms) => {
  const { isoLocal } = loadCore();
  return isoLocal(new Date(NOW.getTime() + ms));
};
// 架空の下書き。startedAt は NOW からのずれ（ミリ秒）
const draft = (id, offset, extra = {}) => ({
  id, name: "", checks: {}, visit: {}, updatedAt: 1, schemaVersion: 2, status: "draft",
  createdAt: at(offset), field: { startedAt: at(offset) }, ...extra,
});

test("newDraftEntry: 下書きの形（status は draft、開始時刻と作成日時は同じ）", () => {
  const { newDraftEntry, validateEntries } = loadCore();
  const e = newDraftEntry(NOW);
  assert.match(e.id, /^s_[0-9a-z]+$/);
  assert.equal(e.status, "draft");
  assert.equal(e.schemaVersion, 2);
  assert.equal(e.name, "");
  assert.equal(e.updatedAt, NOW.getTime());
  assert.match(e.createdAt, /^2026-10-21T15:00:00[+-]\d\d:\d\d$/);
  assert.deepEqual(e.field, { startedAt: e.createdAt });
  assert.equal(validateEntries([e]), null, "今の判定を通る");
});

test("newEntryId: 続けて作っても重ならない", () => {
  const { newEntryId } = loadCore();
  const ids = new Set(Array.from({ length: 200 }, () => newEntryId(NOW)));
  assert.equal(ids.size, 200);
});

test("findResumableDraft: 6時間以内の下書きのうち、いちばん新しいものを選ぶ", () => {
  const { findResumableDraft } = loadCore();
  const list = [draft("s_old", -5 * HOUR), clone(V2_RECORD), draft("s_new", -1 * HOUR), draft("s_mid", -3 * HOUR)];
  assert.equal(findResumableDraft(list, NOW).id, "s_new");
});

test("findResumableDraft: 6時間ちょうどは再開し、それを過ぎたら再開しない", () => {
  const { findResumableDraft, DRAFT_RESUME_MS } = loadCore();
  assert.equal(DRAFT_RESUME_MS, 6 * HOUR);
  assert.equal(findResumableDraft([draft("s_a", -6 * HOUR)], NOW).id, "s_a");
  assert.equal(findResumableDraft([draft("s_a", -6 * HOUR - 1000)], NOW), null);
});

test("findResumableDraft: 確定済みの記録・開始時刻が読めない下書き・未来の開始時刻は対象外", () => {
  const { findResumableDraft } = loadCore();
  const final = { ...draft("s_final", -1 * HOUR), status: "final" };
  const noStart = draft("s_nostart", 0, { field: {} });
  const badStart = draft("s_bad", 0, { field: { startedAt: "あいうえお" } });
  const future = draft("s_future", 2 * HOUR); // 端末の時計を戻した場合など
  assert.equal(findResumableDraft([final, noStart, badStart, future, clone(V2_RECORD)], NOW), null);
});

test("isEmptyDraft: 名前が空でメディアが0件なら空。名前か、メディアが1件でもあれば空ではない", () => {
  const { isEmptyDraft } = loadCore();
  assert.equal(isEmptyDraft(draft("s_a", 0), 0), true);
  assert.equal(isEmptyDraft(draft("s_a", 0, { name: "   " }), 0), true, "空白だけの名前は空");
  assert.equal(isEmptyDraft(draft("s_a", 0, { name: "テスト神社" }), 0), false);
  assert.equal(isEmptyDraft(draft("s_a", 0), 1), false);
  assert.equal(isEmptyDraft({ ...draft("s_a", 0), status: "final" }, 0), false, "確定済みの記録は消さない");
});

test("isEmptyDraft: 位置・天候（field）や現地記録の入力があっても、名前とメディアが無ければ空", () => {
  const { isEmptyDraft } = loadCore();
  const e = draft("s_a", 0, { field: { startedAt: at(0), location: { lat: 35, lon: 135 } } });
  assert.equal(isEmptyDraft(e, 0), true);
});

test("staleEmptyDraftIds: 6時間より前の空の下書きだけを選ぶ（新しいもの・中身のあるものは残す）", () => {
  const { staleEmptyDraftIds } = loadCore();
  const list = [
    draft("s_stale", -7 * HOUR),
    draft("s_recent", -1 * HOUR),                         // 別の画面で使っている途中かもしれない
    draft("s_named", -7 * HOUR, { name: "テスト神社" }),
    draft("s_media", -7 * HOUR),
    draft("s_nostart", 0, { field: {} }),                 // 開始時刻が読めない空の下書きは消す
    clone(V2_RECORD),
  ];
  const counts = new Map([["s_media", 2]]);
  assert.deepEqual(staleEmptyDraftIds(list, counts, NOW), ["s_stale", "s_nostart"]);
});

function clone(v) { return JSON.parse(JSON.stringify(v)); }
