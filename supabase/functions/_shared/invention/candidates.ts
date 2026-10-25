import type { SupabaseClient } from "@supabase/supabase-js";
import { wrapUserInput } from "../ai-prompt.ts";
import { budgetFor, canAttune, MAGIC_ONLY_TYPES, rarityIndex } from "./budget.ts";
import { laneFor, rarityCeiling, RARITY_ORDER, unitValueCp, type InventionCandidate, type InventionDraft } from "./validate.ts";
import {
  ITEM_RARITIES,
  ITEM_TYPES,
  type CraftingDiscipline,
  type InventionBenchEntry,
  type InventionMode,
  type ItemRarity,
  type ItemType,
} from "./types.ts";

export const CANDIDATE_CAP = 25;
export const MATERIAL_TYPES: readonly ItemType[] = ["crafting_material", "trade_good", "art_object", "gear"];

// Larger than the loot generator's 14 and 16: the lane and band filters below
// thin the pool before the cap.
const MATCH_COUNT = 40;
const FALLBACK_COUNT = 40;
const ITEM_COLUMNS = "id, name, rarity, item_type, cost, requires_attunement, charges";

/** One item from either catalogue, before it is keyed for the model. */
export interface CandidateRow {
  source: "custom" | "library";
  id: string;
  name: string;
  rarity: ItemRarity;
  item_type: ItemType;
  cost: string | null;
  requires_attunement: boolean;
  charges: number | null;
  spell_count: number;
}

// ── Pure: filtering and keying ──────────────────────────────────────────────

/** Every rarity up to and including the ceiling, as the match RPCs' band. */
export function rarityBand(ceiling: ItemRarity): ItemRarity[] {
  return RARITY_ORDER.slice(0, rarityIndex(ceiling) + 1);
}

/** The cheap half of the validator's candidate checks, so the model is not offered what would be rejected. */
export function acceptsAsOutput(row: CandidateRow, discipline: CraftingDiscipline, ceiling: ItemRarity): boolean {
  if (!laneFor(discipline).includes(row.item_type)) return false;
  if (rarityIndex(row.rarity) > rarityIndex(ceiling)) return false;
  if (MAGIC_ONLY_TYPES.includes(row.item_type) && rarityIndex(row.rarity) < rarityIndex("common")) return false;
  if (row.spell_count > 0) return false;
  if (row.requires_attunement && !canAttune(row.rarity)) return false;
  if (row.charges !== null && row.charges > budgetFor(row.rarity).chargesMax) return false;
  const plus = /\+(\d+)/.exec(row.name);
  if (plus && Number(plus[1]) > budgetFor(row.rarity).bonusMax) return false;
  return true;
}

export function acceptsAsMaterial(row: CandidateRow): boolean {
  return MATERIAL_TYPES.includes(row.item_type);
}

/**
 * Dedupes by name (first wins, so callers pass custom rows before library
 * rows), filters, caps, and keys "<prefix>1".."<prefix>N". The key is all the
 * model ever sees of an item's identity.
 */
export function keyCandidates(
  rows: readonly CandidateRow[],
  accept: (row: CandidateRow) => boolean,
  prefix: string,
  cap: number = CANDIDATE_CAP,
): InventionCandidate[] {
  const seen = new Set<string>();
  const out: InventionCandidate[] = [];
  for (const row of rows) {
    if (out.length >= cap) break;
    const name = row.name.trim().toLowerCase();
    if (seen.has(name)) continue;
    seen.add(name);
    if (!accept(row)) continue;
    out.push({
      key: `${prefix}${out.length + 1}`,
      ref: row.source === "custom" ? { item_id: row.id } : { library_item_id: row.id },
      name: row.name,
      rarity: row.rarity,
      item_type: row.item_type,
      cost: row.cost,
      requires_attunement: row.requires_attunement,
      charges: row.charges,
      spell_count: row.spell_count,
    });
  }
  return out;
}

export interface UserContentInput {
  mode: InventionMode;
  discipline: CraftingDiscipline;
  valueMultiple: number;
  bench: readonly InventionBenchEntry[];
  outputCandidates: readonly InventionCandidate[];
  materialCandidates: readonly InventionCandidate[];
  wish: string | null;
  revision: { previous: InventionDraft; note: string; dmNote: string | null } | null;
}

/** Materials mode: the ceiling and the value limit the validator will hold the answer to. */
export function benchBudget(bench: readonly InventionBenchEntry[], valueMultiple: number): { ceiling: ItemRarity; valueLimitCp: number } {
  const value = bench.reduce((s, b) => s + unitValueCp(b.cost, b.rarity) * b.dishes, 0);
  return { ceiling: rarityCeiling(bench.map((b) => b.rarity)), valueLimitCp: Math.floor(value * valueMultiple) };
}

function candidateView(c: InventionCandidate) {
  return { id: c.key, name: c.name, rarity: c.rarity, item_type: c.item_type, cost: c.cost };
}

/** The previous draft as the model needs it, with every database id left out. */
export function draftView(d: InventionDraft) {
  return {
    item: d.item.new ?? { existing_item: d.item.name, rarity: d.item.rarity, item_type: d.item.item_type },
    mechanics: d.mechanics,
    quantity: d.quantity,
    recipe: d.recipe,
    ingredients: d.ingredients.map((i) => ({ name: i.name, rarity: i.rarity, value_cp: i.value_cp, quantity: i.quantity, new_material: i.new !== null })),
  };
}

export function buildUserContent(input: UserContentInput): string {
  const materialsFixed = input.mode === "materials";
  const budget = materialsFixed ? benchBudget(input.bench, input.valueMultiple) : null;
  const block: Record<string, unknown> = {
    mode: input.mode,
    discipline: input.discipline,
    discipline_item_types: laneFor(input.discipline),
    rarity_ceiling: budget ? budget.ceiling : "legendary",
    value_multiple: input.valueMultiple,
    bench: input.bench.map((b) => ({ name: b.name, rarity: b.rarity, cost: b.cost, quantity: b.dishes })),
    output_candidates: input.outputCandidates.map(candidateView),
  };
  if (budget) block.value_limit_cp = budget.valueLimitCp;
  if (!materialsFixed) block.material_candidates = input.materialCandidates.map(candidateView);
  if (input.wish !== null) block.wish = wrapUserInput(input.wish);
  if (input.revision) {
    block.previous_draft = draftView(input.revision.previous);
    block.revision_note = wrapUserInput(input.revision.note);
    if (input.revision.dmNote !== null) block.dm_note = `Note from the Dungeon Master who sent the draft back:\n${wrapUserInput(input.revision.dmNote)}`;
  }
  return JSON.stringify(block, null, 1);
}

// ── Retrieval ───────────────────────────────────────────────────────────────

type Raw = Record<string, unknown>;

function toRow(source: CandidateRow["source"], raw: Raw): CandidateRow | null {
  const rarity = (ITEM_RARITIES as readonly string[]).includes(raw.rarity as string) ? (raw.rarity as ItemRarity) : null;
  const type = (ITEM_TYPES as readonly string[]).includes(raw.item_type as string) ? (raw.item_type as ItemType) : null;
  if (typeof raw.id !== "string" || typeof raw.name !== "string" || rarity === null || type === null) return null;
  return {
    source,
    id: raw.id,
    name: raw.name,
    rarity,
    item_type: type,
    cost: typeof raw.cost === "string" ? raw.cost : null,
    requires_attunement: raw.requires_attunement === true,
    charges: typeof raw.charges === "number" ? raw.charges : null,
    // library_items has no spell_ids column; a null spell_ids on items means none.
    spell_count: Array.isArray(raw.spell_ids) ? raw.spell_ids.length : 0,
  };
}

function rows(source: CandidateRow["source"], data: readonly Raw[] | null): CandidateRow[] {
  return (data ?? []).flatMap((r) => {
    const row = toRow(source, r);
    return row ? [row] : [];
  });
}

export interface GatherArgs {
  campaignId: string;
  /** campaigns.user_id, never the caller: a player sees the DM's vault. */
  ownerId: string;
  ruleset: "2014" | "2024";
  discipline: CraftingDiscipline;
  ceiling: ItemRarity;
  queryText: string;
  wantMaterials: boolean;
  /** Embeds one text; records its own spend. Throws when no provider is usable. */
  embed: (text: string) => Promise<{ vector: string; model: string }>;
}

export interface Gathered {
  outputCandidates: InventionCandidate[];
  materialCandidates: InventionCandidate[];
}

interface Scope {
  campaignId: string;
  ownerId: string;
  ruleset: string;
  sourceKeys: string[];
}

const customScope = (s: Scope) => `campaign_id.eq.${s.campaignId},and(campaign_id.is.null,user_id.eq.${s.ownerId})`;
const libraryScope = (s: Scope) => `ruleset.is.null,ruleset.eq.${s.ruleset}`;

async function readCustom(admin: SupabaseClient, s: Scope, ids: string[]): Promise<CandidateRow[]> {
  const { data, error } = await admin.from("items").select(`${ITEM_COLUMNS}, spell_ids`).in("id", ids).or(customScope(s));
  if (error) throw new Error(`items read: ${error.message}`);
  return rows("custom", data as Raw[] | null);
}

async function readLibrary(admin: SupabaseClient, s: Scope, ids: string[]): Promise<CandidateRow[]> {
  const { data, error } = await admin
    .from("library_items")
    .select(ITEM_COLUMNS)
    .in("id", ids)
    .in("source_document_key", s.sourceKeys)
    .or(libraryScope(s));
  if (error) throw new Error(`library_items read: ${error.message}`);
  return rows("library", data as Raw[] | null);
}

/** The RPCs rank; the full rows are re-read here, in rank order, custom first. */
async function matched(
  admin: SupabaseClient,
  s: Scope,
  vector: string,
  model: string,
  rarities: readonly ItemRarity[],
): Promise<CandidateRow[]> {
  const [custom, library] = await Promise.all([
    admin.rpc("match_custom_items", {
      query_embedding: vector,
      p_campaign_id: s.campaignId,
      p_owner_id: s.ownerId,
      p_rarities: rarities,
      p_exclude_attunement: false,
      p_embedding_model: model,
      match_count: MATCH_COUNT,
    }),
    admin.rpc("match_library_items", {
      query_embedding: vector,
      source_keys: s.sourceKeys,
      p_ruleset: s.ruleset,
      p_rarities: rarities,
      p_exclude_attunement: false,
      p_embedding_model: model,
      match_count: MATCH_COUNT,
    }),
  ]);
  if (custom.error) throw new Error(`match_custom_items: ${custom.error.message}`);
  if (library.error) throw new Error(`match_library_items: ${library.error.message}`);
  const customIds = ((custom.data ?? []) as { id: string }[]).map((r) => r.id);
  const libraryIds = ((library.data ?? []) as { id: string }[]).map((r) => r.id);
  const [customRows, libraryRows] = await Promise.all([
    customIds.length > 0 ? readCustom(admin, s, customIds) : Promise.resolve([]),
    libraryIds.length > 0 ? readLibrary(admin, s, libraryIds) : Promise.resolve([]),
  ]);
  const byRank = (ids: string[]) => (a: CandidateRow, b: CandidateRow) => ids.indexOf(a.id) - ids.indexOf(b.id);
  return [...customRows.sort(byRank(customIds)), ...libraryRows.sort(byRank(libraryIds))];
}

/** Retrieval failed or found nothing usable: the plain filtered query, ordered by name. */
async function plain(
  admin: SupabaseClient,
  s: Scope,
  types: readonly ItemType[],
  rarities: readonly ItemRarity[] | null,
): Promise<CandidateRow[]> {
  let custom = admin.from("items").select(`${ITEM_COLUMNS}, spell_ids`).or(customScope(s)).in("item_type", [...types]);
  let library = admin
    .from("library_items")
    .select(ITEM_COLUMNS)
    .in("source_document_key", s.sourceKeys)
    .or(libraryScope(s))
    .in("item_type", [...types]);
  if (rarities) {
    custom = custom.in("rarity", [...rarities]);
    library = library.in("rarity", [...rarities]);
  }
  const [c, l] = await Promise.all([custom.order("name").limit(FALLBACK_COUNT), library.order("name").limit(FALLBACK_COUNT)]);
  if (c.error) throw new Error(`items read: ${c.error.message}`);
  if (l.error) throw new Error(`library_items read: ${l.error.message}`);
  return [...rows("custom", c.data as Raw[] | null), ...rows("library", l.data as Raw[] | null)];
}

async function enabledSourceKeys(admin: SupabaseClient, campaignId: string): Promise<string[]> {
  const { data, error } = await admin.from("campaign_enabled_sources").select("source_slug").eq("campaign_id", campaignId);
  // Narrowing to the bundled gear is the safe failure; widening is the licensing mistake.
  if (error) {
    console.warn(`invent-recipe: enabled sources unreadable, using bundled gear only: ${error.message}`);
    return ["grimoire-bundled"];
  }
  return ["grimoire-bundled", ...(data ?? []).map((r: { source_slug: string }) => r.source_slug)];
}

/**
 * Output candidates in the discipline's lane and the rarity band, and (idea
 * mode) material candidates. Retrieval is an enhancement: any failure, or an
 * empty result, falls back to a plain filtered query, never to an error.
 */
export async function gatherCandidates(admin: SupabaseClient, args: GatherArgs): Promise<Gathered> {
  const s: Scope = {
    campaignId: args.campaignId,
    ownerId: args.ownerId,
    ruleset: args.ruleset,
    sourceKeys: await enabledSourceKeys(admin, args.campaignId),
  };
  const lane = laneFor(args.discipline);
  const band = rarityBand(args.ceiling);
  const acceptOutput = (r: CandidateRow) => acceptsAsOutput(r, args.discipline, args.ceiling);

  let outputRows: CandidateRow[] = [];
  let materialRows: CandidateRow[] = [];
  try {
    const { vector, model } = await args.embed(args.queryText);
    outputRows = await matched(admin, s, vector, model, band);
    // An empty band array means every rarity: a rarer material is what pays for a rarer result.
    if (args.wantMaterials) materialRows = await matched(admin, s, vector, model, []);
  } catch (e) {
    console.warn(`invent-recipe: retrieval unavailable, using a plain query: ${e instanceof Error ? e.message : "unknown error"}`);
  }

  let outputCandidates = keyCandidates(outputRows, acceptOutput, "o");
  let materialCandidates = args.wantMaterials ? keyCandidates(materialRows, acceptsAsMaterial, "m") : [];
  if (outputCandidates.length === 0) outputCandidates = keyCandidates(await plain(admin, s, lane, band), acceptOutput, "o");
  if (args.wantMaterials && materialCandidates.length === 0) {
    materialCandidates = keyCandidates(await plain(admin, s, MATERIAL_TYPES, null), acceptsAsMaterial, "m");
  }
  return { outputCandidates, materialCandidates };
}
