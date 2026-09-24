import type { QueryClient, QueryKey } from "@tanstack/vue-query";

export interface RealtimeRow {
  id: string;
}

export interface RealtimeRowChange<Row extends RealtimeRow> {
  eventType: "INSERT" | "UPDATE" | "DELETE";
  new: Row;
  old: Partial<Row>;
}

export interface RealtimeRowReducer<Row extends RealtimeRow> {
  /** Cache root owned by this table, e.g. `notes`. */
  rootKey: string;
  /** Admit only exact raw-row caches; exclude joins and player projections. */
  include: (queryKey: QueryKey) => boolean;
  /** Whether a row belongs in this particular filtered list cache. */
  matches: (queryKey: QueryKey, row: Row) => boolean;
  compare?: (left: Row, right: Row) => number;
}

/**
 * Merge an UPDATE payload over a previously-cached copy of the same row.
 *
 * Supabase Realtime `postgres_changes` UPDATE payloads OMIT any column whose
 * value is unchanged AND stored out-of-line (TOAST: compressed/large values,
 * roughly > 2KB) — the key is simply absent from `incoming`, not present with
 * `null`. So a spread with `incoming` last only overwrites what actually
 * changed (including a genuine explicit null, which arrives as a present key)
 * and leaves every omitted key at its last-known cached value.
 */
export function mergeRealtimeUpdate<Row extends RealtimeRow>(cached: Row, incoming: Row): Row {
  return { ...cached, ...incoming };
}

/**
 * Apply one Postgres row event to every already-loaded exact-row cache below a
 * query-key root. Filter moves are handled by removing the old id first and
 * re-testing the new row. Unloaded caches are never created from one event.
 *
 * An UPDATE payload can be missing keys (see `mergeRealtimeUpdate`), so it is
 * only ever trusted directly when this cache already holds a copy of the row
 * to merge it onto. When an UPDATE would add a row to a cache that holds no
 * prior copy of it (e.g. the row just started matching a filtered list), the
 * payload cannot be known to be complete — that exact query is invalidated
 * instead of splicing a possibly-partial row into it. INSERT and DELETE
 * payloads are always complete, so they are unaffected.
 */
export function applyRealtimeRow<Row extends RealtimeRow>(
  queryClient: QueryClient,
  change: RealtimeRowChange<Row>,
  reducer: RealtimeRowReducer<Row>,
): void {
  const rowId = change.eventType === "DELETE" ? change.old.id : change.new.id;
  if (!rowId) return;

  const queries = queryClient.getQueryCache().findAll({ queryKey: [reducer.rootKey] });
  for (const query of queries) {
    const queryKey = query.queryKey;
    if (!reducer.include(queryKey)) continue;
    const current = query.state.data;

    if (Array.isArray(current)) {
      const rows = current as Row[];
      const cachedRow = rows.find((row) => row.id === rowId);

      if (change.eventType === "DELETE") {
        if (cachedRow) queryClient.setQueryData(queryKey, rows.filter((row) => row.id !== rowId));
        continue;
      }

      // The matches() filter is evaluated on the merged row where a cached
      // copy exists — an omitted (unchanged, TOASTed) filter column would
      // otherwise read as undefined and wrongly look like a non-match/move.
      const merged = change.eventType === "UPDATE" && cachedRow
        ? mergeRealtimeUpdate(cachedRow, change.new)
        : change.new;
      const rowMatches = reducer.matches(queryKey, merged);

      if (cachedRow) {
        const withoutRow = rows.filter((row) => row.id !== rowId);
        const next = rowMatches ? [...withoutRow, merged] : withoutRow;
        if (reducer.compare) next.sort(reducer.compare);
        queryClient.setQueryData(queryKey, next);
      } else if (change.eventType === "INSERT") {
        if (rowMatches) {
          const next = [...rows, merged];
          if (reducer.compare) next.sort(reducer.compare);
          queryClient.setQueryData(queryKey, next);
        }
      } else if (rowMatches) {
        // UPDATE moved a row into this list, but there is no prior copy here
        // to merge against, so `change.new` may be missing TOASTed columns
        // Postgres omitted as unchanged. Refetch rather than insert it raw.
        void queryClient.invalidateQueries({ queryKey, exact: true });
      }
      continue;
    }

    if (current && typeof current === "object" && "id" in current
      && (current as RealtimeRow).id === rowId) {
      if (change.eventType === "DELETE") {
        queryClient.removeQueries({ queryKey, exact: true });
        continue;
      }
      const merged = change.eventType === "UPDATE"
        ? mergeRealtimeUpdate(current as Row, change.new)
        : change.new;
      if (reducer.matches(queryKey, merged)) {
        queryClient.setQueryData(queryKey, merged);
      }
    }
  }
}
