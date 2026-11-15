import type { FastifyInstance } from "fastify"
import { env } from "../config/env.js"
import type { PrismaClient } from "../generated/prisma/client.js"
import { MarkdownService } from "./markdown.service.js"
import { estimateTokens } from "./tei-markdown.service.js"

const TTL_MS = 60_000

type TNode = {
  id: number
  slug: string
  parentId: number | null
  volumeId: number | null
  sort: number
  level: number
  titleEn: string | null
  titleAr: string | null
  titleUr: string | null
  contentId: number | null
  /** Markdown chars of the node's own text; null = no text or not backfilled yet */
  own: number | null
}
type Tree = {
  bookId: number
  nodes: Map<number, TNode>
  children: Map<number | null, TNode[]>
  /** every node, depth-first in reading order (volumes by sort, siblings by sort,id) */
  order: TNode[]
  /** level 0/1/2: own + subtree sizes; subtree null when a unit below is not backfilled */
  sizes: Map<number, { own: number | null; subtree: number | null }>
}

/** Maximum Markdown characters of an Ask-AI selection (tokens are estimated as ceil(chars / 3)). */
export const maxContextChars = () => env.AI_MAX_CONTEXT_TOKENS * 3

/**
 * Per-book view of the chapter tree with Markdown sizes: TOC totals (`subtreeChars`) and the
 * "context units" (level 1/2 nodes owning text) below a volume or chapter. Cached 60 s per book.
 */
export class ContextService {
  private trees = new Map<number, { at: number; tree: Tree }>()
  readonly markdown: MarkdownService

  constructor(
    private readonly db: PrismaClient,
    private readonly app: Pick<FastifyInstance, "httpErrors">,
    markdown?: MarkdownService,
  ) {
    this.markdown = markdown ?? new MarkdownService(db, app, () => this.trees.clear())
  }

  invalidate() {
    this.trees.clear()
  }

  private async tree(bookId: number): Promise<Tree> {
    const hit = this.trees.get(bookId)
    if (hit && Date.now() - hit.at < TTL_MS) return hit.tree
    const [volumes, chapters, contents] = await Promise.all([
      this.db.volume.findMany({ where: { bookId }, select: { id: true, sort: true } }),
      this.db.chapter.findMany({
        where: { bookId },
        select: { id: true, slug: true, parentId: true, volumeId: true, sort: true, level: true, titleEn: true, titleAr: true, titleUr: true },
      }),
      this.db.content.findMany({ where: { chapter: { bookId } }, select: { id: true, chapterId: true, slug: true, markdownChars: true } }),
    ])
    const contentOf = new Map<number, { id: number; chars: number | null }>()
    for (const c of contents) {
      if (c.slug === "default" || !contentOf.has(c.chapterId)) contentOf.set(c.chapterId, { id: c.id, chars: c.markdownChars })
    }
    const nodes = new Map<number, TNode>()
    const children = new Map<number | null, TNode[]>()
    for (const c of chapters) {
      const ct = contentOf.get(c.id)
      const n: TNode = { ...c, contentId: ct?.id ?? null, own: ct?.chars ?? null }
      nodes.set(n.id, n)
      const list = children.get(n.parentId)
      if (list) list.push(n)
      else children.set(n.parentId, [n])
    }
    for (const list of children.values()) list.sort((a, b) => a.sort - b.sort || a.id - b.id)
    const volSort = new Map(volumes.map((v) => [v.id, v.sort]))
    const roots = (children.get(null) ?? []).slice().sort((a, b) => {
      const va = a.volumeId == null ? Infinity : (volSort.get(a.volumeId) ?? Infinity)
      const vb = b.volumeId == null ? Infinity : (volSort.get(b.volumeId) ?? Infinity)
      return va - vb || a.sort - b.sort || a.id - b.id
    })
    const order: TNode[] = []
    const stack = roots.slice().reverse()
    while (stack.length) {
      const n = stack.pop()!
      order.push(n)
      const kids = children.get(n.id)
      if (kids) for (let i = kids.length - 1; i >= 0; i--) stack.push(kids[i]!)
    }
    // subtree totals: children come after their parent in `order`, so walk it backwards
    const sizes = new Map<number, { own: number | null; subtree: number | null }>()
    const acc = new Map<number, number | null>() // running subtree sum of already-folded children
    for (let i = order.length - 1; i >= 0; i--) {
      const n = order[i]!
      if (n.level > 2) continue
      const isUnit = n.level >= 1 && n.contentId != null
      const kidsSum = acc.has(n.id) ? acc.get(n.id)! : 0
      const own = isUnit ? n.own : 0
      const subtree = kidsSum == null || own == null ? null : kidsSum + own
      sizes.set(n.id, { own: n.level === 0 || n.contentId == null ? null : n.own, subtree })
      if (n.parentId != null) {
        const prev = acc.has(n.parentId) ? acc.get(n.parentId)! : 0
        acc.set(n.parentId, prev == null || subtree == null ? null : prev + subtree)
      }
    }
    const tree: Tree = { bookId, nodes, children, order, sizes }
    this.trees.set(bookId, { at: Date.now(), tree })
    return tree
  }

  /** id -> { own, subtree } for level 0/1/2 nodes of a book. */
  async forBook(bookId: number) {
    return (await this.tree(bookId)).sizes
  }

  async units(bookSlug: string, node: string) {
    const book = await this.db.book.findFirst({ where: { slug: bookSlug, published: true }, select: { id: true } })
    if (!book) throw this.app.httpErrors.notFound("Book not found")
    const tree = await this.tree(book.id)

    // `node`: a volume slug (wins) or a chapter id; "volume:<slug>" / "chapter:<id>" disambiguate.
    let volumeId: number | null = null
    let rootId: number | null = null
    const explicit = /^(volume|chapter):(.+)$/.exec(node)
    const kind = explicit?.[1]
    const value = explicit?.[2] ?? node
    if (kind !== "chapter") {
      const v = await this.db.volume.findUnique({ where: { bookId_slug: { bookId: book.id, slug: value } }, select: { id: true } })
      if (v) volumeId = v.id
    }
    if (volumeId == null && kind !== "volume" && /^\d+$/.test(value)) {
      const n = tree.nodes.get(Number(value))
      if (n) rootId = n.id
    }
    if (volumeId == null && rootId == null) throw this.app.httpErrors.notFound("Volume or chapter not found")

    const inside = (n: TNode): boolean => {
      if (volumeId != null) return n.volumeId === volumeId
      for (let cur: TNode | undefined = n, d = 0; cur && d < 30; cur = cur.parentId != null ? tree.nodes.get(cur.parentId) : undefined, d++) {
        if (cur.id === rootId) return true
      }
      return false
    }
    const picked = tree.order.filter((n) => (n.level === 1 || n.level === 2) && n.contentId != null && inside(n))

    // Sizes not backfilled yet are computed (and stored) now.
    let filled = false
    const units = []
    for (const n of picked) {
      let chars = n.own
      if (chars == null) {
        chars = await this.markdown.ensureChars(n.contentId!)
        filled = true
      }
      units.push({ id: n.id, slug: n.slug, level: n.level, titleEn: n.titleEn, titleAr: n.titleAr, titleUr: n.titleUr, markdownChars: chars })
    }
    if (filled) this.invalidate()

    const totalChars = units.reduce((a, u) => a + u.markdownChars, 0)
    const maxChars = maxContextChars()
    if (totalChars > maxChars) {
      throw this.app.httpErrors.payloadTooLarge(
        `Selection is too large: ${totalChars} chars (~${estimateTokens(totalChars)} tokens) exceeds the limit of ${maxChars} chars (${env.AI_MAX_CONTEXT_TOKENS} tokens)`,
      )
    }
    return { data: { units, totalChars, maxChars, maxTokens: env.AI_MAX_CONTEXT_TOKENS } }
  }
}
