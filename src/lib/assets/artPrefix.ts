/**
 * The CDN key prefix every published art object lives under (#864).
 *
 * Kept in its own file, with no other imports, so a plain Node script can
 * read it without pulling in `src/lib/storage/buckets.ts` — which reads
 * `import.meta.env` at module scope and throws outside Vite. That is the same
 * constraint `scripts/dev-buckets.data.ts` restates the bucket registry to
 * work around; `artUrl.ts` re-exports this constant for app code, but
 * `scripts/art-manifest.ts` and `scripts/art-publish.ts` must import it from
 * here directly, never through `artUrl.ts`.
 */
export const ART_PREFIX = "app-art";
