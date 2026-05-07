'use strict';

const path = require('path');
const fs   = require('fs');
const Book = require('../models/Book');
const { resolveStoragePath } = require('../utils/fileHelper');

/**
 * GET /epub/:id
 * JWT認証済みユーザーにEPUBファイルをストリーム配信
 * Range リクエスト対応（EPUB.js が部分取得を行うため必須）
 */
async function serveEpub(req, res, next) {
  try {
    const book = await Book.findByIdAndUser(req.params.id, req.user.id);
    if (!book) return res.status(404).json({ error: '書籍が見つかりません' });

    const filePath = resolveStoragePath(book.storage_path);

    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: 'EPUBファイルが見つかりません' });
    }

    const stat     = fs.statSync(filePath);
    const fileSize = stat.size;
    const range    = req.headers.range;

    if (range) {
      // ── Range リクエスト処理 ──────────────────────
      const parts = range.replace(/bytes=/, '').split('-');
      const start = parseInt(parts[0], 10);
      const end   = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;

      if (start >= fileSize || end >= fileSize) {
        return res.status(416).set('Content-Range', `bytes */${fileSize}`).end();
      }

      const chunkSize = end - start + 1;
      const fileStream = fs.createReadStream(filePath, { start, end });

      res.status(206).set({
        'Content-Range':  `bytes ${start}-${end}/${fileSize}`,
        'Accept-Ranges':  'bytes',
        'Content-Length': chunkSize,
        'Content-Type':   'application/epub+zip',
        'Cache-Control':  'private, max-age=3600',
      });
      fileStream.pipe(res);
    } else {
      // ── フル配信 ──────────────────────────────────
      res.set({
        'Content-Type':   'application/epub+zip',
        'Content-Length': fileSize,
        'Accept-Ranges':  'bytes',
        'Cache-Control':  'private, max-age=3600',
        'Content-Disposition': `inline; filename="${encodeURIComponent(book.filename)}"`,
      });
      fs.createReadStream(filePath).pipe(res);
    }
  } catch (err) {
    next(err);
  }
}

/**
 * GET /epub/:id/cover
 * カバー画像を配信（未認証でも可にする場合はミドルウェアを外す）
 */
async function serveCover(req, res, next) {
  try {
    const book = await Book.findByIdAndUser(req.params.id, req.user.id);
    if (!book || !book.cover_path) {
      return res.status(404).json({ error: 'カバー画像がありません' });
    }

    const filePath = resolveStoragePath(book.cover_path);
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: 'カバー画像ファイルが見つかりません' });
    }

    const ext = path.extname(book.cover_path).toLowerCase();
    const mimeMap = { '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.gif': 'image/gif', '.webp': 'image/webp' };
    const mime = mimeMap[ext] || 'image/jpeg';

    res.set({
      'Content-Type':  mime,
      'Cache-Control': 'private, max-age=86400',
    });
    fs.createReadStream(filePath).pipe(res);
  } catch (err) {
    next(err);
  }
}

module.exports = { serveEpub, serveCover };
