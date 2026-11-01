// 7-1 1神社の zip（ファイル名・中身の決め方・JSZip で作って読み戻す）のテスト。記録・座標はすべて架空
import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { loadCore } from "./helpers.mjs";

const core = loadCore();
const JSZip = createRequire(import.meta.url)("../vendor/jszip.min.js"); // アプリと同じ vendor のもの
const NOW = new Date(2026, 10, 1, 9, 30, 0);

const entry = (over = {}) => ({
  id: "s_test0020tttt", name: "テスト神社T", checks: {}, visit: {}, updatedAt: 1700000000000,
  schemaVersion: 2, status: "final", ...over,
});
const photo = (id, seq, label = null, over = {}) => ({
  id, visitId: "s_test0020tttt", type: "photo", seq, createdAt: "2026-10-31T10:00:00+09:00", mimeType: "image/jpeg", ext: "jpg",
  size: 100, width: 2048, height: 1536, label, exifStripped: true, ...over,
});
const audio = (id, seq) => ({ id, visitId: "s_test0020tttt", type: "audio", seq, createdAt: "2026-10-31T10:05:00+09:00", mimeType: "audio/webm", ext: "webm", size: 50, durationSec: 5 });
const memo = (id, seq, text) => ({ id, visitId: "s_test0020tttt", type: "memo", seq, createdAt: "2026-10-31T10:07:30+09:00", text });

// ---------- ファイル名 ----------

test("zipFileName: 「YYYYMMDD_神社名.zip」。日付は参拝日時を使う", () => {
  const e = entry({ field: { visitAt: "2026-10-17T10:23:45+09:00" }, visit: { v_date: "2026-10-18" }, createdAt: "2026-10-19T00:00:00+09:00" });
  assert.equal(core.zipFileName(e, NOW), "20261017_テスト神社T.zip");
});

test("zipDate: 参拝日時が無ければ参拝日、それも無ければ作成日", () => {
  assert.equal(core.zipDate(entry({ visit: { v_date: "2026-10-18" }, createdAt: "2026-10-19T00:00:00+09:00" }), NOW), "20261018");
  assert.equal(core.zipDate(entry({ visit: { v_date: "" }, createdAt: "2026-10-19T00:00:00+09:00" }), NOW), "20261019");
});

test("zipDate: どれも無い古い記録は更新日時、それも無ければ今日", () => {
  const t = new Date(2026, 0, 2, 12, 0, 0).getTime();
  assert.equal(core.zipDate({ id: "s_test0001aaaa", name: "", checks: {}, updatedAt: t }, NOW), "20260102");
  assert.equal(core.zipDate({ id: "s_test0001aaaa", name: "" }, NOW), "20261101");
});

test("zipFileName: 使えない記号と制御文字は _ にする", () => {
  assert.equal(core.zipFileName(entry({ createdAt: "2026-10-19T00:00:00+09:00", name: 'a\\b/c:d*e?f"g<h>i|j\tk' }), NOW), "20261019_a_b_c_d_e_f_g_h_i_j_k.zip");
});

test("zipFileName: 神社名は50文字まで（絵文字などの2文字分の字も1文字と数える）", () => {
  const long = "神".repeat(60);
  const name = core.zipFileName(entry({ createdAt: "2026-10-19T00:00:00+09:00", name: long }), NOW);
  assert.equal(name, `20261019_${"神".repeat(50)}.zip`);
  const emoji = core.zipFileName(entry({ createdAt: "2026-10-19T00:00:00+09:00", name: "⛩".repeat(10) + "😀".repeat(45) }), NOW);
  assert.equal(Array.from(emoji.slice(9, -4)).length, 50);
});

test("zipFileName: 神社名が空・空白だけなら「名称未設定」", () => {
  assert.equal(core.zipFileName(entry({ createdAt: "2026-10-19T00:00:00+09:00", name: "" }), NOW), "20261019_名称未設定.zip");
  assert.equal(core.zipFileName(entry({ createdAt: "2026-10-19T00:00:00+09:00", name: "   " }), NOW), "20261019_名称未設定.zip");
  assert.equal(core.zipFileName(entry({ createdAt: "2026-10-19T00:00:00+09:00", name: undefined }), NOW), "20261019_名称未設定.zip");
});

// ---------- zip の中のファイル名 ----------

test("mediaZipPath: 写真は番号＋ラベル名、ラベルが無ければ番号だけ。録音は audio/番号", () => {
  const used = new Set();
  assert.equal(core.mediaZipPath(photo("p1", 1, "torii"), used), "photos/01_鳥居.jpg");
  assert.equal(core.mediaZipPath(photo("p2", 2), used), "photos/02.jpg");
  assert.equal(core.mediaZipPath(photo("p3", 12, "unknown"), used), "photos/12.jpg");
  assert.equal(core.mediaZipPath(audio("a1", 3), used), "audio/03.webm");
  assert.equal(core.mediaZipPath(photo("p4", 4, "toro", { ext: "heic" }), used), "photos/04_灯籠・石碑・伝承の石.heic");
});

test("mediaZipPath: 万一同じ名前になったら _2 を付ける", () => {
  const used = new Set();
  assert.equal(core.mediaZipPath(photo("p1", 1, "torii"), used), "photos/01_鳥居.jpg");
  assert.equal(core.mediaZipPath(photo("p2", 1, "torii"), used), "photos/01_鳥居_2.jpg");
  assert.equal(core.mediaZipPath(photo("p3", undefined), used), "photos/00.jpg");
});

test("memoFileText: メモを順に「【メモN】日時」と本文で並べる", () => {
  assert.equal(core.memoFileText([memo("m1", 1, "一つ目"), memo("m2", 2, "二つ目\n二行目")]),
    "【メモ1】2026-10-31 10:07\n一つ目\n\n【メモ2】2026-10-31 10:07\n二つ目\n二行目\n");
});

// ---------- 位置情報の一言 ----------

test("zipLocationNotice: 記録に緯度経度があれば出す", () => {
  const e = entry({ field: { location: { lat: 35.0001, lon: 135.0001, accuracyM: 10, status: "ok" } } });
  assert.match(core.zipLocationNotice(e, []), /位置情報（参拝した場所の緯度・経度）が含まれます/);
});

test("zipLocationNotice: 位置が無くても、EXIF が残った写真があれば出す。どちらも無ければ空", () => {
  assert.match(core.zipLocationNotice(entry(), [photo("p1", 1, null, { exifStripped: false })]), /EXIF/);
  assert.equal(core.zipLocationNotice(entry({ field: { location: { status: "denied" } } }), [photo("p1", 1)]), "");
});

// ---------- 中身の決め方 ----------

test("planVisitZip: manifest.json・visit.json・memo.txt と写真・録音。manifest に一覧と大きさ", () => {
  const e = entry({ createdAt: "2026-10-19T00:00:00+09:00" });
  const list = [photo("p1", 1, "torii"), audio("a1", 2), memo("m1", 3, "メモの本文"), photo("p2", 4)];
  const plan = core.planVisitZip(e, list, new Map([["p1", 1234], ["a1", 567], ["p2", 89]]), "2.0.0-test", NOW);
  assert.equal(plan.name, "20261019_テスト神社T.zip");
  assert.deepEqual(plan.files.map(f => f.path), ["manifest.json", "visit.json", "memo.txt", "photos/01_鳥居.jpg", "audio/02.webm", "photos/04.jpg"]);
  assert.deepEqual(plan.missing, []);
  const manifest = JSON.parse(plan.files[0].text);
  assert.equal(manifest.format, core.ZIP_FORMAT);
  assert.equal(manifest.formatVersion, 1);
  assert.equal(manifest.kind, "visit");
  assert.equal(manifest.appVersion, "2.0.0-test");
  assert.equal(manifest.createdAt.slice(0, 19), "2026-11-01T09:30:00");
  assert.deepEqual(manifest.visitIds, [e.id]);
  assert.deepEqual(manifest.files.slice(2), [
    { path: "photos/01_鳥居.jpg", mimeType: "image/jpeg", size: 1234 },
    { path: "audio/02.webm", mimeType: "audio/webm", size: 567 },
    { path: "photos/04.jpg", mimeType: "image/jpeg", size: 89 },
  ]);
  assert.deepEqual(manifest.files.slice(0, 2).map(f => [f.path, f.mimeType]), [["visit.json", "application/json"], ["memo.txt", "text/plain"]]);
  assert.equal(manifest.files[0].size, new TextEncoder().encode(plan.files[1].text).length, "visit.json の大きさはバイト数");
});

test("planVisitZip: visit.json に記録そのものと、メディアの情報（zip の中のファイル名付き）", () => {
  const e = entry({ visit: { v_spot_torii_chk: true }, autoChecks: { v_spot_torii_chk: { mediaId: "p1", at: "2026-10-31T10:00:00+09:00" } } });
  const list = [photo("p1", 1, "torii"), memo("m1", 2, "本文")];
  const plan = core.planVisitZip(e, list, new Map([["p1", 10]]), "2.0.0-test", NOW);
  const v = JSON.parse(plan.files.find(f => f.path === "visit.json").text);
  assert.equal(v.format, "shrine-checklist-visit");
  assert.deepEqual(v.entry, e, "記録はそのまま（項目を削らない）");
  assert.deepEqual(v.media, [{ ...list[0], file: "photos/01_鳥居.jpg" }, list[1]]);
});

test("planVisitZip: 本体が見つからない写真・録音と、知らない種類は入れずに missing で返す", () => {
  const list = [photo("p1", 1), audio("a1", 2), { id: "x1", visitId: "s_test0020tttt", type: "video", seq: 3 }];
  const plan = core.planVisitZip(entry(), list, new Map([["p1", 10]]), "2.0.0-test", NOW);
  assert.deepEqual(plan.missing, ["a1", "x1"]);
  assert.deepEqual(plan.files.map(f => f.path), ["manifest.json", "visit.json", "photos/01.jpg"]);
  assert.deepEqual(JSON.parse(plan.files[1].text).media.map(m => m.id), ["p1"]);
});

test("planVisitZip: メモが無ければ memo.txt は作らない。メディアが無い記録は2ファイルだけ", () => {
  const plan = core.planVisitZip(entry(), [], new Map(), "2.0.0-test", NOW);
  assert.deepEqual(plan.files.map(f => f.path), ["manifest.json", "visit.json"]);
  assert.equal(plan.notice, "");
});

// ---------- JSZip で作って読み戻す ----------

test("fillZip: 作った zip を読み戻すと同じ中身。写真・音声は無圧縮、JSON・テキストは圧縮", async () => {
  const e = entry({ createdAt: "2026-10-19T00:00:00+09:00" });
  const list = [photo("p1", 1, "torii"), audio("a1", 2), memo("m1", 3, "メモ\n本文")];
  const data = new Map([["p1", new Uint8Array(3000).map((_, i) => i % 251)], ["a1", new Uint8Array(500).fill(9)]]);
  const plan = core.planVisitZip(e, list, new Map([...data].map(([k, v]) => [k, v.length])), "2.0.0-test", NOW);
  const zip = await core.fillZip(new JSZip(), plan.files, (id) => data.get(id));
  const bytes = await zip.generateAsync({ type: "uint8array", compression: "DEFLATE" });

  const back = await JSZip.loadAsync(bytes);
  const names = Object.values(back.files).filter(f => !f.dir).map(f => f.name);
  assert.deepEqual(names.sort(), ["audio/02.webm", "manifest.json", "memo.txt", "photos/01_鳥居.jpg", "visit.json"]);
  assert.deepEqual(await back.file("photos/01_鳥居.jpg").async("uint8array"), data.get("p1"));
  assert.deepEqual(await back.file("audio/02.webm").async("uint8array"), data.get("a1"));
  assert.equal(await back.file("memo.txt").async("string"), "【メモ1】2026-10-31 10:07\nメモ\n本文\n");
  assert.deepEqual(JSON.parse(await back.file("visit.json").async("string")).entry, e);
  const STORE = "\u0000\u0000", DEFLATE = "\u0008\u0000";
  assert.equal(back.file("photos/01_鳥居.jpg")._data.compression.magic, STORE);
  assert.equal(back.file("audio/02.webm")._data.compression.magic, STORE);
  assert.equal(back.file("manifest.json")._data.compression.magic, DEFLATE);
  assert.equal(back.file("visit.json")._data.compression.magic, DEFLATE);
});
