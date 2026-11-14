-- CreateTable
CREATE TABLE `User` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `email` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `User_email_key`(`email`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `categories` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `slug` VARCHAR(100) NOT NULL,
    `titleEn` VARCHAR(255) NOT NULL,
    `titleAr` VARCHAR(255) NULL,
    `titleUr` VARCHAR(255) NULL,
    `description` TEXT NULL,
    `sort` INTEGER NOT NULL DEFAULT 0,

    UNIQUE INDEX `categories_slug_key`(`slug`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `authors` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `slug` VARCHAR(100) NOT NULL,
    `nameEn` VARCHAR(255) NOT NULL,
    `nameAr` VARCHAR(255) NULL,
    `nameUr` VARCHAR(255) NULL,
    `birthYear` INTEGER NULL,
    `deathYear` INTEGER NULL,
    `bio` TEXT NULL,

    UNIQUE INDEX `authors_slug_key`(`slug`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `books` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `slug` VARCHAR(150) NOT NULL,
    `authorId` INTEGER NOT NULL,
    `categoryId` INTEGER NOT NULL,
    `titleEn` VARCHAR(255) NOT NULL,
    `titleAr` VARCHAR(255) NULL,
    `titleUr` VARCHAR(255) NULL,
    `description` TEXT NULL,
    `languages` JSON NULL,
    `coverImage` VARCHAR(255) NULL,
    `published` BOOLEAN NOT NULL DEFAULT false,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `books_slug_key`(`slug`),
    INDEX `books_authorId_idx`(`authorId`),
    INDEX `books_categoryId_idx`(`categoryId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `volumes` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `bookId` INTEGER NOT NULL,
    `slug` VARCHAR(50) NOT NULL,
    `sort` INTEGER NOT NULL DEFAULT 0,
    `titleEn` VARCHAR(255) NULL,
    `titleAr` VARCHAR(255) NULL,
    `titleUr` VARCHAR(255) NULL,

    UNIQUE INDEX `volumes_bookId_slug_key`(`bookId`, `slug`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `chapters` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `bookId` INTEGER NOT NULL,
    `volumeId` INTEGER NULL,
    `parentId` INTEGER NULL,
    `sort` INTEGER NOT NULL DEFAULT 0,
    `slug` VARCHAR(150) NOT NULL,
    `titleEn` VARCHAR(500) NULL,
    `titleAr` VARCHAR(500) NULL,
    `titleUr` VARCHAR(500) NULL,

    INDEX `chapters_bookId_volumeId_parentId_sort_idx`(`bookId`, `volumeId`, `parentId`, `sort`),
    INDEX `chapters_volumeId_idx`(`volumeId`),
    INDEX `chapters_parentId_idx`(`parentId`),
    UNIQUE INDEX `chapters_bookId_slug_key`(`bookId`, `slug`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `content` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `chapterId` INTEGER NOT NULL,
    `slug` VARCHAR(50) NOT NULL DEFAULT 'default',
    `tei` LONGTEXT NOT NULL,
    `version` INTEGER NOT NULL DEFAULT 1,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `content_chapterId_slug_key`(`chapterId`, `slug`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `books` ADD CONSTRAINT `books_authorId_fkey` FOREIGN KEY (`authorId`) REFERENCES `authors`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `books` ADD CONSTRAINT `books_categoryId_fkey` FOREIGN KEY (`categoryId`) REFERENCES `categories`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `volumes` ADD CONSTRAINT `volumes_bookId_fkey` FOREIGN KEY (`bookId`) REFERENCES `books`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `chapters` ADD CONSTRAINT `chapters_bookId_fkey` FOREIGN KEY (`bookId`) REFERENCES `books`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `chapters` ADD CONSTRAINT `chapters_volumeId_fkey` FOREIGN KEY (`volumeId`) REFERENCES `volumes`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `chapters` ADD CONSTRAINT `chapters_parentId_fkey` FOREIGN KEY (`parentId`) REFERENCES `chapters`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `content` ADD CONSTRAINT `content_chapterId_fkey` FOREIGN KEY (`chapterId`) REFERENCES `chapters`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

