-- ============================================================
-- 002_create_books.sql
-- 書籍テーブル（EPUBファイル管理）
-- ============================================================

CREATE TABLE IF NOT EXISTS books (
    id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,

    -- ファイル情報
    filename        TEXT        NOT NULL,           -- 元のファイル名
    storage_path    TEXT        NOT NULL UNIQUE,    -- サーバー上の保存パス (uploads/{uuid}.epub)
    file_size       BIGINT      NOT NULL DEFAULT 0, -- バイト数

    -- EPUBメタデータ（epub-parserで抽出）
    title           TEXT        NOT NULL DEFAULT '',
    author          TEXT        NOT NULL DEFAULT '',
    publisher       TEXT        NOT NULL DEFAULT '',
    language        TEXT        NOT NULL DEFAULT '',
    description     TEXT        NOT NULL DEFAULT '',
    cover_path      TEXT        NOT NULL DEFAULT '', -- カバー画像の保存パス

    -- 管理
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ユーザーの本棚取得（一覧表示）
CREATE INDEX IF NOT EXISTS idx_books_user_id ON books (user_id, created_at DESC);

CREATE TRIGGER trg_books_updated_at
    BEFORE UPDATE ON books
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
