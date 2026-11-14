import { authorColor, initials } from "@/lib/ui"

export function AuthorAvatar({ author, size = 64 }: { author: { id: string; name: string }; size?: number }) {
  return (
    <span
      className="grid shrink-0 place-items-center rounded-full font-semibold text-white"
      style={{ width: size, height: size, fontSize: size / 3, background: authorColor(author.id) }}
    >
      {initials(author.name)}
    </span>
  )
}
