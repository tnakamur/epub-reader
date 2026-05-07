-- ============================================================
-- 004_create_progress.sql
-- 読書進捗テーブル（複数端末同期対応）
-- ============================================================

CREATE TABLE IF NOT EXISTS progress (
    id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    book_id         UUID        NOT NULL REFERENCES books(id) ON DELETE CASCADE,

    -- EPUB.js の現在位置
    cfi             TEXT        NOT NULL DEFAULT '', -- epubcfi形式の現在位置
    percentage      NUMERIC(5,2) NOT NULL DEFAULT 0, -- 0.00 〜 100.00

    -- 複数端末の競合解決用: 最後に更新した端末が優先（Last-Write-Wins）
    device_id       TEXT        NOT NULL DEFAULT '', -- クライアントが生成するUUID

    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- ユーザー × 書籍 は1レコードのみ
    CONSTRAINT uq_progress_user_book UNIQUE (user_id, book_id)
);

-- 本棚画面で進捗率を表示するための結合用
CREATE INDEX IF NOT EXISTS idx_progress_user_id ON progress (user_id);

-- オフライン同期: updated_at で差分取得
CREATE INDEX IF NOT EXISTS idx_progress_updated_at ON progress (user_id, updated_at DESC);

CREATE TRIGGER trg_progress_updated_at
    BEFORE UPDATE ON progress
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
