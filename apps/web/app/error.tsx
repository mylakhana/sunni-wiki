"use client"

import { RouteError } from "@/components/library/route-error"

export default function Error({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <RouteError title="Something went wrong" reset={reset} />
}
