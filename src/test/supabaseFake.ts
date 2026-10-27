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
 * eq neq match in is not(is/eq) gt gte lt lte like ilike contains or, order, limit, range, single,
 * maybeSingle, rpc (through `onRpc` handlers) and one-shot failures (`failNext`).
 *
 * `or(expression)` parses PostgREST's comma-separated syntax: `col.op.value`
 * with op eq neq is in gt gte lt lte like ilike cs (and a `not.` before the op),
 * double-quoted values with `\"` escapes, and nested `and(...)` / `or(...)`.
 * A row passes when any top-level clause passes; chained `or()` calls are
 * ANDed, as in PostgREST. A clause it cannot read throws at the `.or()` call
 * naming it, never "matches everything".
 *
 * Every error is a `FakeError` (an `Error` with `code`, `details`, `hint`, like
 * supabase-js's `PostgrestError`), so `err instanceof Error` holds as in production.
 *
 * Not interpreted: column lists passed to `select` are ignored (whole rows come
 * back). Ids are not generated: seed or insert rows with the `id` you need.
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

/** What supabase-js returns as `error`: a `PostgrestError`, which is an `Error`. */
export class FakeError extends Error {
  readonly code: string;
  readonly details: string | null = null;
  readonly hint: string | null = null;

  constructor(message: string, code: string) {
    super(message);
    this.name = "PostgrestError";
    this.code = code;
  }
}

export interface FakeResult {
  data: unknown;
  error: FakeError | null;
  /** Set when the read asked for `{ count: "exact" }`: every matching row, before range or limit. */
  count?: number;
}

export type FakeFilterOp =
  | "eq" | "neq" | "in" | "is" | "gt" | "gte" | "lt" | "lte" | "like" | "ilike" | "or" | "not" | "contains";

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
  /** The column list given to `select(...)`, or null when none was; for a read that must not return `*`. */
  columns: string | null;
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

function noRowOrMany(): FakeError {
  return new FakeError("JSON object requested, multiple (or no) rows returned", "PGRST116");
}

function clone<T>(value: T): T {
  try {
    return structuredClone(value);
  } catch {
    // A Vue reactive proxy (a ref's array passed straight to a query) cannot be structured-cloned; plain JSON can read it.
    return JSON.parse(JSON.stringify(value)) as T;
  }
}

/** A column, or a path into a json column the way PostgREST writes it (`class_choices->starting_grants`). */
function cell(row: FakeRow, column: string): unknown {
  let value: unknown = row;
  for (const part of column.split("->")) {
    value = typeof value === "object" && value !== null ? (value as FakeRow)[part] : undefined;
  }
  return value;
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

/** A SQL LIKE pattern as a regex: `%` any run, `_` one character, `\` makes the next one literal. */
function likeRegex(pattern: string, caseInsensitive: boolean): RegExp {
  let source = "";
  for (let i = 0; i < pattern.length; i++) {
    const ch = pattern[i];
    if (ch === "\\" && i + 1 < pattern.length) {
      i += 1;
      source += pattern[i].replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    } else if (ch === "%") source += "[\\s\\S]*";
    else if (ch === "_") source += "[\\s\\S]";
    else source += ch.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }
  return new RegExp(`^${source}$`, caseInsensitive ? "i" : "");
}

function likeMatches(value: unknown, pattern: string, caseInsensitive: boolean): boolean {
  return typeof value === "string" && likeRegex(pattern, caseInsensitive).test(value);
}

class OrSyntaxError extends Error {
  constructor(clause: string, reason: string, whole: string) {
    super(`supabaseFake: cannot interpret or() clause "${clause}" (${reason}) in "${whole}"`);
    this.name = "OrSyntaxError";
  }
}

/** Split on commas that sit outside parentheses, braces and double quotes. */
function splitTop(source: string, whole: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let quoted = false;
  let start = 0;
  for (let i = 0; i < source.length; i++) {
    const ch = source[i];
    if (quoted) {
      if (ch === "\\") i += 1;
      else if (ch === '"') quoted = false;
    } else if (ch === '"') quoted = true;
    else if (ch === "(" || ch === "{") depth += 1;
    else if (ch === ")" || ch === "}") depth -= 1;
    else if (ch === "," && depth === 0) {
      parts.push(source.slice(start, i).trim());
      start = i + 1;
    }
  }
  if (quoted || depth !== 0) throw new OrSyntaxError(source, "unbalanced quote or parenthesis", whole);
  parts.push(source.slice(start).trim());
  return parts;
}

function unquote(value: string, whole: string): string {
  if (!value.startsWith('"')) return value;
  if (value.length < 2 || !value.endsWith('"')) throw new OrSyntaxError(value, "unterminated quoted value", whole);
  return value.slice(1, -1).replace(/\\(.)/g, "$1");
}

/** `{a,"b c"}` as its elements. */
function arrayLiteral(text: string, whole: string): string[] {
  if (!text.startsWith("{") || !text.endsWith("}")) throw new OrSyntaxError(text, "cs needs a {…} array", whole);
  const inner = text.slice(1, -1);
  return inner === "" ? [] : splitTop(inner, whole).map((item) => unquote(item, whole));
}

function textOf(value: unknown): string | null {
  return typeof value === "string" || typeof value === "number" || typeof value === "boolean" ? String(value) : null;
}

function operatorPredicate(column: string, op: string, raw: string, whole: string, clause: string): Predicate {
  const text = unquote(raw, whole);
  switch (op) {
    case "eq":
      return (row) => {
        const own = textOf(cell(row, column));
        return own !== null && own === text;
      };
    case "neq":
      return (row) => {
        const own = textOf(cell(row, column));
        return own !== null && own !== text;
      };
    case "is":
      if (text === "null") return (row) => !present(cell(row, column));
      if (text === "true" || text === "false") return (row) => cell(row, column) === (text === "true");
      throw new OrSyntaxError(clause, `is takes null, true or false, not "${text}"`, whole);
    case "in": {
      if (!raw.startsWith("(") || !raw.endsWith(")")) throw new OrSyntaxError(clause, "in needs (a,b)", whole);
      const inner = raw.slice(1, -1);
      const items = inner === "" ? [] : splitTop(inner, whole).map((item) => unquote(item, whole));
      return (row) => {
        const own = textOf(cell(row, column));
        return own !== null && items.includes(own);
      };
    }
    case "gt":
    case "gte":
    case "lt":
    case "lte": {
      const test = { gt: (c: number) => c > 0, gte: (c: number) => c >= 0, lt: (c: number) => c < 0, lte: (c: number) => c <= 0 }[op];
      return (row) => {
        const own = cell(row, column);
        return ordered(own, typeof own === "number" ? Number(text) : text, test);
      };
    }
    case "like":
    case "ilike":
      return (row) => likeMatches(cell(row, column), text, op === "ilike");
    case "cs": {
      const wanted = arrayLiteral(text, whole);
      return (row) => {
        const own = cell(row, column);
        return Array.isArray(own) && wanted.every((item) => own.some((element) => textOf(element) === item));
      };
    }
    default:
      throw new OrSyntaxError(clause, `unknown operator "${op}"`, whole);
  }
}

function clausePredicate(clause: string, whole: string): Predicate {
  if (clause === "") throw new OrSyntaxError(clause, "empty clause", whole);
  const group = /^(and|or)\(([\s\S]*)\)$/.exec(clause);
  if (group) {
    const parts = splitTop(group[2], whole).map((part) => clausePredicate(part, whole));
    return group[1] === "and" ? (row) => parts.every((part) => part(row)) : (row) => parts.some((part) => part(row));
  }
  const first = clause.indexOf(".");
  const second = first < 0 ? -1 : clause.indexOf(".", first + 1);
  if (first <= 0 || second < 0) throw new OrSyntaxError(clause, "expected column.operator.value", whole);
  const column = clause.slice(0, first);
  let op = clause.slice(first + 1, second);
  let rest = clause.slice(second + 1);
  let negated = false;
  if (op === "not") {
    const third = rest.indexOf(".");
    if (third <= 0) throw new OrSyntaxError(clause, "expected column.not.operator.value", whole);
    negated = true;
    op = rest.slice(0, third);
    rest = rest.slice(third + 1);
  }
  const inner = operatorPredicate(column, op, rest, whole, clause);
  if (!negated) return inner;
  // SQL NOT(null) is null: a missing column is excluded, except for `is`, which is never null.
  return op === "is" ? (row) => !inner(row) : (row) => present(cell(row, column)) && !inner(row);
}

/** The predicate for one `.or(expression)`: a row passes when any top-level clause does. */
function orPredicate(expression: string): Predicate {
  const clauses = splitTop(expression, expression).map((clause) => clausePredicate(clause, expression));
  return (row) => clauses.some((clause) => clause(row));
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
  private readonly sorts: { column: string; ascending: boolean; nullsFirst: boolean }[] = [];
  private countRows = false;
  private headOnly = false;
  private limitTo: number | null = null;
  private skip = 0;
  private cardinality: Cardinality = "many";
  private columns: string | null = null;

  constructor(
    private readonly state: FakeState,
    private readonly table: string,
  ) {}

  select(columns?: string, options?: { count?: "exact" | "planned" | "estimated"; head?: boolean }): this {
    this.columns = columns ?? null;
    if (this.op !== "select") this.returning = true;
    this.countRows = options?.count !== undefined;
    this.headOnly = options?.head === true;
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

  /** `match({ a: 1, b: 2 })`: every pair must be equal, like chained `eq`. */
  match(query: Record<string, unknown>): this {
    for (const [column, value] of Object.entries(query)) this.eq(column, value);
    return this;
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

  /** Array containment, like `@>`: the column holds every value given. */
  contains(column: string, values: readonly unknown[]): this {
    return this.filter(
      "contains",
      column,
      values,
      (row) => Array.isArray(row[column]) && values.every((value) => (row[column] as unknown[]).includes(value)),
    );
  }

  /** Only the two forms the app uses: `not(col, "is", null)` (a non-null column) and `not(col, "eq", v)`. */
  not(column: string, operator: "is" | "eq", value: unknown): this {
    if (operator === "is") {
      return this.filter("not", column, value, (row) => (value === null ? present(cell(row, column)) : cell(row, column) !== value));
    }
    return this.filter("not", column, value, (row) => cell(row, column) !== value);
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

  /** Case-sensitive SQL LIKE: `%` any run, `_` one character; a null column never matches. */
  like(column: string, pattern: string): this {
    return this.filter("like", column, pattern, (row) => likeMatches(cell(row, column), pattern, false));
  }

  /** Case-insensitive SQL LIKE; see `like`. */
  ilike(column: string, pattern: string): this {
    return this.filter("ilike", column, pattern, (row) => likeMatches(cell(row, column), pattern, true));
  }

  /** PostgREST's comma-separated filter list (see the file header); throws on a clause it cannot read. */
  or(expression: string): this {
    return this.filter("or", "", expression, orPredicate(expression));
  }

  order(column: string, options?: { ascending?: boolean; nullsFirst?: boolean }): this {
    const ascending = options?.ascending ?? true;
    // Postgres puts nulls last ascending and first descending unless told otherwise.
    this.sorts.push({ column, ascending, nullsFirst: options?.nullsFirst ?? !ascending });
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
      for (const { column, ascending, nullsFirst } of this.sorts) {
        const left = a[column];
        const right = b[column];
        if (!present(left) || !present(right)) {
          if (present(left) === present(right)) continue;
          return present(left) ? (nullsFirst ? 1 : -1) : nullsFirst ? -1 : 1;
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
    return { data: null, error: noRowOrMany() };
  }

  /** The error PostgREST raises for a `single()` write that would touch 0 or 2+ rows. */
  private singleViolation(count: number): FakeError | null {
    if (!this.returning || this.cardinality === "many") return null;
    if (count > 1 || (count === 0 && this.cardinality === "one")) return noRowOrMany();
    return null;
  }

  private execute(): FakeResult {
    this.state.calls.push({
      kind: "table",
      target: this.table,
      op: this.op,
      columns: this.columns,
      filters: [...this.filters],
      options: this.options,
      payload: clone(this.payload),
    });
    const failure = takeFailure(this.state, this.table);
    if (failure) return { data: null, error: failure };

    if (this.op === "select") {
      const rows = this.sorted(this.matching());
      const end = this.limitTo === null ? undefined : this.skip + this.limitTo;
      if (this.headOnly) return { data: null, error: null, count: rows.length };
      const result = this.shape(rows.slice(this.skip, end));
      return this.countRows ? { ...result, count: rows.length } : result;
    }

    if (this.op === "insert" || this.op === "upsert") return this.write();

    if (!this.predicates.length) {
      return { data: null, error: new FakeError(`${this.op} requires a WHERE clause`, "21000") };
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
        state.calls.push({ kind: "rpc", target: name, op: "rpc", columns: null, filters: [], options: null, payload: clone(args) });
        const failure = takeFailure(state, name);
        if (failure) return { data: null, error: failure };
        const handler = state.handlers.get(name);
        if (!handler) {
          return { data: null, error: new FakeError(`No fake registered for rpc "${name}"`, "PGRST202") };
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
      queue.push({ error: new FakeError(error.message, error.code ?? "FAKE"), after: options?.after ?? 0 });
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
