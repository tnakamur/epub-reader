'use strict';

const { pool } = require('../config/db');

const Highlight = {
  /** 書籍のハイライト一覧（論理削除済みを除く） */
  async findByBook(bookId, userId) {
    const { rows } = await pool.query(
      `SELECT id, cfi_range, selected_text, color, note, created_at, updated_at
       FROM highlights
       WHERE book_id = $1 AND user_id = $2 AND deleted_at IS NULL
       ORDER BY created_at ASC`,
      [bookId, userId]
    );
    return rows;
  },

  /** オフライン同期: updated_at 以降に更新された全ハイライト */
  async findUpdatedSince(userId, since) {
    const { rows } = await pool.query(
      `SELECT id, book_id, cfi_range, selected_text, color, note,
              deleted_at, created_at, updated_at
       FROM highlights
       WHERE user_id = $1 AND updated_at > $2
       ORDER BY updated_at ASC`,
      [userId, since]
    );
    return rows;
  },

  async create({ userId, bookId, cfiRange, selectedText, color, note }) {
    const { rows } = await pool.query(
      `INSERT INTO highlights (user_id, book_id, cfi_range, selected_text, color, note)
       VALUES ($1,$2,$3,$4,$5,$6)
       RETURNING id, cfi_range, selected_text, color, note, created_at`,
      [userId, bookId, cfiRange, selectedText, color || 'yellow', note || '']
    );
    return rows[0];
  },

  /** メモ・色の更新 */
  async update(id, userId, { color, note }) {
    const { rows } = await pool.query(
      `UPDATE highlights
       SET color = COALESCE($3, color),
           note  = COALESCE($4, note)
       WHERE id = $1 AND user_id = $2 AND deleted_at IS NULL
       RETURNING id, color, note, updated_at`,
      [id, userId, color, note]
    );
    return rows[0] || null;
  },

  /** 論理削除 */
  async softDelete(id, userId) {
    const { rows } = await pool.query(
      `UPDATE highlights
       SET deleted_at = NOW()
       WHERE id = $1 AND user_id = $2 AND deleted_at IS NULL
       RETURNING id`,
      [id, userId]
    );
    return rows[0] || null;
  },
};

module.exports = Highlight;
