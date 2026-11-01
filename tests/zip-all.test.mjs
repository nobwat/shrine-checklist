// 7-2 全件の zip（神社ごとのフォルダ・200MB の見積もり・JSZip で作って読み戻す）のテスト。記録・座標はすべて架空
import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { loadCore } from "./helpers.mjs";

const core = loadCore();
const JSZip = createRequire(import.meta.url)("../vendor/jszip.min.js");
const NOW = new Date(2026, 10, 1, 9, 30, 0);
const MB = 1024 * 1024;

const rec = (id, name, createdAt, over = {}) => ({ id, name, checks: {}, visit: {}, updatedAt: 1700000000000, schemaVersion: 2, status: "final", createdAt, ...over });
const A = rec("s_test0031aaaa", "テスト神社A", "2026-10-17T10:00:00+09:00");
const B = rec("s_test0032bbbb", "テスト神社B", "2026-10-18T10:00:00+09:00", { field: { location: { lat: 35.0001, lon: 135.0001, accuracyM: 10, status: "ok" } } });
const C = rec("s_test0033cccc", "テスト神社A", "2026-10-17T15:00:00+09:00"); // A と同じ日・同じ名前
const photo = (id, visitId, seq, over = {}) => ({ id, visitId, type: "photo", seq, mimeType: "image/jpeg", ext: "jpg", size: 100, label: null, exifStripped: true, ...over });
const audio = (id, visitId, seq, over = {}) => ({ id, visitId, type: "audio", seq, mimeType: "audio/webm", ext: "webm", size: 50, ...over });
const memo = (id, visitId, seq, text) => ({ id, visitId, type: "memo", seq, createdAt: "2026-10-17T10:07:00+09:00", text });

test("groupMediaByVisit: 記録ごとに分け、連番の順に並べる", () => {
  const g = core.groupMediaByVisit([photo("p3", A.id, 3), photo("p1", A.id, 1), audio("a1", B.id, 1), memo("m2", A.id, 2, "x")]);
  assert.deepEqual(g.get(A.id).map(m => m.id), ["p1", "m2", "p3"]);
  assert.deepEqual(g.get(B.id).map(m => m.id), ["a1"]);
  assert.equal(g.has(C.id), false);
});

test("mediaTotalSize: 写真・録音の大きさを足す（メモ・大きさが分からないものは数えない）", () => {
  assert.equal(core.mediaTotalSize([photo("p1", A.id, 1, { size: 3 * MB }), audio("a1", A.id, 2, { size: 2 * MB }), memo("m1", A.id, 3, "x"), photo("p2", A.id, 4, { size: undefined })]), 5 * MB);
  assert.equal(core.mediaTotalSize([]), 0);
});

test("ZIP_ALL_WARN_BYTES: 200MB", () => {
  assert.equal(core.ZIP_ALL_WARN_BYTES, 200 * MB);
});

test("visitFolderName: zip のファイル名から .zip を除いたもの。同じ名前は _2・_3", () => {
  const used = new Set();
  assert.equal(core.visitFolderName(A, NOW, used), "20261017_テスト神社A");
  assert.equal(core.visitFolderName(C, NOW, used), "20261017_テスト神社A_2");
  assert.equal(core.visitFolderName(C, NOW, used), "20261017_テスト神社A_3");
  assert.equal(core.visitFolderName(rec("s_test0034dddd", "", "2026-10-19T00:00:00+09:00"), NOW, used), "20261019_名称未設定");
});

test("planAllZip: 神社ごとのフォルダに分け、manifest に全件の一覧とフォルダの対応を載せる", () => {
  const media = [photo("p1", A.id, 1, { label: "torii" }), memo("m1", A.id, 2, "Aのメモ"), audio("a1", B.id, 1)];
  const plan = core.planAllZip([A, B, C], core.groupMediaByVisit(media), new Map([["p1", 111], ["a1", 22]]), "2.0.0-test", NOW);
  assert.match(plan.name, /^shrine-backup_20261101-0930\.zip$/);
  assert.equal(plan.count, 3);
  assert.deepEqual(plan.missing, []);
  assert.deepEqual(plan.files.map(f => f.path), [
    "manifest.json",
    "20261017_テスト神社A/visit.json", "20261017_テスト神社A/memo.txt", "20261017_テスト神社A/photos/01_鳥居.jpg",
    "20261018_テスト神社B/visit.json", "20261018_テスト神社B/audio/01.webm",
    "20261017_テスト神社A_2/visit.json",
  ]);
  const manifest = JSON.parse(plan.files[0].text);
  assert.equal(manifest.format, core.ZIP_FORMAT);
  assert.equal(manifest.kind, "all");
  assert.deepEqual(manifest.visitIds, [A.id, B.id, C.id]);
  assert.deepEqual(manifest.folders, [
    { visitId: A.id, folder: "20261017_テスト神社A" },
    { visitId: B.id, folder: "20261018_テスト神社B" },
    { visitId: C.id, folder: "20261017_テスト神社A_2" },
  ]);
  assert.deepEqual(manifest.files.map(f => f.path), plan.files.slice(1).map(f => f.path), "manifest 自身は一覧に載せない");
  assert.equal(manifest.files.find(f => f.path.endsWith("01_鳥居.jpg")).size, 111);
});

test("planAllZip: visit.json の file はフォルダの中での名前（1神社の zip と同じ形）", () => {
  const media = [photo("p1", A.id, 1, { label: "torii" })];
  const all = core.planAllZip([A], core.groupMediaByVisit(media), new Map([["p1", 1]]), "2.0.0-test", NOW);
  const one = core.planVisitZip(A, media, new Map([["p1", 1]]), "2.0.0-test", NOW);
  const v = (plan, path) => JSON.parse(plan.files.find(f => f.path === path).text);
  assert.deepEqual(v(all, "20261017_テスト神社A/visit.json"), v(one, "visit.json"));
  assert.equal(v(all, "20261017_テスト神社A/visit.json").media[0].file, "photos/01_鳥居.jpg");
});

test("planAllZip: 本体が無い写真・録音は全件分まとめて missing に。位置の一言は緯度経度の文を優先", () => {
  const media = [photo("p1", A.id, 1, { exifStripped: false }), audio("a1", B.id, 1)];
  const plan = core.planAllZip([A, B], core.groupMediaByVisit(media), new Map([["p1", 1]]), "2.0.0-test", NOW);
  assert.deepEqual(plan.missing, ["a1"]);
  assert.match(plan.notice, /緯度・経度/);
  const exifOnly = core.planAllZip([A], core.groupMediaByVisit(media), new Map([["p1", 1]]), "2.0.0-test", NOW);
  assert.match(exifOnly.notice, /EXIF/);
  assert.equal(core.planAllZip([A, C], new Map(), new Map(), "2.0.0-test", NOW).notice, "");
});

test("planAllZip: 写真などが無い記録も、フォルダと visit.json は作る", () => {
  const plan = core.planAllZip([A], new Map(), new Map(), "2.0.0-test", NOW);
  assert.deepEqual(plan.files.map(f => f.path), ["manifest.json", "20261017_テスト神社A/visit.json"]);
});

test("planAllZip で作った zip を読み戻すと、神社ごとのフォルダに同じ中身。写真・音声は無圧縮", async () => {
  const media = [photo("p1", A.id, 1, { label: "torii" }), audio("a1", B.id, 1)];
  const data = new Map([["p1", new Uint8Array(2000).map((_, i) => i % 13)], ["a1", new Uint8Array(300).fill(5)]]);
  const plan = core.planAllZip([A, B], core.groupMediaByVisit(media), new Map([...data].map(([k, v]) => [k, v.length])), "2.0.0-test", NOW);
  const bytes = await (await core.fillZip(new JSZip(), plan.files, (id) => data.get(id))).generateAsync({ type: "uint8array", compression: "DEFLATE" });
  const back = await JSZip.loadAsync(bytes);
  assert.deepEqual(await back.file("20261017_テスト神社A/photos/01_鳥居.jpg").async("uint8array"), data.get("p1"));
  assert.deepEqual(await back.file("20261018_テスト神社B/audio/01.webm").async("uint8array"), data.get("a1"));
  assert.deepEqual(JSON.parse(await back.file("20261018_テスト神社B/visit.json").async("string")).entry, B);
  assert.equal(back.file("20261017_テスト神社A/photos/01_鳥居.jpg")._data.compression.magic, "\u0000\u0000");
  assert.equal(JSON.parse(await back.file("manifest.json").async("string")).kind, "all");
});
