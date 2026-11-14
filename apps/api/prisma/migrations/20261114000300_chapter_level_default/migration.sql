-- AlterTable: levels are now 0 group, 1 booklet, 2 chapter, 3 sub-topic (default = chapter)
ALTER TABLE `chapters` ALTER COLUMN `level` SET DEFAULT 2;
