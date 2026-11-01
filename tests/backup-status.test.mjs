// 7-4 最後のバックアップ（全件の zip）と30日の知らせのテスト
import { test } from "node:test";
import assert from "node:assert/strict";
import { loadCore } from "./helpers.mjs";

const core = loadCore();
const DAY = 24 * 60 * 60 * 1000;
const NOW = new Date(2026, 10, 1, 12, 0, 0);
const ago = (ms) => core.isoLocal(new Date(NOW.getTime() - ms));

test("BACKUP_REMIND_DAYS: 30日", () => {
  assert.equal(core.BACKUP_REMIND_DAYS, 30);
});

test("backupStatus: したことがない・日時が読めないときは、日時なし・知らせなし", () => {
  assert.deepEqual(core.backupStatus(undefined, NOW), { at: null, remind: false });
  assert.deepEqual(core.backupStatus("", NOW), { at: null, remind: false });
  assert.deepEqual(core.backupStatus("こわれた日時", NOW), { at: null, remind: false });
  assert.deepEqual(core.backupStatus(1700000000000, NOW), { at: null, remind: false }, "数値は記録しない形なので読まない");
});

test("backupStatus: 30日未満は知らせない。ちょうど30日から知らせる", () => {
  assert.equal(core.backupStatus(ago(0), NOW).remind, false);
  assert.equal(core.backupStatus(ago(29 * DAY), NOW).remind, false);
  assert.equal(core.backupStatus(ago(30 * DAY - 1000), NOW).remind, false);
  assert.equal(core.backupStatus(ago(30 * DAY), NOW).remind, true);
  assert.equal(core.backupStatus(ago(90 * DAY), NOW).remind, true);
});

test("backupStatus: 日時はそのまま返す。未来の日時（端末の時計がずれた）は知らせない", () => {
  const at = ago(3 * DAY);
  assert.deepEqual(core.backupStatus(at, NOW), { at, remind: false });
  assert.equal(core.backupStatus(core.isoLocal(new Date(NOW.getTime() + 5 * DAY)), NOW).remind, false);
});
