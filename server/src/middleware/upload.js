'use strict';

const multer = require('multer');
const path   = require('path');
const { v4: uuidv4 } = require('uuid');

const UPLOAD_DIR    = process.env.UPLOAD_DIR || '/app/uploads';
const MAX_SIZE_MB   = parseInt(process.env.MAX_FILE_SIZE_MB || '50', 10);
const MAX_SIZE_BYTE = MAX_SIZE_MB * 1024 * 1024;

// ── ストレージ設定 ────────────────────────────────
const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOAD_DIR),
  filename: (_req, _file, cb) => {
    // uuid.epub で保存 → オリジナルファイル名はDBに保持
    cb(null, `${uuidv4()}.epub`);
  },
});

// ── MIMEタイプ検証 ────────────────────────────────
function fileFilter(_req, file, cb) {
  const allowedMimes = [
    'application/epub+zip',
    'application/octet-stream', // 一部ブラウザはこれで送る
  ];
  const ext = path.extname(file.originalname).toLowerCase();

  if (allowedMimes.includes(file.mimetype) || ext === '.epub') {
    cb(null, true);
  } else {
    cb(new Error('EPUBファイルのみアップロード可能です'), false);
  }
}

const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: MAX_SIZE_BYTE },
});

module.exports = { upload, UPLOAD_DIR };
