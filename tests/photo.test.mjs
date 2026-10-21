// 4-2 写真（縮小後の大きさ・ラベル表・連番・拡張子・メディアの id・メタ情報）のテスト
import { test } from "node:test";
import assert from "node:assert/strict";
import { loadCore } from "./helpers.mjs";

const core = loadCore();
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

// ---------- 縮小後の大きさ ----------

test("fitPhotoSize: 長辺を 2048 にそろえ、縦横比を保つ（横長・縦長）", () => {
  assert.deepEqual(core.fitPhotoSize(4032, 3024, 2048), { width: 2048, height: 1536 });
  assert.deepEqual(core.fitPhotoSize(3024, 4032, 2048), { width: 1536, height: 2048 });
  assert.deepEqual(core.fitPhotoSize(4032, 3024, 1600), { width: 1600, height: 1200 });
});

test("fitPhotoSize: 小さい写真は拡大しない", () => {
  assert.deepEqual(core.fitPhotoSize(800, 600, 2048), { width: 800, height: 600 });
  assert.deepEqual(core.fitPhotoSize(1, 1, 2048), { width: 1, height: 1 });
});

test("fitPhotoSize: 元サイズ（max）は、1,670万画素以下ならそのまま", () => {
  assert.deepEqual(core.fitPhotoSize(4032, 3024, "max"), { width: 4032, height: 3024 }); // 約1,220万画素
});

test("fitPhotoSize: 元サイズ（max）でも、1,670万画素を超えたら面積の上限まで縮める", () => {
  const r = core.fitPhotoSize(8064, 6048, "max"); // 約4,880万画素（4800万画素のカメラ）
  assert.ok(r.width * r.height <= core.CANVAS_MAX_PIXELS);
  assert.ok(r.width * r.height > core.CANVAS_MAX_PIXELS * 0.99, "上限近くまでは使う");
  assert.ok(Math.abs(r.width / r.height - 8064 / 6048) < 0.01, "縦横比を保つ");
});

test("fitPhotoSize: どんな大きさでも、1,670万画素を超えない", () => {
  for (const [w, h, m] of [[6000, 4000, "max"], [12000, 9000, "max"], [20000, 500, "max"], [4097, 4097, "max"], [9000, 9000, 2048], [5000, 3500, 1600]]) {
    const r = core.fitPhotoSize(w, h, m);
    assert.ok(r.width * r.height <= core.CANVAS_MAX_PIXELS, `${w}x${h} ${m} → ${r.width}x${r.height}`);
    assert.ok(r.width >= 1 && r.height >= 1);
  }
});

test("fitPhotoSize: サムネイルは長辺320px", () => {
  assert.equal(core.THUMB_EDGE, 320);
  assert.deepEqual(core.fitPhotoSize(4032, 3024, core.THUMB_EDGE), { width: 320, height: 240 });
  assert.deepEqual(core.fitPhotoSize(3024, 4032, core.THUMB_EDGE), { width: 240, height: 320 });
});

test("既定の写真の大きさは 2048", () => {
  assert.equal(core.PHOTO_MAX_EDGE_DEFAULT, 2048);
});

// ---------- ラベル ----------

test("PHOTO_LABELS: 計画書 3.4 の11種類と、自動チェック先", () => {
  assert.deepEqual(core.PHOTO_LABELS.map(l => [l.key, l.name, l.check]), [
    ["signage", "案内板・由緒書き", "v_chk_signage"],
    ["map", "境内図", "v_chk_map"],
    ["torii", "鳥居", "v_spot_torii_chk"],
    ["haiden", "拝殿・本殿", "v_spot_haiden_chk"],
    ["komainu", "狛犬", "v_spot_komainu_chk"],
    ["shinboku", "御神木・名木", "v_spot_shinboku_chk"],
    ["toro", "灯籠・石碑・伝承の石", "v_spot_toro_chk"],
    ["juyohin", "お守り・おみくじ", "v_chk_juyohin"],
    ["other", "その他", "v_spot_other_chk"],
    ["temizuya", "手水舎", null],
    ["goshuin", "御朱印", null],
  ]);
});

test("photoLabelName: キーから表示名。知らないキー・未分類は null", () => {
  assert.equal(core.photoLabelName("torii"), "鳥居");
  assert.equal(core.photoLabelName(null), null);
  assert.equal(core.photoLabelName("unknown"), null);
});

// ---------- 連番・拡張子・id・メタ情報 ----------

test("nextMediaSeq: 残っているものの最大の次。途中の空いた番号は使わない", () => {
  assert.equal(core.nextMediaSeq([]), 1);
  assert.equal(core.nextMediaSeq([{ seq: 1 }, { seq: 3 }]), 4);
  assert.equal(core.nextMediaSeq([{ seq: "x" }, {}]), 1);
});

test("nextMediaSeq: 最後のものを消したときは、その番号をもう一度使う", () => {
  assert.equal(core.nextMediaSeq([{ seq: 1 }, { seq: 2 }, { seq: 3 }, { seq: 4 }]), 5);
});

test("extForFile: 種類から拡張子。分からなければファイル名から、それも無ければ bin", () => {
  assert.equal(core.extForFile("image/jpeg", "a.jpeg"), "jpg");
  assert.equal(core.extForFile("image/heic", ""), "heic");
  assert.equal(core.extForFile("", "IMG_0001.HEIC"), "heic");
  assert.equal(core.extForFile("", "noext"), "bin");
  assert.equal(core.extForFile(undefined, undefined), "bin");
});

test("newMediaId: UUID の形で、重ならない", () => {
  const ids = new Set(Array.from({ length: 500 }, () => core.newMediaId()));
  assert.equal(ids.size, 500);
  ids.forEach(id => assert.match(id, UUID));
});

test("newMediaId: crypto.randomUUID が無い端末でも UUID を作れる", () => {
  const old = loadCore(undefined, { crypto: { getRandomValues: (a) => globalThis.crypto.getRandomValues(a) } });
  const ids = new Set(Array.from({ length: 200 }, () => old.newMediaId()));
  assert.equal(ids.size, 200);
  ids.forEach(id => assert.match(id, UUID));
});

// ---------- 一覧に出す大きさ（4-5 修正） ----------

test("formatMediaSize: 100KB 未満は KB、それ以上は MB を小数1桁", () => {
  const KB = 1024, MB = 1024 * 1024;
  assert.equal(core.formatMediaSize(85 * KB), "85KB");
  assert.equal(core.formatMediaSize(99 * KB), "99KB");
  assert.equal(core.formatMediaSize(100 * KB), "0.1MB");
  assert.equal(core.formatMediaSize(0.4 * MB), "0.4MB");
  assert.equal(core.formatMediaSize(2.34 * MB), "2.3MB");
  assert.equal(core.formatMediaSize(12.96 * MB), "13.0MB");
});

test("formatMediaSize: とても小さい・分からないとき", () => {
  assert.equal(core.formatMediaSize(8), "1KB", "1KB 未満でも 0KB とは出さない");
  assert.equal(core.formatMediaSize(0), "1KB");
  assert.equal(core.formatMediaSize(undefined), "容量不明");
  assert.equal(core.formatMediaSize(-1), "容量不明");
});

test("photoSizeText: 「1600×1200・0.4MB」の形", () => {
  assert.equal(core.photoSizeText({ width: 1600, height: 1200, size: 0.4 * 1024 * 1024 }), "1600×1200・0.4MB");
  assert.equal(core.photoSizeText({ width: 3000, height: 2000, size: 2.3 * 1024 * 1024 }), "3000×2000・2.3MB");
});

test("photoSizeText: 縮小できなかった写真（縦横が分からない）", () => {
  assert.equal(core.photoSizeText({ width: null, height: null, size: 3.1 * 1024 * 1024 }), "大きさ不明・3.1MB");
});

test("newPhotoMeta: media ストアの1件の形（ラベルは未分類）", () => {
  const now = new Date(2026, 9, 21, 10, 25, 1);
  const m = core.newPhotoMeta({ id: "m1", visitId: "s_a", seq: 3, now, mimeType: "image/jpeg", ext: "jpg", size: 612345, width: 2048, height: 1536, exifStripped: true });
  assert.deepEqual({ ...m, createdAt: m.createdAt.slice(0, 19), updatedAt: m.updatedAt.slice(0, 19) }, {
    id: "m1", visitId: "s_a", type: "photo", seq: 3, createdAt: "2026-10-21T10:25:01", updatedAt: "2026-10-21T10:25:01",
    mimeType: "image/jpeg", ext: "jpg", size: 612345, width: 2048, height: 1536, label: null, exifStripped: true,
  });
});
