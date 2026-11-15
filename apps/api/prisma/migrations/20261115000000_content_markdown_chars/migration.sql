-- AlterTable: length (chars) of the TEI converted to Markdown; NULL until backfilled (scripts/backfill-markdown-chars.ts)
ALTER TABLE `content` ADD COLUMN `markdown_chars` INTEGER NULL;
