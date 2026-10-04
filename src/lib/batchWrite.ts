/**
 * Writes many rows in one request, and only when that request is refused
 * does it fall back to one request per row, so a single bad row costs itself
 * and nothing else (#951).
 *
 * The fallback is safe because a refused multi-row INSERT is one statement
 * and therefore all-or-nothing: no row of the batch landed, so writing each
 * one again cannot duplicate any of them. It is a failure path, not a second
 * way of writing. An import that is fine pays one request; an import with one
 * row a trigger refuses pays one more per row, and reports exactly that row
 * instead of losing its neighbours.
 *
 * `writeMany` receives the caller's own items (so a refusal can be reported
 * with whatever label the caller attached) and returns whatever the write
 * returns. The order of `written` is whatever the database sent back, which
 * is not guaranteed to be insertion order: key it by a column you set, never
 * by position.
 */
export interface BatchWriteOutcome<Item, Result> {
  written: Result[];
  refused: { item: Item; error: unknown }[];
}

export async function writeBatchIsolatingFailures<Item, Result = never>(
  items: readonly Item[],
  writeMany: (items: Item[]) => Promise<readonly Result[] | void>,
): Promise<BatchWriteOutcome<Item, Result>> {
  if (items.length === 0) return { written: [], refused: [] };
  try {
    return { written: [...((await writeMany([...items])) ?? [])], refused: [] };
  } catch (error) {
    if (items.length === 1) return { written: [], refused: [{ item: items[0]!, error }] };
  }

  const settled = await Promise.allSettled(items.map((item) => writeMany([item])));
  const outcome: BatchWriteOutcome<Item, Result> = { written: [], refused: [] };
  settled.forEach((result, i) => {
    if (result.status === "fulfilled") outcome.written.push(...(result.value ?? []));
    else outcome.refused.push({ item: items[i]!, error: result.reason });
  });
  return outcome;
}

/** A refusal's reason as text. A Supabase error is a plain object with a
 *  `message`, not an `Error`, so `instanceof Error` alone would miss it. */
export function refusalReason(error: unknown): string {
  return typeof error === "object" && error !== null && "message" in error
    ? String((error as { message: unknown }).message)
    : "the write was refused";
}
