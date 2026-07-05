'use strict';

const { pool } = require('../config/db');

const Bookmark = {
  async findByBook(bookId, userId) {
    const { rows } = await pool.query(
      `SELECT id, cfi, label, section_percent, created_at, updated_at
       FROM bookmarks
       WHERE book_id = $1 AND user_id = $2 AND deleted_at IS NULL
       ORDER BY created_at ASC`,
      [bookId, userId]
    );
    return rows;
  },

  async findUpdatedSince(userId, since) {
    const { rows } = await pool.query(
      `SELECT id, book_id, cfi, label, section_percent, deleted_at, created_at, updated_at
       FROM bookmarks
       WHERE user_id = $1 AND updated_at > $2
       ORDER BY updated_at ASC`,
      [userId, since]
    );
    return rows;
  },

  async create({ userId, bookId, cfi, label, sectionPercent }) {
    const { rows } = await pool.query(
      `INSERT INTO bookmarks (user_id, book_id, cfi, label, section_percent)
       VALUES ($1,$2,$3,$4,$5)
       RETURNING id, cfi, label, section_percent, created_at`,
      [userId, bookId, cfi, label || '', sectionPercent ?? null]
    );
    return rows[0];
  },

  async softDelete(id, userId) {
    const { rows } = await pool.query(
      `UPDATE bookmarks
       SET deleted_at = NOW()
       WHERE id = $1 AND user_id = $2 AND deleted_at IS NULL
       RETURNING id`,
      [id, userId]
    );
    return rows[0] || null;
  },
};

module.exports = Bookmark;
