import { initials, type Author } from "@/lib/data"

export function AuthorAvatar({ author, size = 64 }: { author: Author; size?: number }) {
  return (
    <span
      className="grid shrink-0 place-items-center rounded-full font-semibold text-white"
      style={{ width: size, height: size, fontSize: size / 3, background: author.color }}
    >
      {initials(author.name)}
    </span>
  )
}
