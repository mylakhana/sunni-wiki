/** Raw API response shapes (contract of apps/api, all under /v1). */
export type Nullable<T> = T | null

export type ListResponse<T> = { data: T[]; nextCursor: string | null }
export type ItemResponse<T> = { data: T }

export type CategoryDto = { id: number; slug: string; titleEn: string; titleAr: Nullable<string>; titleUr: Nullable<string>; description: Nullable<string>; sort: number; bookCount: number }
export type AuthorDto = { id: number; slug: string; nameEn: string; nameAr: Nullable<string>; nameUr: Nullable<string>; birthYear: Nullable<number>; deathYear: Nullable<number>; bio: Nullable<string>; bookCount: number }
export type BookDto = {
  id: number; slug: string; titleEn: string; titleAr: Nullable<string>; titleUr: Nullable<string>; description: Nullable<string>
  languages: string[]; coverImage: Nullable<string>; volumeCount: number; createdAt: string
  author: { id: number; slug: string; nameEn: string; nameAr: Nullable<string>; nameUr: Nullable<string> }
  category: { id: number; slug: string; titleEn: string; titleAr: Nullable<string>; titleUr: Nullable<string> }
}
type TitlesDto = { titleEn: Nullable<string>; titleAr: Nullable<string>; titleUr: Nullable<string> }
export type VolumeDto = { id: number; slug: string; sort: number } & TitlesDto & { chapterCount: number; topLevelCount: number }
export type BookDetailDto = BookDto & { volumes: VolumeDto[] }
export type AuthorDetailDto = AuthorDto & { books: BookDto[] }
export type ChapterListItemDto = { id: number; slug: string; sort: number; parentId: Nullable<number>; volumeSlug: Nullable<string>; hasChildren: boolean; level: 0 | 1 | 2 | 3; anchorId: Nullable<string> } & TitlesDto
export type ChapterLinkDto = { slug: string } & TitlesDto
export type ChapterDetailDto = {
  id: number; slug: string
  volume: Nullable<{ slug: string } & TitlesDto>
  level: 0 | 1 | 2 | 3
  redirect: Nullable<{ slug: string; anchorId: Nullable<string> }>
  breadcrumb: ({ id: number; slug: string; level: 0 | 1 | 2 | 3 } & TitlesDto)[]
  prev: Nullable<ChapterLinkDto>; next: Nullable<ChapterLinkDto>
  tei: Nullable<string>
} & TitlesDto
