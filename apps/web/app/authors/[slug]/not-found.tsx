import { EmptyState } from "@/components/library/empty-state"

export default function NotFound() {
  return <main className="mx-auto max-w-6xl px-4 sm:px-6"><EmptyState title="Writer not found" action={{ href: "/authors", label: "All writers" }} /></main>
}
