import { CRAFTING_DISCIPLINES, type CraftingDiscipline, type InventionBenchEntry } from "./types.ts";

export const WISH_MAX = 1000;
export const NOTE_MAX = 500;
export const MAX_BENCH_ROWS = 8;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type InventRequest =
  | { action: "materials"; party_member_id: string; discipline: CraftingDiscipline; row_ids: string[] }
  | { action: "idea"; party_member_id: string; discipline: CraftingDiscipline; wish: string; row_ids: string[] }
  | { action: "revise"; invention_id: string; note: string };

export type ParseResult = { ok: true; request: InventRequest } | { ok: false; error: string };

function fail(error: string): ParseResult {
  return { ok: false, error };
}

function uuidField(o: Record<string, unknown>, key: string): string | null {
  const v = o[key];
  return typeof v === "string" && UUID.test(v) ? v : null;
}

function rowIds(raw: unknown, required: boolean): string[] | null {
  if (raw === undefined || raw === null) return required ? null : [];
  if (!Array.isArray(raw)) return null;
  if (raw.length > MAX_BENCH_ROWS || (required && raw.length === 0)) return null;
  const out: string[] = [];
  for (const id of raw) {
    if (typeof id !== "string" || !UUID.test(id)) return null;
    out.push(id);
  }
  return out;
}

function text(raw: unknown, max: number): string | null {
  if (typeof raw !== "string") return null;
  const t = raw.trim();
  return t !== "" && t.length <= max ? t : null;
}

export function parseInventRequest(body: unknown): ParseResult {
  if (typeof body !== "object" || body === null || Array.isArray(body)) return fail("The request must be a JSON object.");
  const o = body as Record<string, unknown>;

  if (o.action === "revise") {
    const invention_id = uuidField(o, "invention_id");
    if (invention_id === null) return fail("A revision needs the invention_id.");
    const note = text(o.note, NOTE_MAX);
    if (note === null) return fail(`A revision needs a note of 1 to ${NOTE_MAX} characters.`);
    return { ok: true, request: { action: "revise", invention_id, note } };
  }

  if (o.action !== "materials" && o.action !== "idea") return fail("The action must be materials, idea or revise.");

  const party_member_id = uuidField(o, "party_member_id");
  if (party_member_id === null) return fail("The request needs the party_member_id.");
  const discipline = CRAFTING_DISCIPLINES.find((d) => d === o.discipline);
  if (discipline === undefined) return fail("The discipline is not one the game knows.");

  if (o.action === "materials") {
    const ids = rowIds(o.row_ids, true);
    if (ids === null) return fail("Lay out between one and eight items.");
    return { ok: true, request: { action: "materials", party_member_id, discipline, row_ids: ids } };
  }

  const wish = text(o.wish, WISH_MAX);
  if (wish === null) return fail(`Describe what you want to build in 1 to ${WISH_MAX} characters.`);
  const ids = rowIds(o.row_ids, false);
  if (ids === null) return fail("Lay out at most eight items.");
  return { ok: true, request: { action: "idea", party_member_id, discipline, wish, row_ids: ids } };
}

/** A revision re-checks the bench it was made from: each row repeated once per dish. */
export function benchRowIds(bench: readonly Pick<InventionBenchEntry, "row_id" | "dishes">[]): string[] {
  return bench.flatMap((b) => Array.from({ length: b.dishes }, () => b.row_id));
}

export interface RpcContext {
  campaign_id: string;
  value_multiple: number;
  bench: InventionBenchEntry[];
}

/** craft_invention_context's jsonb, checked at the edge of the function. */
export function readContext(raw: unknown): RpcContext | null {
  if (typeof raw !== "object" || raw === null) return null;
  const o = raw as Record<string, unknown>;
  const multiple = typeof o.value_multiple === "string" ? Number(o.value_multiple) : o.value_multiple;
  if (typeof o.campaign_id !== "string" || typeof multiple !== "number" || !Number.isFinite(multiple) || multiple <= 0) return null;
  if (!Array.isArray(o.bench)) return null;
  return { campaign_id: o.campaign_id, value_multiple: multiple, bench: o.bench as InventionBenchEntry[] };
}

/** The model's reply as data; a non-JSON reply is reported, not thrown. */
export function parseModelAnswer(content: string): { ok: true; value: unknown } | { ok: false } {
  try {
    return { ok: true, value: JSON.parse(content) };
  } catch {
    return { ok: false };
  }
}

export function repairSuffix(previousAnswer: string, errors: readonly string[]): string {
  return (
    `\n\nYour previous answer:\n${previousAnswer}\n\n` +
    `The server rejected this draft for these reasons:\n${errors.map((e) => `- ${e}`).join("\n")}\n\n` +
    "Return a corrected JSON object."
  );
}

export interface Usage {
  model: string;
  provider: string;
  input_tokens: number;
  output_tokens: number;
}

/** Token totals over every call; model and provider are the last call's. */
export function sumUsage(calls: readonly Usage[]): Usage {
  const last = calls[calls.length - 1];
  return {
    model: last.model,
    provider: last.provider,
    input_tokens: calls.reduce((s, c) => s + c.input_tokens, 0),
    output_tokens: calls.reduce((s, c) => s + c.output_tokens, 0),
  };
}
