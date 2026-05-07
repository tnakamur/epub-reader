'use strict';

const fs   = require('fs/promises');
const path = require('path');

const UPLOAD_DIR = process.env.UPLOAD_DIR || '/app/uploads';

/**
 * ファイルを安全に削除（存在しない場合は無視）
 */
async function removeFile(filename) {
  if (!filename) return;
  // パストラバーサル対策: basename のみ許可
  const safe = path.basename(filename);
  const fullPath = path.join(UPLOAD_DIR, safe);
  try {
    await fs.unlink(fullPath);
  } catch (err) {
    if (err.code !== 'ENOENT') {
      console.warn('[fileHelper] Failed to remove file:', fullPath, err.message);
    }
  }
}

/**
 * storage_path からフルパスを返す（パストラバーサル対策済み）
 */
function resolveStoragePath(storagePath) {
  const safe = path.basename(storagePath);
  return path.join(UPLOAD_DIR, safe);
}

module.exports = { removeFile, resolveStoragePath, UPLOAD_DIR };
