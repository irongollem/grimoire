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
 * Apply a complete Postgres row to every already-loaded exact-row cache below
 * a query-key root. Filter moves are handled by removing the old id first and
 * re-testing the new row. Unloaded caches are never created from one event.
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
      const withoutRow = (current as Row[]).filter((row) => row.id !== rowId);
      const next = change.eventType !== "DELETE" && reducer.matches(queryKey, change.new)
        ? [...withoutRow, change.new]
        : withoutRow;
      if (reducer.compare) next.sort(reducer.compare);
      queryClient.setQueryData(queryKey, next);
      continue;
    }

    if (current && typeof current === "object" && "id" in current
      && (current as RealtimeRow).id === rowId) {
      if (change.eventType === "DELETE") {
        queryClient.removeQueries({ queryKey, exact: true });
      } else if (reducer.matches(queryKey, change.new)) {
        queryClient.setQueryData(queryKey, change.new);
      }
    }
  }
}
