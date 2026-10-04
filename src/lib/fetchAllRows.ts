import type { PostgrestError } from "@supabase/supabase-js";

/** PostgREST's `max_rows`: 1000 locally and in production. */
export const POSTGREST_PAGE = 1000;

/**
 * Reads every row of a query, a page at a time.
 *
 * PostgREST stops a response at `max_rows` without an error or a flag, so an
 * unpaged list read is silently cut short. The library catalogues are past that
 * cap (3,500 monsters, 1,400 spells at the 2014 ruleset), and a name-sorted read
 * stopped somewhere in the S's: Winter Wolf never reached an @mention list
 * (5 Oct 2026).
 *
 * `page` builds a fresh query for each range. Give it an order that ends in a
 * unique column (`id`), or rows tied on the sort key can repeat or vanish at a
 * page boundary.
 */
export async function fetchAllRows<T>(
  page: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: PostgrestError | null }>,
): Promise<T[]> {
  const all: T[] = [];
  for (let from = 0; ; from += POSTGREST_PAGE) {
    const { data, error } = await page(from, from + POSTGREST_PAGE - 1);
    if (error) throw error;
    if (data === null) throw new Error("fetchAllRows: a page returned neither rows nor an error");
    all.push(...data);
    if (data.length < POSTGREST_PAGE) return all;
  }
}
