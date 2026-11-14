export function encodeCursor(id: number): string {
  return Buffer.from(`id:${id}`).toString("base64url")
}

export function decodeCursor(cursor: string | undefined): number | undefined {
  if (!cursor) return undefined
  const m = /^id:(\d+)$/.exec(Buffer.from(cursor, "base64url").toString())
  return m ? Number(m[1]) : undefined
}

/** Fetch limit+1 rows, return page + nextCursor. */
export function paginate<T extends { id: number }>(rows: T[], limit: number) {
  const hasMore = rows.length > limit
  const data = hasMore ? rows.slice(0, limit) : rows
  return { data, nextCursor: hasMore ? encodeCursor(data[data.length - 1]!.id) : null }
}
