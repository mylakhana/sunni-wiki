import { EmptyState } from "@/components/library/empty-state"

export default function NotFound() {
  return <main className="mx-auto max-w-6xl px-4 sm:px-6"><EmptyState title="Book not found" text="This book does not exist or is not published." action={{ href: "/browse", label: "Browse books" }} /></main>
}
