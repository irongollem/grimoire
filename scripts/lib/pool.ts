/**
 * Run `worker` over `items` with at most `limit` in flight at once.
 *
 * Shared by the R2 scripts (`r2-copy.ts`, `art-publish.ts`), which each used
 * to carry a byte-identical private copy — the second one arrived with a
 * docstring saying it "mirrors r2-copy.ts in shape", which is the moment a
 * helper stops being local.
 */
export async function pooled<T>(
  items: readonly T[],
  limit: number,
  worker: (item: T) => Promise<void>,
): Promise<void> {
  let cursor = 0;
  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor++;
      await worker(items[index]);
    }
  });
  await Promise.all(runners);
}
