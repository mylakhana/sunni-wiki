ALTER TABLE `books` DROP FOREIGN KEY `books_authorId_fkey`;
ALTER TABLE `books` MODIFY `authorId` INTEGER NULL;
ALTER TABLE `books` ADD CONSTRAINT `books_authorId_fkey` FOREIGN KEY (`authorId`) REFERENCES `authors`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
