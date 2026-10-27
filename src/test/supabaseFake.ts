/**
 * An in-memory stand-in for the supabase-js client, for tests of code that
 * reads and writes tables (#1116).
 *
 * Why it exists: a hand-rolled `from().select().eq()` chain returns the same
 * rows whatever the filters were, so the only thing a test can check is that
 * the chain was called, which mirrors the implementation and fails on no bug.
 * This fake stores rows and honours the filters, so a test asserts what came
 * back or what the table holds afterwards, and a scoping test (CLAUDE.md
 * "Client Reads") can seed another user's row and assert it is not returned.
 *
 * Wiring (the factory may import the helper; hoist the instance so the test
 * body can reach it):
 *
 *   const { fake } = await vi.hoisted(async () => {
 *     const { createSupabaseFake } = await import("@/test/supabaseFake");
 *     return { fake: createSupabaseFake() };
 *   });
 *   vi.mock("@/lib/supabase", () => ({ supabase: fake.client, getCurrentUser: () => ({ id: "u1" }) }));
 *
 * Supported: select/insert/update/upsert/delete, `.select()` after a write,
 * eq neq in is gt gte lt lte, order, limit, range, single, maybeSingle, rpc
 * (through `onRpc` handlers) and one-shot failures (`failNext`).
 *
 * Not interpreted: `or(...)` is recorded in `calls` but does NOT filter, so a
 * test that depends on an `or` must not use this fake for that read. Column
 * lists passed to `select` are ignored (whole rows come back). Ids are not
 * generated: seed or insert rows with the `id` you need.
 *
 * Postgres semantics kept on purpose: `neq`, `gt`... never match a null or
 * missing column; `update`/`delete` with no filter is refused (the project's
 * pg-safeupdate does the same); `single()` fails on 0 or 2+ rows with
 * PGRST116, and a write that `single()` would reject changes nothing.
 *
 * `calls` is an escape hatch for the rare test where the request itself is the
 * property (a read must carry the caller's filter; an insert must send
 * `defaultToNull: false`). Do not assert on it otherwise: that is the call
 * mirror this helper exists to replace.
 */

export type FakeRow = Record<string, unknown>;

export interface FakeError {
  message: string;
  code: string;
}

export interface FakeResult {
  data: unknown;
  error: FakeError | null;
}

export type FakeFilterOp = "eq" | "neq" | "in" | "is" | "gt" | "gte" | "lt" | "lte" | "or";

export interface FakeFilter {
  op: FakeFilterOp;
  column: string;
  value: unknown;
}

export interface FakeCall {
  kind: "table" | "rpc";
  /** Table or rpc name. */
  target: string;
  op: "select" | "insert" | "update" | "upsert" | "delete" | "rpc";
  filters: FakeFilter[];
  /** Second argument of insert/upsert (e.g. `{ defaultToNull: false }`). */
  options: unknown;
  /** Rows written, the update values, or the rpc args. */
  payload: unknown;
}

export type RpcHandler = (args: Record<string, unknown>) => unknown;

type Predicate = (row: FakeRow) => boolean;
type Cardinality = "many" | "one" | "maybe";

interface FakeState {
  tables: Map<string, FakeRow[]>;
  handlers: Map<string, RpcHandler>;
  failures: Map<string, { error: FakeError; after: number }[]>;
  calls: FakeCall[];
}

const NO_ROW_OR_MANY: FakeError = {
  code: "PGRST116",
  message: "JSON object requested, multiple (or no) rows returned",
};

function clone<T>(value: T): T {
  return structuredClone(value);
}

function present(value: unknown): boolean {
  return value !== null && value !== undefined;
}

/** Order two comparable scalars; null when they cannot be compared. */
function compare(a: unknown, b: unknown): number | null {
  if (typeof a === "number" && typeof b === "number") return a - b;
  if (typeof a === "string" && typeof b === "string") return a < b ? -1 : a > b ? 1 : 0;
  return null;
}

/** A comparison filter: false when either side is null/missing or they are not comparable. */
function ordered(a: unknown, b: unknown, test: (order: number) => boolean): boolean {
  const order = compare(a, b);
  return order !== null && test(order);
}

function takeFailure(state: FakeState, target: string): FakeError | null {
  const queue = state.failures.get(target);
  const head = queue?.[0];
  if (!queue || !head) return null;
  if (head.after > 0) {
    head.after -= 1;
    return null;
  }
  queue.shift();
  return head.error;
}

class FakeQuery implements PromiseLike<FakeResult> {
  private op: FakeCall["op"] = "select";
  private payload: unknown = null;
  private options: unknown = null;
  private returning = false;
  private readonly predicates: Predicate[] = [];
  private readonly filters: FakeFilter[] = [];
  private readonly sorts: { column: string; ascending: boolean }[] = [];
  private limitTo: number | null = null;
  private skip = 0;
  private cardinality: Cardinality = "many";

  constructor(
    private readonly state: FakeState,
    private readonly table: string,
  ) {}

  select(_columns?: string): this {
    if (this.op !== "select") this.returning = true;
    return this;
  }

  insert(rows: FakeRow | FakeRow[], options?: unknown): this {
    this.op = "insert";
    this.payload = rows;
    this.options = options ?? null;
    return this;
  }

  update(values: FakeRow): this {
    this.op = "update";
    this.payload = values;
    return this;
  }

  upsert(rows: FakeRow | FakeRow[], options?: unknown): this {
    this.op = "upsert";
    this.payload = rows;
    this.options = options ?? null;
    return this;
  }

  delete(): this {
    this.op = "delete";
    return this;
  }

  private filter(op: FakeFilterOp, column: string, value: unknown, predicate: Predicate): this {
    this.filters.push({ op, column, value });
    this.predicates.push(predicate);
    return this;
  }

  eq(column: string, value: unknown): this {
    return this.filter("eq", column, value, (row) => present(row[column]) && row[column] === value);
  }

  neq(column: string, value: unknown): this {
    return this.filter("neq", column, value, (row) => present(row[column]) && row[column] !== value);
  }

  in(column: string, values: readonly unknown[]): this {
    return this.filter("in", column, values, (row) => values.includes(row[column]));
  }

  is(column: string, value: null | boolean): this {
    return this.filter("is", column, value, (row) =>
      value === null ? !present(row[column]) : row[column] === value,
    );
  }

  gt(column: string, value: unknown): this {
    return this.filter("gt", column, value, (row) => ordered(row[column], value, (c) => c > 0));
  }

  gte(column: string, value: unknown): this {
    return this.filter("gte", column, value, (row) => ordered(row[column], value, (c) => c >= 0));
  }

  lt(column: string, value: unknown): this {
    return this.filter("lt", column, value, (row) => ordered(row[column], value, (c) => c < 0));
  }

  lte(column: string, value: unknown): this {
    return this.filter("lte", column, value, (row) => ordered(row[column], value, (c) => c <= 0));
  }

  /** Recorded in `calls` only: the expression is NOT interpreted, so rows are not narrowed by it. */
  or(expression: string): this {
    return this.filter("or", "", expression, () => true);
  }

  order(column: string, options?: { ascending?: boolean }): this {
    this.sorts.push({ column, ascending: options?.ascending ?? true });
    return this;
  }

  limit(count: number): this {
    this.limitTo = count;
    return this;
  }

  /** Inclusive on both ends, like PostgREST. */
  range(from: number, to: number): this {
    this.skip = from;
    this.limitTo = to - from + 1;
    return this;
  }

  single(): this {
    this.cardinality = "one";
    return this;
  }

  maybeSingle(): this {
    this.cardinality = "maybe";
    return this;
  }

  // Thenable on purpose: supabase-js query builders are awaited directly, and so is this fake.
  // oxlint-disable-next-line unicorn/no-thenable
  then<A = FakeResult, B = never>(
    onfulfilled?: ((value: FakeResult) => A | PromiseLike<A>) | null,
    onrejected?: ((reason: unknown) => B | PromiseLike<B>) | null,
  ): PromiseLike<A | B> {
    return Promise.resolve()
      .then(() => this.execute())
      .then(onfulfilled, onrejected);
  }

  private stored(): FakeRow[] {
    let rows = this.state.tables.get(this.table);
    if (!rows) {
      rows = [];
      this.state.tables.set(this.table, rows);
    }
    return rows;
  }

  private matching(): FakeRow[] {
    return this.stored().filter((row) => this.predicates.every((predicate) => predicate(row)));
  }

  private sorted(rows: FakeRow[]): FakeRow[] {
    if (!this.sorts.length) return rows;
    return [...rows].sort((a, b) => {
      for (const { column, ascending } of this.sorts) {
        const left = a[column];
        const right = b[column];
        // Postgres: nulls sort last ascending, first descending.
        if (!present(left) || !present(right)) {
          if (present(left) === present(right)) continue;
          const nullFirst = !ascending;
          return present(left) ? (nullFirst ? 1 : -1) : nullFirst ? -1 : 1;
        }
        const order = compare(left, right) ?? 0;
        if (order !== 0) return ascending ? order : -order;
      }
      return 0;
    });
  }

  private shape(rows: FakeRow[]): FakeResult {
    if (this.cardinality === "many") return { data: rows.map(clone), error: null };
    if (rows.length === 1) return { data: clone(rows[0]), error: null };
    if (this.cardinality === "maybe" && rows.length === 0) return { data: null, error: null };
    return { data: null, error: { ...NO_ROW_OR_MANY } };
  }

  /** The error PostgREST raises for a `single()` write that would touch 0 or 2+ rows. */
  private singleViolation(count: number): FakeError | null {
    if (!this.returning || this.cardinality === "many") return null;
    if (count > 1 || (count === 0 && this.cardinality === "one")) return { ...NO_ROW_OR_MANY };
    return null;
  }

  private execute(): FakeResult {
    this.state.calls.push({
      kind: "table",
      target: this.table,
      op: this.op,
      filters: [...this.filters],
      options: this.options,
      payload: clone(this.payload),
    });
    const failure = takeFailure(this.state, this.table);
    if (failure) return { data: null, error: failure };

    if (this.op === "select") {
      const rows = this.sorted(this.matching());
      const end = this.limitTo === null ? undefined : this.skip + this.limitTo;
      return this.shape(rows.slice(this.skip, end));
    }

    if (this.op === "insert" || this.op === "upsert") return this.write();

    if (!this.predicates.length) {
      return {
        data: null,
        error: { code: "21000", message: `${this.op} requires a WHERE clause` },
      };
    }
    const hit = this.matching();
    const refused = this.singleViolation(hit.length);
    if (refused) return { data: null, error: refused };

    if (this.op === "update") {
      for (const row of hit) Object.assign(row, clone(this.payload));
      return this.returning ? this.shape(hit) : { data: null, error: null };
    }
    // delete
    const gone = new Set(hit);
    const kept = this.stored().filter((row) => !gone.has(row));
    this.stored().splice(0, this.stored().length, ...kept);
    return this.returning ? this.shape(hit) : { data: null, error: null };
  }

  private write(): FakeResult {
    const incoming = (Array.isArray(this.payload) ? this.payload : [this.payload]).map((row) =>
      clone(row as FakeRow),
    );
    const refused = this.singleViolation(incoming.length);
    if (refused) return { data: null, error: refused };

    const stored = this.stored();
    const touched: FakeRow[] = [];
    const settings = (this.options ?? {}) as { onConflict?: string; ignoreDuplicates?: boolean };
    const keys = (settings.onConflict ?? "id").split(",").map((key) => key.trim());
    for (const row of incoming) {
      if (this.op === "upsert") {
        const existing = stored.find((candidate) => keys.every((key) => present(row[key]) && candidate[key] === row[key]));
        if (existing) {
          if (!settings.ignoreDuplicates) {
            Object.assign(existing, row);
            touched.push(existing);
          }
          continue;
        }
      }
      stored.push(row);
      touched.push(row);
    }
    return this.returning ? this.shape(touched) : { data: null, error: null };
  }
}

export interface SupabaseFake {
  /** Stand in for `supabase` in `vi.mock("@/lib/supabase", ...)`. */
  client: {
    from(table: string): FakeQuery;
    rpc(name: string, args?: Record<string, unknown>): Promise<FakeResult>;
  };
  /** Add rows to a table (copied, so later edits to your objects do not leak in). */
  seed(table: string, rows: readonly FakeRow[]): void;
  /** What a table holds now (copies). */
  rows(table: string): FakeRow[];
  /** What `rpc(name)` returns as `data`. The handler may mutate tables through `seed`/`rows` if the test needs the effect. */
  onRpc(name: string, handler: RpcHandler): void;
  /**
   * Make the next call against a table or rpc fail with this error. One-shot.
   * `after: n` lets n calls to that target through first (to fail the second
   * insert of a loop, say), counting reads too.
   */
  failNext(target: string, error: { message: string; code?: string }, options?: { after?: number }): void;
  /** Every request made so far; see the file header before asserting on it. */
  calls: FakeCall[];
  /** Forget all rows, handlers, failures and calls. */
  reset(): void;
}

export function createSupabaseFake(): SupabaseFake {
  const state: FakeState = { tables: new Map(), handlers: new Map(), failures: new Map(), calls: [] };

  return {
    client: {
      from: (table) => new FakeQuery(state, table),
      rpc: async (name, args = {}) => {
        state.calls.push({ kind: "rpc", target: name, op: "rpc", filters: [], options: null, payload: clone(args) });
        const failure = takeFailure(state, name);
        if (failure) return { data: null, error: failure };
        const handler = state.handlers.get(name);
        if (!handler) {
          return { data: null, error: { code: "PGRST202", message: `No fake registered for rpc "${name}"` } };
        }
        const data = await handler(args);
        return { data: data === undefined ? null : data, error: null };
      },
    },
    seed(table, rows) {
      const existing = state.tables.get(table);
      const copies = rows.map(clone);
      if (existing) existing.push(...copies);
      else state.tables.set(table, copies);
    },
    rows: (table) => (state.tables.get(table) ?? []).map(clone),
    onRpc: (name, handler) => {
      state.handlers.set(name, handler);
    },
    failNext(target, error, options) {
      const queue = state.failures.get(target) ?? [];
      queue.push({ error: { message: error.message, code: error.code ?? "FAKE" }, after: options?.after ?? 0 });
      state.failures.set(target, queue);
    },
    calls: state.calls,
    reset() {
      state.tables.clear();
      state.handlers.clear();
      state.failures.clear();
      state.calls.length = 0;
    },
  };
}
