'use strict';

const Progress = require('../models/Progress');
const Book     = require('../models/Book');

/** GET /api/progress/:bookId */
async function show(req, res, next) {
  try {
    const book = await Book.findByIdAndUser(req.params.bookId, req.user.id);
    if (!book) return res.status(404).json({ error: '書籍が見つかりません' });

    const progress = await Progress.findByBook(req.params.bookId, req.user.id);
    if (!progress) return res.json({ cfi: '', percentage: 0 });
    res.json(progress);
  } catch (err) {
    next(err);
  }
}

/** GET /api/progress/sync?since=ISO8601 */
async function sync(req, res, next) {
  try {
    const since = req.query.since
      ? new Date(req.query.since)
      : new Date(0);

    if (isNaN(since.getTime())) {
      return res.status(400).json({ error: 'since パラメータが不正です' });
    }

    const progresses = await Progress.findUpdatedSince(req.user.id, since);
    res.json(progresses);
  } catch (err) {
    next(err);
  }
}

/** PUT /api/progress/:bookId */
async function upsert(req, res, next) {
  try {
    const { cfi, percentage, deviceId } = req.body;

    if (cfi === undefined || percentage === undefined) {
      return res.status(400).json({ error: 'cfi と percentage は必須です' });
    }
    if (percentage < 0 || percentage > 100) {
      return res.status(400).json({ error: 'percentage は 0〜100 の範囲で指定してください' });
    }

    const book = await Book.findByIdAndUser(req.params.bookId, req.user.id);
    if (!book) return res.status(404).json({ error: '書籍が見つかりません' });

    const progress = await Progress.upsert({
      userId: req.user.id,
      bookId: req.params.bookId,
      cfi,
      percentage,
      deviceId,
    });

    res.json(progress);
  } catch (err) {
    next(err);
  }
}

module.exports = { show, sync, upsert };
