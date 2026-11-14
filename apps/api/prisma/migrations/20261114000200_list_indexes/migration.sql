-- Public list queries: published books ordered by createdAt desc, id desc.
CREATE INDEX `books_published_createdAt_idx` ON `books`(`published`, `createdAt`);
-- Categories ordered by sort.
CREATE INDEX `categories_sort_idx` ON `categories`(`sort`);
-- Chapter TOC queries are already covered by chapters_bookId_volumeId_parentId_sort_idx.
