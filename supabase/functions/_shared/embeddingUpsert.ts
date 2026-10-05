/**
 * Stores a batch of embeddings a few rows per statement.
 *
 * PostgREST runs every request under the `authenticator` role's eight-second
 * statement timeout, service role included. Writing a vector costs an HNSW
 * index insertion, and once a corpus is fully embedded every write is an
 * update into the whole graph: the library monster re-embed of 4 Oct 2026 (all
 * 3,541 rows stale after `description` joined the embed text) timed out on its
 * very first 100-row upsert and stored nothing. The first fill had worked at
 * the same batch size only because it inserted into an empty table.
 *
 * Twenty rows a statement stays well inside the limit most of the time, but
 * not always: the same re-embed still timed out on a 20-row chunk after 1,200
 * rows, with the table's replaced vectors waiting on an HNSW vacuum. So a
 * chunk that fails is retried one row per statement before the batch gives
 * up; a single row cannot plausibly take eight seconds. Whatever was stored
 * before a failure stays stored, and its new `source_hash` makes the next
 * batch call skip it, so a retry picks up where this one stopped.
 */
export const EMBEDDING_UPSERT_CHUNK = 20;

interface UpsertableTable {
  upsert(rows: Record<string, unknown>[], options: { onConflict: string }): PromiseLike<{ error: { message: string } | null }>;
}

interface UpsertClient {
  from(table: string): UpsertableTable;
}

export function chunkRows<T>(rows: readonly T[], size: number): T[][] {
  if (size < 1) throw new Error("chunk size must be at least 1");
  const chunks: T[][] = [];
  for (let i = 0; i < rows.length; i += size) chunks.push(rows.slice(i, i + size));
  return chunks;
}

/** Upserts `rows` chunk by chunk, a failed chunk row by row; a row that still fails stops the run and is returned with how many rows were stored before it. */
export async function upsertEmbeddingsInChunks(
  client: UpsertClient,
  table: string,
  rows: Record<string, unknown>[],
  onConflict: string,
  size = EMBEDDING_UPSERT_CHUNK,
): Promise<{ stored: number; error: { message: string } | null }> {
  let stored = 0;
  for (const chunk of chunkRows(rows, size)) {
    const { error } = await client.from(table).upsert(chunk, { onConflict });
    if (!error) {
      stored += chunk.length;
      continue;
    }
    if (chunk.length === 1) return { stored, error };
    for (const row of chunk) {
      const single = await client.from(table).upsert([row], { onConflict });
      if (single.error) return { stored, error: single.error };
      stored += 1;
    }
  }
  return { stored, error: null };
}
