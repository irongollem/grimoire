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
 * Twenty rows a statement stays well inside the limit. A failed chunk leaves
 * the chunks before it stored; their new `source_hash` makes the next batch
 * call skip them, so a retry picks up where this one stopped.
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

/** Upserts `rows` chunk by chunk; the first failure stops the run and is returned with how many rows were stored before it. */
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
    if (error) return { stored, error };
    stored += chunk.length;
  }
  return { stored, error: null };
}
