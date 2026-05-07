'use strict';

const Book       = require('../models/Book');
const { parseEpub }        = require('../utils/epubParser');
const { removeFile }       = require('../utils/fileHelper');

/** GET /api/books */
async function list(req, res, next) {
  try {
    const books = await Book.findAllByUser(req.user.id);
    res.json(books);
  } catch (err) {
    next(err);
  }
}

/** GET /api/books/:id */
async function show(req, res, next) {
  try {
    const book = await Book.findByIdAndUser(req.params.id, req.user.id);
    if (!book) return res.status(404).json({ error: '書籍が見つかりません' });
    res.json(book);
  } catch (err) {
    next(err);
  }
}

/** POST /api/books  (multipart/form-data, field: epub) */
async function upload(req, res, next) {
  // multer が req.file にセット済み
  if (!req.file) {
    return res.status(400).json({ error: 'EPUBファイルが選択されていません' });
  }

  try {
    // EPUBメタデータ抽出
    const meta = await parseEpub(req.file.path);

    const book = await Book.create({
      userId:      req.user.id,
      filename:    req.file.originalname,
      storagePath: req.file.filename,   // uuid.epub
      fileSize:    req.file.size,
      meta,
    });

    res.status(201).json(book);
  } catch (err) {
    // DB登録失敗時はアップロードファイルを削除
    await removeFile(req.file.filename).catch(() => {});
    next(err);
  }
}

/** DELETE /api/books/:id */
async function destroy(req, res, next) {
  try {
    const deleted = await Book.deleteByIdAndUser(req.params.id, req.user.id);
    if (!deleted) return res.status(404).json({ error: '書籍が見つかりません' });

    // EPUBファイルとカバー画像を削除
    await removeFile(deleted.storage_path);
    await removeFile(deleted.cover_path);

    res.status(204).end();
  } catch (err) {
    next(err);
  }
}

module.exports = { list, show, upload, destroy };
