-- ============================================================
-- 003_create_highlights.sql
-- ハイライト・メモテーブル
-- ============================================================

CREATE TABLE IF NOT EXISTS highlights (
    id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    book_id         UUID        NOT NULL REFERENCES books(id) ON DELETE CASCADE,

    -- EPUB.js の位置情報
    cfi_range       TEXT        NOT NULL,   -- EPubCFI形式 例: epubcfi(/6/4[chap01]!/4/2/1:0,/1:20)
    selected_text   TEXT        NOT NULL,   -- ハイライトした文字列

    -- ハイライト装飾
    color           TEXT        NOT NULL DEFAULT 'yellow',  -- yellow / red / blue / green

    -- メモ（任意）
    note            TEXT        NOT NULL DEFAULT '',

    -- 論理削除（オフライン同期の整合性のため物理削除しない）
    deleted_at      TIMESTAMPTZ             DEFAULT NULL,

    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 書籍ごとのハイライト一覧取得
CREATE INDEX IF NOT EXISTS idx_highlights_book_id
    ON highlights (book_id, user_id)
    WHERE deleted_at IS NULL;

-- オフライン同期: updated_at で差分取得
CREATE INDEX IF NOT EXISTS idx_highlights_updated_at
    ON highlights (user_id, updated_at DESC);

CREATE TRIGGER trg_highlights_updated_at
    BEFORE UPDATE ON highlights
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
