'use strict';

const Highlight = require('../models/Highlight');
const Book      = require('../models/Book');

/** GET /api/highlights/:bookId */
async function list(req, res, next) {
  try {
    // 書籍の所有確認
    const book = await Book.findByIdAndUser(req.params.bookId, req.user.id);
    if (!book) return res.status(404).json({ error: '書籍が見つかりません' });

    const highlights = await Highlight.findByBook(req.params.bookId, req.user.id);
    res.json(highlights);
  } catch (err) {
    next(err);
  }
}

/** GET /api/highlights/sync?since=ISO8601 */
async function sync(req, res, next) {
  try {
    const since = req.query.since
      ? new Date(req.query.since)
      : new Date(0);

    if (isNaN(since.getTime())) {
      return res.status(400).json({ error: 'since パラメータが不正です' });
    }

    const highlights = await Highlight.findUpdatedSince(req.user.id, since);
    res.json(highlights);
  } catch (err) {
    next(err);
  }
}

/** POST /api/highlights/:bookId */
async function create(req, res, next) {
  try {
    const { cfiRange, selectedText, color, note } = req.body;
    if (!cfiRange || !selectedText) {
      return res.status(400).json({ error: 'cfiRange と selectedText は必須です' });
    }

    const book = await Book.findByIdAndUser(req.params.bookId, req.user.id);
    if (!book) return res.status(404).json({ error: '書籍が見つかりません' });

    const highlight = await Highlight.create({
      userId: req.user.id,
      bookId: req.params.bookId,
      cfiRange, selectedText, color, note,
    });

    res.status(201).json(highlight);
  } catch (err) {
    next(err);
  }
}

/** PATCH /api/highlights/:id */
async function update(req, res, next) {
  try {
    const { color, note } = req.body;
    const updated = await Highlight.update(req.params.id, req.user.id, { color, note });
    if (!updated) return res.status(404).json({ error: 'ハイライトが見つかりません' });
    res.json(updated);
  } catch (err) {
    next(err);
  }
}

/** DELETE /api/highlights/:id */
async function destroy(req, res, next) {
  try {
    const deleted = await Highlight.softDelete(req.params.id, req.user.id);
    if (!deleted) return res.status(404).json({ error: 'ハイライトが見つかりません' });
    res.status(204).end();
  } catch (err) {
    next(err);
  }
}

module.exports = { list, sync, create, update, destroy };
