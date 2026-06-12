-- 006_create_folders.sql
-- フォルダ管理テーブル + books.folder_id 追加

CREATE TABLE IF NOT EXISTS folders (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name       TEXT NOT NULL DEFAULT '',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_folders_user ON folders(user_id);

-- books テーブルに folder_id 追加
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'books' AND column_name = 'folder_id'
    ) THEN
        ALTER TABLE books ADD COLUMN folder_id UUID REFERENCES folders(id) ON DELETE SET NULL;
        CREATE INDEX IF NOT EXISTS idx_books_folder ON books(folder_id);
    END IF;
END$$;

-- updated_at 自動更新トリガー
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

DROP TRIGGER IF EXISTS set_updated_at ON folders;
CREATE TRIGGER set_updated_at
    BEFORE UPDATE ON folders
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();
