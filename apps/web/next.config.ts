import type { NextConfig } from "next"

const nextConfig: NextConfig = {
  // Lets a verification build run beside a live `next dev` without clobbering its .next folder.
  distDir: process.env.NEXT_DIST_DIR ?? ".next",
  transpilePackages: ["@workspace/ui"],
  // Component-level caching (`use cache` + cacheLife/cacheTag) and Partial Prerendering.
  cacheComponents: true,
  partialPrefetching: true,
}

export default nextConfig
