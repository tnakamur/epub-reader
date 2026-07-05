-- 007_add_section_percent_to_bookmarks.sql
-- ブックマークにセクション内位置パーセンテージを追加

ALTER TABLE bookmarks ADD COLUMN IF NOT EXISTS section_percent INTEGER;

COMMENT ON COLUMN bookmarks.section_percent IS 'セクション内での位置パーセンテージ (0-100)';