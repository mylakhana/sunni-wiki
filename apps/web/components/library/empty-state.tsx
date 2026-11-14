import Link from "next/link"

/** Shared empty / error block for lists and pages. */
export function EmptyState({ title, text, action }: { title: string; text?: string; action?: { href: string; label: string } }) {
  return (
    <div className="py-20 text-center" role="status">
      <p className="text-lg font-medium">{title}</p>
      {text && <p className="c-muted mx-auto mt-2 max-w-sm text-sm">{text}</p>}
      {action && <Link href={action.href} className="bg-lib-accent mt-5 inline-flex h-10 items-center rounded-full px-5 text-sm text-white">{action.label}</Link>}
    </div>
  )
}

export const libraryDown = { title: "The library is unavailable right now", text: "We could not load the books. Please try again in a moment." }
