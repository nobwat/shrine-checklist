// index.html の「data-core」区間を取り出して、Node で動かすための道具
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const html = readFileSync(fileURLToPath(new URL("../index.html", import.meta.url)), "utf8");

function between(start, end) {
  const i = html.indexOf(start);
  const j = html.indexOf(end);
  if (i < 0 || j < 0 || j < i) throw new Error(`index.html に ${start} 〜 ${end} が見つかりません`);
  return html.slice(i, j);
}

// アプリと同じ定数を使う（テスト側で値を書き写さない）
function constLine(name) {
  const m = html.match(new RegExp(`const ${name} = [^;]+;`));
  if (!m) throw new Error(`index.html に const ${name} が見つかりません`);
  return m[0];
}

const CONSTS = ["STORAGE_KEY", "BACKUP_PREFIX", "BACKUP_KEEP", "META_KEY", "SETTINGS_KEY"];
const CORE = [...CONSTS.map(constLine), between("// ==== data-core:start ====", "// ==== data-core:end ====")].join("\n");
const EXPORTS = [
  ...CONSTS, "stamp", "isoLocal", "isPlainObject", "entryProblem", "validateEntries", "readStored", "applyChanges", "commitChanges",
  "readMeta", "listBackups", "makeBackup", "pruneBackups", "migrateEntries", "verifyMigration", "runMigration", "recordMigration",
  "summarizeMedia", "deleteConfirmText",
  "restoreBackup", "parseExportFile", "compareWithExport", "compareVerdict",
  "DRAFT_RESUME_MS", "newEntryId", "newDraftEntry", "findResumableDraft", "isEmptyDraft", "staleEmptyDraftIds",
  "PHOTO_LABELS", "photoLabelName", "PHOTO_MAX_EDGE_DEFAULT", "CANVAS_MAX_PIXELS", "THUMB_EDGE", "fitPhotoSize",
  "nextMediaSeq", "extForFile", "newMediaId", "newPhotoMeta", "formatMediaSize", "photoSizeText",
  "AUDIO_MIME_CANDIDATES", "AUDIO_MAX_SEC_DEFAULT", "AUDIO_MAX_SEC_CHOICES", "REC_RECOVER_IDLE_MS",
  "pickAudioMime", "audioExt", "formatDuration", "newAudioMeta", "planRecovery",
  "requestScreenWakeLock", "releaseScreenWakeLock",
  "MEMO_SAVE_DELAY_MS", "textByteSize", "newMemoMeta", "memoPreview",
  "PHOTO_MAX_EDGE_CHOICES", "normalizeSettings", "readSettings", "writeSettings", "storageWarning",
  "TIMEBANDS_DEFAULT", "TIMEBAND_LABELS", "parseHHMM", "timebandsProblem", "timebandOf",
  "AUTO_FILL_KEYS", "planAutoFill", "isAutoValue", "planAutoCheck", "autoChecksToUndo", "autoCheckName",
  "GEO_OPTIONS", "GEO_APP_TIMEOUT_MS", "GEO_COARSE_M", "geoErrorStatus", "locationFromPosition", "parseManualLocation",
  "manualLocation", "hasCoords", "locationAfterFailure", "isCoarseLocation", "locationText",
  "WEATHER_TIMEOUT_MS", "WEATHER_CURRENT_MAX_MS", "WEATHER_RETRY_GAP_MS", "WEATHER_PAST_DAYS_MAX", "WEATHER_PROVIDER",
  "weatherPastRequest", "weatherRetryTargets", "roundCoordForApi", "weatherLabel", "weatherText",
  "isManualWeather", "summarizeWeather", "autoFillValuesFor", "weatherPlan", "weatherFailureStatus", "weatherAfterFailure", "weatherStatusText",
];

// localStorage の代わり。quota（文字数の合計の上限）を超える setItem は例外にする
export class FakeStorage {
  constructor(quota = Infinity) {
    this.map = new Map();
    this.quota = quota;
  }
  get length() { return this.map.size; }
  key(i) { return [...this.map.keys()][i] ?? null; }
  getItem(k) { return this.map.has(k) ? this.map.get(k) : null; }
  setItem(k, v) {
    v = String(v);
    let used = 0;
    for (const [key, val] of this.map) if (key !== k) used += key.length + val.length;
    if (used + k.length + v.length > this.quota) {
      const e = new Error("The quota has been exceeded.");
      e.name = "QuotaExceededError";
      throw e;
    }
    this.map.set(k, v);
  }
  removeItem(k) { this.map.delete(k); }
}

// storage を localStorage として使う data-core 一式を返す。crypto を差し替えることもできる
export function loadCore(storage = new FakeStorage(), { crypto = globalThis.crypto } = {}) {
  const fn = new Function("localStorage", "crypto", `${CORE}\nreturn { ${EXPORTS.join(", ")} };`);
  return { ...fn(storage, crypto), storage };
}

// 過去の版が作っていた形の架空の記録（実データではない）
export const OLD_RECORDS = {
  // c1a83d1・5267e55 の形（visit が無い）
  v1NoVisit: { id: "s_test0001aaaa", name: "テスト神社A", checks: { b1: true }, updatedAt: 1700000000000 },
  // b6fb273〜6dec8ea の形
  v1WithVisit: { id: "s_test0002bbbb", name: "テスト神社B", checks: {}, visit: { v_date: "2026-01-02", v_spot_torii_chk: true }, updatedAt: 1700000001000 },
  // 作っただけで名前が空
  emptyName: { id: "s_test0003cccc", name: "", checks: {}, visit: {}, updatedAt: 1700000002000 },
  // 知らない項目がある
  extraField: { id: "s_test0004dddd", name: "テスト神社D", checks: {}, visit: {}, updatedAt: 1700000003000, memoFromFuture: { a: 1 } },
};
// 新しい版（schemaVersion 2）で作った形の架空の記録
export const V2_RECORD = {
  id: "s_test0005eeee", name: "テスト神社E", checks: {}, visit: {}, updatedAt: 1700000004000,
  schemaVersion: 2, status: "final", createdAt: "2026-10-21T10:00:00+09:00",
};
