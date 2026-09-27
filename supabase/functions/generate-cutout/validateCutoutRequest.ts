/**
 * Pure request-body validation for generate-cutout, colocated so it can be
 * unit-tested without pulling in Deno's `serve`/`createClient` runtime — the
 * same reasoning as tile-pack-generator's packTarget.ts/libraryActions.ts.
 */

export type CutoutTable = "monsters" | "npcs";

export const CUTOUT_TABLES: readonly CutoutTable[] = ["monsters", "npcs"];

function isCutoutTable(value: unknown): value is CutoutTable {
  return typeof value === "string" && (CUTOUT_TABLES as readonly string[]).includes(value);
}

/** The column on `table` that holds the picture a cutout is generated from. */
export const PICTURE_COLUMN: Record<CutoutTable, string> = {
  monsters: "image_url",
  npcs: "portrait_url",
};

/**
 * Whether `table` carries its own `campaign_id` column. Monsters are a
 * user-global library (no campaign_id — see `Monster` in monster.types.ts),
 * so a monster's campaign membership is established only via `campaigns` +
 * `campaign_members`, never cross-checked against the row itself. NPCs are
 * campaign-scoped and must match the request's `campaign_id` exactly.
 */
export const TABLE_HAS_CAMPAIGN_ID: Record<CutoutTable, boolean> = {
  monsters: false,
  npcs: true,
};

export interface CutoutRequest {
  campaign_id: string;
  table: CutoutTable;
  id: string;
}

export type CutoutRequestValidation =
  | { ok: true; request: CutoutRequest }
  | { ok: false; error: string };

/** Validates the parsed JSON body of a `generate-cutout` request. */
export function validateCutoutRequest(body: unknown): CutoutRequestValidation {
  if (!body || typeof body !== "object") return { ok: false, error: "invalid_body" };
  const { campaign_id, table, id } = body as Record<string, unknown>;

  if (typeof campaign_id !== "string" || !campaign_id) return { ok: false, error: "invalid_body" };
  if (typeof id !== "string" || !id) return { ok: false, error: "invalid_body" };
  if (!isCutoutTable(table)) return { ok: false, error: "invalid_table" };

  return { ok: true, request: { campaign_id, table, id } };
}
