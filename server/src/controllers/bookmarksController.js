'use strict';

const Bookmark = require('../models/Bookmark');
const Book     = require('../models/Book');

async function list(req, res, next) {
  try {
    const book = await Book.findByIdAndUser(req.params.bookId, req.user.id);
    if (!book) return res.status(404).json({ error: '書籍が見つかりません' });
    const bookmarks = await Bookmark.findByBook(req.params.bookId, req.user.id);
    res.json(bookmarks);
  } catch (err) {
    next(err);
  }
}

async function sync(req, res, next) {
  try {
    const since = req.query.since ? new Date(req.query.since) : new Date(0);
    if (isNaN(since.getTime())) return res.status(400).json({ error: 'since パラメータが不正です' });
    const bookmarks = await Bookmark.findUpdatedSince(req.user.id, since);
    res.json(bookmarks);
  } catch (err) {
    next(err);
  }
}

async function create(req, res, next) {
  try {
    const cfi = req.body.cfi;
    const label = req.body.label;
    if (!cfi) return res.status(400).json({ error: 'cfi は必須です' });

    const book = await Book.findByIdAndUser(req.params.bookId, req.user.id);
    if (!book) return res.status(404).json({ error: '書籍が見つかりません' });

    const bookmark = await Bookmark.create({
      userId: req.user.id,
      bookId: req.params.bookId,
      cfi, label,
    });
    res.status(201).json(bookmark);
  } catch (err) {
    next(err);
  }
}

async function destroy(req, res, next) {
  try {
    const deleted = await Bookmark.softDelete(req.params.id, req.user.id);
    if (!deleted) return res.status(404).json({ error: 'ブックマークが見つかりません' });
    res.status(204).end();
  } catch (err) {
    next(err);
  }
}

module.exports = { list, sync, create, destroy };
