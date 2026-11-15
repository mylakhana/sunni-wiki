# SunniWiki

A free, public library of trusted Islamic books, readable in Arabic, Urdu and English. It has a chapter-by-chapter reader with continuous reading and text sharing. It also has the SunniWiki AI feature ("Ask AI"), a chat grounded in the chapters you pick.

## Structure

- `apps/api`: Fastify + Prisma (MySQL) read-only API, plus Python scripts that import the legacy book CSVs.
- `apps/web`: Next.js reader.
- `docs/sunniwiki-concept/`: concept docs (source of truth). Start with its `README.md`.
- `docs/plans/`: work plans and the pending-prototypes tracker.

## Adding UI components

Run this at the root of the `web` app:

```bash
pnpm dlx shadcn@latest add button -c apps/web
```

Components are placed in `packages/ui/src/components`. Import them like this:

```tsx
import { Button } from "@workspace/ui/components/button";
```
