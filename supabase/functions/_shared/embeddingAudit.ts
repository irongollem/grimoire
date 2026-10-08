import { isEmbeddingStale } from "./embeddings.ts";

/**
 * Pure core of the `mode: "audit"` read-only scans in embed-content and
 * embed-monsters (#848): which of a campaign's rows have no vector, and which
 * have one that is out of date. Kept free of Deno and Supabase imports so
 * vitest can load it; `./embeddings.ts` is safe for the same reason (it only
 * imports a type), so the staleness rule is the one the repair path uses
 * rather than a second copy that could drift.
 */

/** One entity kind's findings, as the audit endpoints reply with them. */
export interface AuditKindRow {
  kind: string;
  /** Ids with no stored embedding row at all. */
  missing: string[];
  /** Ids whose stored hash or model differs from what would be written now. */
  outdated: string[];
}

export function classifyEmbeddings(
  fresh: readonly { id: string; hash: string }[],
  stored: ReadonlyMap<string, { source_hash: string; embedding_model: string }>,
  model: string,
): { missing: string[]; outdated: string[] } {
  const missing: string[] = [];
  const outdated: string[] = [];
  for (const { id, hash } of fresh) {
    const row = stored.get(id) ?? null;
    if (!row) missing.push(id);
    else if (isEmbeddingStale(row, { sourceHash: hash, model })) outdated.push(id);
  }
  return { missing, outdated };
}
