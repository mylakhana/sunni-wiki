import { EmptyState } from "@/components/library/empty-state"

export default function NotFound() {
  return <main className="mx-auto max-w-6xl px-4 sm:px-6"><EmptyState title="Chapter not found" text="This chapter does not exist in this book." action={{ href: "/browse", label: "Browse books" }} /></main>
}
