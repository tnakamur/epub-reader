'use strict';

const { pool } = require('../config/db');

const Book = {
  /** ユーザーの本棚一覧（進捗率結合） */
  async findAllByUser(userId) {
    const { rows } = await pool.query(
      `SELECT
         b.id, b.title, b.author, b.publisher, b.language,
         b.description, b.cover_path, b.filename, b.file_size,
         b.folder_id, b.created_at,
         COALESCE(p.percentage, 0) AS percentage,
         p.cfi AS last_cfi
       FROM books b
       LEFT JOIN progress p ON p.book_id = b.id AND p.user_id = $1
       WHERE b.user_id = $1
       ORDER BY b.created_at DESC`,
      [userId]
    );
    return rows;
  },

  /** 1冊取得（所有確認込み） */
  async findByIdAndUser(bookId, userId) {
    const { rows } = await pool.query(
      `SELECT id, title, author, publisher, language, description,
              cover_path, filename, storage_path, file_size, created_at
       FROM books
       WHERE id = $1 AND user_id = $2`,
      [bookId, userId]
    );
    return rows[0] || null;
  },

  async create({ userId, filename, storagePath, fileSize, meta }) {
    const { rows } = await pool.query(
      `INSERT INTO books
         (user_id, filename, storage_path, file_size,
          title, author, publisher, language, description, cover_path)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
       RETURNING id, title, author, filename, file_size, created_at`,
      [
        userId,
        filename,
        storagePath,
        fileSize,
        meta.title       || filename,
        meta.author      || '',
        meta.publisher   || '',
        meta.language    || '',
        meta.description || '',
        meta.coverPath   || '',
      ]
    );
    return rows[0];
  },

  async updateFolder(bookId, userId, folderId) {
    const { rows } = await pool.query(
      `UPDATE books SET folder_id = $3
       WHERE id = $1 AND user_id = $2
       RETURNING id, folder_id`,
      [bookId, userId, folderId]
    );
    return rows[0] || null;
  },

  async deleteByIdAndUser(bookId, userId) {
    const { rows } = await pool.query(
      `DELETE FROM books
       WHERE id = $1 AND user_id = $2
       RETURNING storage_path, cover_path`,
      [bookId, userId]
    );
    return rows[0] || null; // 削除された行のパス情報を返す
  },
};

module.exports = Book;
