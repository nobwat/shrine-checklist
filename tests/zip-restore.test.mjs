// 7-3 zip からの復元（manifest・visit.json の検査、新規・重複の数え方、書き込む変更、作った zip を読み戻して元に戻ること）のテスト。
// IndexedDB への書き込みとサムネイルの作り直しは PC の Chrome で確認する。記録・座標はすべて架空
import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { loadCore } from "./helpers.mjs";

const core = loadCore();
const JSZip = createRequire(import.meta.url)("../vendor/jszip.min.js");
const NOW = new Date(2026, 10, 1, 9, 30, 0);

const rec = (id, name, over = {}) => ({ id, name, checks: { b1: true }, visit: { v_spot_torii_chk: true }, updatedAt: 1700000000000, schemaVersion: 2, status: "final", createdAt: "2026-10-17T10:00:00+09:00", ...over });
const A = rec("s_test0041aaaa", "テスト神社A", { autoChecks: { v_spot_torii_chk: { mediaId: "p1", at: "2026-10-17T10:01:00+09:00" } } });
const B = rec("s_test0042bbbb", "テスト神社B", { status: "draft", field: { visitAt: "2026-10-18T09:00:00+09:00", location: { lat: 35.0001, lon: 135.0001, accuracyM: 10, status: "ok" } } });
const photo = (id, visitId, seq, over = {}) => ({ id, visitId, type: "photo", seq, createdAt: "2026-10-17T10:01:00+09:00", updatedAt: "2026-10-17T10:01:00+09:00", mimeType: "image/jpeg", ext: "jpg", size: 4, width: 2, height: 2, label: "torii", exifStripped: true, ...over });
const audio = (id, visitId, seq) => ({ id, visitId, type: "audio", seq, createdAt: "2026-10-17T10:02:00+09:00", mimeType: "audio/webm", ext: "webm", size: 3, durationSec: 1, interrupted: false });
const memo = (id, visitId, seq, text) => ({ id, visitId, type: "memo", seq, createdAt: "2026-10-17T10:03:00+09:00", text });
const visitText = (entry, media) => JSON.stringify({ format: "shrine-checklist-visit", formatVersion: 1, entry, media });

// ---------- manifest ----------

test("parseZipManifest: 1神社の zip は visit.json を1つ読む", () => {
  const r = core.parseZipManifest(JSON.stringify({ format: core.ZIP_FORMAT, formatVersion: 1, kind: "visit", visitIds: [A.id], files: [] }));
  assert.equal(r.ok, true);
  assert.deepEqual(r.visits, [{ folder: "", path: "visit.json" }]);
});

test("parseZipManifest: 全件の zip はフォルダごとの visit.json を読む", () => {
  const r = core.parseZipManifest(JSON.stringify({ format: core.ZIP_FORMAT, formatVersion: 1, kind: "all", folders: [{ visitId: A.id, folder: "20261017_A" }, { visitId: B.id, folder: "20261018_B" }] }));
  assert.deepEqual(r.visits, [{ folder: "20261017_A/", path: "20261017_A/visit.json" }, { folder: "20261018_B/", path: "20261018_B/visit.json" }]);
});

test("parseZipManifest: このアプリの zip でない・壊れている・新しい版・種類が分からないものは断る", () => {
  assert.match(core.parseZipManifest("").error, /このアプリで作った zip ではありません/);
  assert.match(core.parseZipManifest("{").error, /このアプリで作った zip ではありません/);
  assert.match(core.parseZipManifest(JSON.stringify({ format: "other" })).error, /このアプリで作った zip ではありません/);
  assert.match(core.parseZipManifest(JSON.stringify({ format: core.ZIP_FORMAT, formatVersion: 0, kind: "visit" })).error, /形式の版/);
  assert.match(core.parseZipManifest(JSON.stringify({ format: core.ZIP_FORMAT, formatVersion: 2, kind: "visit" })).error, /新しいバージョン/);
  assert.match(core.parseZipManifest(JSON.stringify({ format: core.ZIP_FORMAT, formatVersion: 1, kind: "x" })).error, /種類/);
  assert.match(core.parseZipManifest(JSON.stringify({ format: core.ZIP_FORMAT, formatVersion: 1, kind: "all", folders: [{ folder: "" }] })).error, /フォルダ/);
  assert.match(core.parseZipManifest(JSON.stringify({ format: core.ZIP_FORMAT, formatVersion: 1, kind: "all" })).error, /フォルダ/);
});

// ---------- visit.json ----------

test("parseVisitJson: 記録はそのまま。写真・録音は zip の中の名前と組にし、メタ情報から file を取り除く", () => {
  const media = [{ ...photo("p1", A.id, 1), file: "photos/01_鳥居.jpg" }, { ...audio("a1", A.id, 2), file: "audio/02.webm" }, memo("m1", A.id, 3, "本文")];
  const r = core.parseVisitJson(visitText(A, media), "20261017_A/");
  assert.equal(r.ok, true);
  assert.deepEqual(r.entry, A);
  assert.deepEqual(r.media, [
    { meta: photo("p1", A.id, 1), path: "20261017_A/photos/01_鳥居.jpg" },
    { meta: audio("a1", A.id, 2), path: "20261017_A/audio/02.webm" },
    { meta: memo("m1", A.id, 3, "本文"), path: null },
  ]);
  assert.equal(r.skipped, 0);
});

test("parseVisitJson: メタ情報の visitId は記録の id にそろえる", () => {
  const r = core.parseVisitJson(visitText(A, [{ ...photo("p1", "s_other", 1), file: "photos/01.jpg" }]), "");
  assert.equal(r.media[0].meta.visitId, A.id);
});

test("parseVisitJson: 形の正しくない写真・録音・メモは入れずに数える", () => {
  const media = [photo("p1", A.id, 1), { ...audio("", A.id, 2), file: "audio/02.webm" }, { id: "x1", type: "video", file: "v.mp4" }, "文字", memo("m1", A.id, 3, "ok")];
  const r = core.parseVisitJson(visitText(A, media), "");
  assert.deepEqual(r.media.map(x => x.meta.id), ["m1"]);
  assert.equal(r.skipped, 4, "file の無い写真・id の無い録音・知らない種類・オブジェクトでないもの");
});

test("parseVisitJson: 壊れた visit.json・記録の形が正しくないものは断る", () => {
  assert.match(core.parseVisitJson("", "F/").error, /F\/visit\.json が読めません/);
  assert.match(core.parseVisitJson(JSON.stringify({ format: "x" }), "").error, /visit\.json が読めません/);
  assert.match(core.parseVisitJson(JSON.stringify({ format: "shrine-checklist-visit", formatVersion: 2, entry: A }), "").error, /形式の版/);
  assert.match(core.parseVisitJson(visitText({ name: "id なし" }, []), "").error, /id がありません/);
  assert.match(core.parseVisitJson(visitText({ ...A, visit: "x" }, []), "").error, /visit の形式/);
});

test("parseVisitJson: media が無い visit.json は、写真などなしで読む", () => {
  const r = core.parseVisitJson(JSON.stringify({ format: "shrine-checklist-visit", formatVersion: 1, entry: A }), "");
  assert.deepEqual(r.media, []);
});

// ---------- 新規・重複の数え方 ----------

const v = (entry, media = []) => ({ ok: true, entry, media: media.map(meta => ({ meta, path: meta.type === "memo" ? null : "x" })), skipped: 0 });

test("planZipRestore: 今ある記録は重複、無いものは新規", () => {
  const p = core.planZipRestore([v(A), v(B)], new Set([A.id]), []);
  assert.deepEqual(p.fresh.map(x => x.entry.id), [B.id]);
  assert.deepEqual(p.dup.map(x => x.entry.id), [A.id]);
  assert.equal(p.localOnly, 0);
});

test("planZipRestore: 上書きすると消える、この端末にだけあるメディアを数える（新規の記録・zip にあるものは数えない）", () => {
  const local = [photo("p1", A.id, 1), photo("p9", A.id, 9), memo("m9", A.id, 10, "端末だけ"), photo("q1", B.id, 1), photo("o1", "s_orphan", 1)];
  const p = core.planZipRestore([v(A, [photo("p1", A.id, 1)]), v(B)], new Set([A.id]), local);
  assert.equal(p.localOnly, 2, "A の p9・m9");
});

test("planZipRestore: zip に同じ記録が2回あれば、最初のものだけ", () => {
  const p = core.planZipRestore([v(A), v({ ...A, name: "後の版" })], new Set(), []);
  assert.equal(p.fresh.length, 1);
  assert.equal(p.fresh[0].entry.name, "テスト神社A");
});

test("zipRestoreSummary: 件数と、上書きで消える件数を出す", () => {
  const p = core.planZipRestore([v(A), v(B)], new Set([A.id]), [photo("p9", A.id, 9)]);
  const text = core.zipRestoreSummary(p);
  assert.match(text, /zip の記録：2件\n新規 1件・重複 1件/);
  assert.match(text, /zip の中身に置き換えます/);
  assert.match(text, /この端末にだけある写真・録音・メモ1件は消えます/);
  const noLoss = core.zipRestoreSummary(core.planZipRestore([v(A)], new Set([A.id]), []));
  assert.doesNotMatch(noLoss, /消えます/);
  assert.match(core.zipRestoreSummary(core.planZipRestore([v(B)], new Set(), [])), /新規 1件・重複 0件\n\n復元しますか？/);
});

// ---------- 書き込む変更 ----------

test("zipRestoreChanges: 新規は足す。上書きは消してから zip の記録を足す（他の記録は変えない）", () => {
  const old = { ...A, name: "古い版", visit: { v_memo: "端末の版" } };
  const other = rec("s_test0043cccc", "テスト神社C");
  const changes = core.zipRestoreChanges([v(A), v(B)], new Set([A.id, other.id]));
  assert.deepEqual(changes.map(c => [c.op, c.id || c.entry.id]), [["delete", A.id], ["add", A.id], ["add", B.id]]);
  const list = core.applyChanges([JSON.parse(JSON.stringify(old)), JSON.parse(JSON.stringify(other))], changes);
  assert.deepEqual(list.find(e => e.id === A.id), A, "zip の内容に置き換わる（端末の版の項目は残らない）");
  assert.deepEqual(list.find(e => e.id === B.id), B);
  assert.deepEqual(list.find(e => e.id === other.id), other);
  assert.equal(list.length, 3);
});

// ---------- 作った zip を読み戻す ----------

async function readBack(bytes) {
  const zip = await JSZip.loadAsync(bytes);
  const m = core.parseZipManifest(await zip.file("manifest.json").async("string"));
  assert.equal(m.ok, true);
  const visits = [];
  for (const x of m.visits) visits.push(core.parseVisitJson(await zip.file(x.path).async("string"), x.folder));
  return { zip, visits };
}

test("1神社の zip を読み戻すと、記録とメディアの情報が元と同じ。本体も zip の中の名前で取り出せる", async () => {
  const media = [photo("p1", A.id, 1), audio("a1", A.id, 2), memo("m1", A.id, 3, "メモ")];
  const data = new Map([["p1", new Uint8Array([1, 2, 3, 4])], ["a1", new Uint8Array([7, 8, 9])]]);
  const plan = core.planVisitZip(A, media, new Map([["p1", 4], ["a1", 3]]), "2.0.0-test", NOW);
  const bytes = await (await core.fillZip(new JSZip(), plan.files, (id) => data.get(id))).generateAsync({ type: "uint8array" });
  const { zip, visits } = await readBack(bytes);
  assert.equal(visits.length, 1);
  assert.deepEqual(visits[0].entry, A);
  assert.deepEqual(visits[0].media.map(x => x.meta), media);
  for (const x of visits[0].media.filter(x => x.path)) {
    assert.deepEqual(await zip.file(x.path).async("uint8array"), data.get(x.meta.id));
  }
});

test("全件の zip を読み戻すと、すべての記録とメディアが元と同じ", async () => {
  const media = [photo("p1", A.id, 1), memo("m1", A.id, 2, "Aのメモ"), audio("a1", B.id, 1)];
  const data = new Map([["p1", new Uint8Array([1, 1])], ["a1", new Uint8Array([2])]]);
  const plan = core.planAllZip([A, B], core.groupMediaByVisit(media), new Map([["p1", 2], ["a1", 1]]), "2.0.0-test", NOW);
  const bytes = await (await core.fillZip(new JSZip(), plan.files, (id) => data.get(id))).generateAsync({ type: "uint8array" });
  const { zip, visits } = await readBack(bytes);
  assert.deepEqual(visits.map(x => x.entry), [A, B]);
  assert.deepEqual(visits.flatMap(x => x.media.map(y => y.meta)), media);
  assert.deepEqual(await zip.file(visits[1].media[0].path).async("uint8array"), data.get("a1"));
  // 同じ zip をもう一度復元すると、すべて重複になる
  const again = core.planZipRestore(visits, new Set([A.id, B.id]), media);
  assert.equal(again.fresh.length, 0);
  assert.equal(again.dup.length, 2);
  assert.equal(again.localOnly, 0);
});
