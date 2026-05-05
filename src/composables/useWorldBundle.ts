import { ref } from "vue";
import type { Ref } from "vue";
import { computed } from "vue";
import { useMutation, useQuery, useQueryClient } from "@tanstack/vue-query";
import { supabase, getCurrentUser } from "@/lib/supabase";
import type { Campaign } from "@/types/campaign.types";

type Row = Record<string, unknown>;
type IdMap = Map<string, string>;

// ── Entity type registry ─────────────────────────────────────────────────────

export const BUNDLE_ENTITY_TYPES = [
  { key: "npcs",                  label: "NPCs",                  nameField: "name",  scope: "campaign" },
  { key: "locations",             label: "Locations",             nameField: "name",  scope: "campaign" },
  { key: "factions",              label: "Factions",              nameField: "name",  scope: "campaign" },
  { key: "quests",                label: "Quests",                nameField: "title", scope: "campaign" },
  { key: "notes",                 label: "Notes",                 nameField: "title", scope: "campaign" },
  { key: "encounters",            label: "Encounters",            nameField: "name",  scope: "campaign" },
  { key: "calendar_events",      label: "Calendar Events",        nameField: "title", scope: "campaign" },
  { key: "monsters",              label: "Homebrew Monsters",     nameField: "name",  scope: "library"  },
  { key: "items",                 label: "Items",                 nameField: "name",  scope: "library"  },
  { key: "spells",                label: "Homebrew Spells",       nameField: "name",  scope: "library"  },
  { key: "scriptorium_documents", label: "Scriptorium Docs",     nameField: "title", scope: "library"  },
] as const;

export type BundleEntityKey = (typeof BUNDLE_ENTITY_TYPES)[number]["key"];

export interface PickerItem {
  id: string;
  label: string;
}

export interface GrimoireBundle {
  version: "1";
  file_type: "world_bundle";
  name: string;
  description: string;
  author?: string;
  exported_at: string;
  // Campaign-scoped
  npcs?: Row[];
  npc_relationships?: Row[];
  locations?: Row[];
  store_items?: Row[];
  factions?: Row[];
  faction_npcs?: Row[];
  faction_locations?: Row[];
  faction_items?: Row[];
  faction_relations?: Row[];
  quests?: Row[];
  quest_objectives?: Row[];
  quest_refs?: Row[];
  notes?: Row[];
  encounters?: Row[];
  calendar_events?: Row[];
  // User-library
  monsters?: Row[];
  items?: Row[];
  spells?: Row[];
  scriptorium_documents?: Row[];
  _meta: {
    entity_counts: Record<string, number>;
    app_version: string;
  };
}

export interface BundlePreview {
  name: string;
  description: string;
  exportedAt: string;
  entityCounts: Record<string, number>;
}

// ── Query helpers ────────────────────────────────────────────────────────────

async function qByIds(table: string, field: string, ids: string[]): Promise<Row[]> {
  if (ids.length === 0) return [];
  const { data, error } = await (supabase.from(table as never) as ReturnType<typeof supabase.from>)
    .select("*")
    .in(field, ids);
  if (error) throw error;
  return (data ?? []) as Row[];
}

async function fetchByIds(table: string, ids: string[]): Promise<Row[]> {
  return qByIds(table, "id", ids);
}

// ── Entity picker composable ─────────────────────────────────────────────────

export function useEntityPickerItems(
  typeRef: Ref<BundleEntityKey | null>,
  campaignIdRef: Ref<string | null>,
) {
  return useQuery({
    queryKey: computed(() => ["bundle-picker", typeRef.value, campaignIdRef.value]),
    enabled: computed(() => typeRef.value !== null),
    queryFn: async (): Promise<PickerItem[]> => {
      if (!typeRef.value) return [];
      const def = BUNDLE_ENTITY_TYPES.find((t) => t.key === typeRef.value);
      if (!def) return [];

      const { nameField } = def;

      if (def.scope === "campaign") {
        if (!campaignIdRef.value) return [];
        const { data, error } = await (
          supabase.from(def.key as never) as ReturnType<typeof supabase.from>
        )
          .select(`id, ${nameField}`)
          .eq("campaign_id", campaignIdRef.value)
          .order(nameField as never);
        if (error) throw error;
        return (data ?? []).map((row) => ({
          id: (row as Row).id as string,
          label: ((row as Row)[nameField] as string) ?? "(unnamed)",
        }));
      } else {
        // Library scope — RLS handles user filter
        const { data, error } = await (
          supabase.from(def.key as never) as ReturnType<typeof supabase.from>
        )
          .select(`id, ${nameField}`)
          .order(nameField as never);
        if (error) throw error;
        return (data ?? []).map((row) => ({
          id: (row as Row).id as string,
          label: ((row as Row)[nameField] as string) ?? "(unnamed)",
        }));
      }
    },
  });
}

// ── Export ───────────────────────────────────────────────────────────────────

const CAMPAIGN_STRIP = ["user_id", "campaign_id", "created_at", "updated_at"];
const LIBRARY_STRIP = ["user_id", "created_at", "updated_at"];

function stripCampaignRow(row: Row): Row {
  const copy = { ...row };
  for (const f of CAMPAIGN_STRIP) delete copy[f];
  if (Array.isArray(copy.player_visible_to)) copy.player_visible_to = [];
  return copy;
}

function stripLibraryRow(row: Row): Row {
  const copy = { ...row };
  for (const f of LIBRARY_STRIP) delete copy[f];
  return copy;
}

export interface BuildBundleOptions {
  campaignId: string;
  name: string;
  description: string;
  author?: string;
  selection: Map<BundleEntityKey, string[]>;
}

async function buildBundle(opts: BuildBundleOptions): Promise<GrimoireBundle> {
  const { campaignId: _campaignId, name, description, author, selection } = opts;
  const entityCounts: Record<string, number> = {};
  const bundle: Partial<GrimoireBundle> = {};

  await Promise.all([

    // ── Campaign-scoped ──────────────────────────────────────────────────────

    selection.has("npcs") && (async () => {
      const ids = selection.get("npcs")!;
      const npcs = await fetchByIds("npcs", ids);
      bundle.npcs = npcs.map(stripCampaignRow);
      entityCounts.npcs = npcs.length;
      bundle.npc_relationships = (await qByIds("npc_relationships", "npc_id", ids)).map(stripCampaignRow);
    })(),

    selection.has("locations") && (async () => {
      const ids = selection.get("locations")!;
      const locs = await fetchByIds("locations", ids);
      bundle.locations = locs.map(stripCampaignRow);
      entityCounts.locations = locs.length;
      bundle.store_items = (await qByIds("store_items", "location_id", ids)).map(stripCampaignRow);
    })(),

    selection.has("factions") && (async () => {
      const ids = selection.get("factions")!;
      const factions = await fetchByIds("factions", ids);
      bundle.factions = factions.map(stripCampaignRow);
      entityCounts.factions = factions.length;
      const [fnpcs, flocs, fitems, frels] = await Promise.all([
        qByIds("faction_npcs", "faction_id", ids),
        qByIds("faction_locations", "faction_id", ids),
        qByIds("faction_items", "faction_id", ids),
        qByIds("faction_relations", "faction_id", ids),
      ]);
      bundle.faction_npcs = fnpcs.map(stripCampaignRow);
      bundle.faction_locations = flocs.map(stripCampaignRow);
      bundle.faction_items = fitems.map(stripCampaignRow);
      bundle.faction_relations = frels.map(stripCampaignRow);
    })(),

    selection.has("quests") && (async () => {
      const ids = selection.get("quests")!;
      const quests = await fetchByIds("quests", ids);
      bundle.quests = quests.map(stripCampaignRow);
      entityCounts.quests = quests.length;
      const [objs, refs] = await Promise.all([
        qByIds("quest_objectives", "quest_id", ids),
        qByIds("quest_refs", "quest_id", ids),
      ]);
      bundle.quest_objectives = objs.map(stripCampaignRow);
      bundle.quest_refs = refs.map(stripCampaignRow);
    })(),

    selection.has("notes") && (async () => {
      const ids = selection.get("notes")!;
      const notes = await fetchByIds("notes", ids);
      bundle.notes = notes.map(stripCampaignRow);
      entityCounts.notes = notes.length;
    })(),

    selection.has("encounters") && (async () => {
      const ids = selection.get("encounters")!;
      const encounters = await fetchByIds("encounters", ids);
      bundle.encounters = encounters.map(stripCampaignRow);
      entityCounts.encounters = encounters.length;
    })(),

    selection.has("calendar_events") && (async () => {
      const ids = selection.get("calendar_events")!;
      const events = await fetchByIds("calendar_events", ids);
      bundle.calendar_events = events.map(stripCampaignRow);
      entityCounts.calendar_events = events.length;
    })(),

    // ── User-library ─────────────────────────────────────────────────────────

    selection.has("monsters") && (async () => {
      const ids = selection.get("monsters")!;
      const monsters = await fetchByIds("monsters", ids);
      bundle.monsters = monsters.map(stripLibraryRow);
      entityCounts.monsters = monsters.length;
    })(),

    selection.has("items") && (async () => {
      const ids = selection.get("items")!;
      const items = await fetchByIds("items", ids);
      bundle.items = items.map(stripLibraryRow);
      entityCounts.items = items.length;
    })(),

    selection.has("spells") && (async () => {
      const ids = selection.get("spells")!;
      const spells = await fetchByIds("spells", ids);
      bundle.spells = spells.map(stripLibraryRow);
      entityCounts.spells = spells.length;
    })(),

    selection.has("scriptorium_documents") && (async () => {
      const ids = selection.get("scriptorium_documents")!;
      const docs = await fetchByIds("scriptorium_documents", ids);
      bundle.scriptorium_documents = docs.map(stripLibraryRow);
      entityCounts.scriptorium_documents = docs.length;
    })(),

  ].filter(Boolean));

  return {
    version: "1",
    file_type: "world_bundle",
    name,
    description,
    ...(author ? { author } : {}),
    exported_at: new Date().toISOString(),
    ...bundle,
    _meta: { entity_counts: entityCounts, app_version: "1.0.0" },
  };
}

async function compress(data: string): Promise<Blob> {
  const stream = new Blob([data]).stream().pipeThrough(new CompressionStream("gzip"));
  return new Response(stream).blob();
}

async function decompress(blob: Blob): Promise<string> {
  const stream = blob.stream().pipeThrough(new DecompressionStream("gzip"));
  return new Response(stream).text();
}

async function downloadBundle(bundle: GrimoireBundle): Promise<void> {
  const slug = bundle.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "") || "bundle";
  const blob = await compress(JSON.stringify(bundle));
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${slug}.grimoire`;
  a.click();
  URL.revokeObjectURL(url);
}

// ── Import ───────────────────────────────────────────────────────────────────

function sortByHierarchy(rows: Row[], parentField: string): Row[] {
  const result: Row[] = [];
  const seenIds = new Set<string>();
  const remaining = [...rows];
  let maxPasses = rows.length + 1;

  while (remaining.length > 0 && maxPasses-- > 0) {
    for (let i = remaining.length - 1; i >= 0; i--) {
      const row = remaining[i];
      const parentId = row[parentField] as string | null | undefined;
      if (!parentId || seenIds.has(parentId)) {
        result.push(row);
        seenIds.add(row.id as string);
        remaining.splice(i, 1);
      }
    }
  }
  result.push(...remaining);
  return result;
}

function buildIdMap(bundle: GrimoireBundle): IdMap {
  const map: IdMap = new Map();
  const allArrays = [
    bundle.npcs, bundle.npc_relationships,
    bundle.locations, bundle.store_items,
    bundle.factions, bundle.faction_npcs, bundle.faction_locations,
    bundle.faction_items, bundle.faction_relations,
    bundle.quests, bundle.quest_objectives, bundle.quest_refs,
    bundle.notes, bundle.encounters, bundle.calendar_events,
    bundle.monsters, bundle.items, bundle.spells,
    bundle.scriptorium_documents,
  ];
  for (const arr of allArrays) {
    if (!arr) continue;
    for (const row of arr) {
      if (row.id) map.set(row.id as string, crypto.randomUUID());
    }
  }
  return map;
}

/** Remap a campaign-entity FK — null if not found (entity not in bundle). */
function rCamp(id: unknown, map: IdMap): string | null {
  if (id === null || id === undefined || id === "") return null;
  return map.get(id as string) ?? null;
}

/** Remap a library-entity FK — preserve original if not in bundle (importer may have it). */
function rLib(id: unknown, map: IdMap): string | null {
  if (id === null || id === undefined || id === "") return null;
  return map.get(id as string) ?? (id as string);
}

async function batchInsert(table: string, rows: Row[]): Promise<void> {
  if (rows.length === 0) return;
  const BATCH = 100;
  for (let i = 0; i < rows.length; i += BATCH) {
    const { error } = await (supabase.from(table as never) as ReturnType<typeof supabase.from>)
      .insert(rows.slice(i, i + BATCH) as never);
    if (error) throw new Error(`Insert into ${table} failed: ${error.message}`);
  }
}

export interface ImportBundleOptions {
  bundle: GrimoireBundle;
  includeTypes: Set<BundleEntityKey>;
  /** null → create a new campaign */
  campaignId: string | null;
  newCampaignName?: string;
}

export interface ImportResult {
  newCampaign: Campaign | null;
}

async function executeImport(opts: ImportBundleOptions): Promise<ImportResult> {
  const { bundle, includeTypes } = opts;
  const user = getCurrentUser();
  if (!user) throw new Error("Not authenticated");
  const userId = user.id;
  const idMap = buildIdMap(bundle);

  let campaignId = opts.campaignId;
  let newCampaign: Campaign | null = null;

  if (campaignId === null) {
    if (!opts.newCampaignName?.trim()) throw new Error("Campaign name is required");
    const { data, error } = await supabase
      .from("campaigns")
      .insert({ name: opts.newCampaignName.trim(), user_id: userId })
      .select()
      .single();
    if (error) throw new Error(`Campaign creation failed: ${error.message}`);
    newCampaign = data as Campaign;
    campaignId = newCampaign.id;
  }

  // ── Campaign-scoped entities ──────────────────────────────────────────────

  if (includeTypes.has("locations") && bundle.locations?.length) {
    const sorted = sortByHierarchy(bundle.locations, "parent_id");
    await batchInsert("locations", sorted.map((loc) => ({
      ...loc,
      id: idMap.get(loc.id as string) ?? crypto.randomUUID(),
      campaign_id: campaignId,
      user_id: userId,
      parent_id: rCamp(loc.parent_id, idMap),
      npc_owner_id: rCamp(loc.npc_owner_id, idMap),
      player_visible_to: [],
      map_pins: [],
    })));
    if (bundle.store_items?.length) {
      await batchInsert("store_items", bundle.store_items.map((si) => ({
        ...si,
        id: idMap.get(si.id as string) ?? crypto.randomUUID(),
        user_id: userId,
        location_id: rCamp(si.location_id, idMap),
      })));
    }
  }

  if (includeTypes.has("npcs") && bundle.npcs?.length) {
    await batchInsert("npcs", bundle.npcs.map((npc) => ({
      ...npc,
      id: idMap.get(npc.id as string) ?? crypto.randomUUID(),
      campaign_id: campaignId,
      user_id: userId,
      location_id: rCamp(npc.location_id, idMap),
      player_visible_to: [],
      linked_monster_id: rLib(npc.linked_monster_id, idMap),
    })));
    if (bundle.npc_relationships?.length) {
      await batchInsert("npc_relationships", bundle.npc_relationships.map((rel) => ({
        ...rel,
        id: idMap.get(rel.id as string) ?? crypto.randomUUID(),
        campaign_id: campaignId,
        user_id: userId,
        npc_id: rCamp(rel.npc_id, idMap),
        related_npc_id: rCamp(rel.related_npc_id, idMap),
      })));
    }
  }

  if (includeTypes.has("factions") && bundle.factions?.length) {
    await batchInsert("factions", bundle.factions.map((f) => ({
      ...f,
      id: idMap.get(f.id as string) ?? crypto.randomUUID(),
      campaign_id: campaignId,
      user_id: userId,
      player_visible_to: [],
    })));
    await Promise.all([
      bundle.faction_npcs?.length
        ? batchInsert("faction_npcs", bundle.faction_npcs.map((fn) => ({
            ...fn, id: idMap.get(fn.id as string) ?? crypto.randomUUID(), user_id: userId,
            faction_id: rCamp(fn.faction_id, idMap), npc_id: rCamp(fn.npc_id, idMap),
          }))) : Promise.resolve(),
      bundle.faction_locations?.length
        ? batchInsert("faction_locations", bundle.faction_locations.map((fl) => ({
            ...fl, id: idMap.get(fl.id as string) ?? crypto.randomUUID(), user_id: userId,
            faction_id: rCamp(fl.faction_id, idMap), location_id: rCamp(fl.location_id, idMap),
          }))) : Promise.resolve(),
      bundle.faction_items?.length
        ? batchInsert("faction_items", bundle.faction_items.map((fi) => ({
            ...fi, id: idMap.get(fi.id as string) ?? crypto.randomUUID(), user_id: userId,
            faction_id: rCamp(fi.faction_id, idMap),
            // item_id: rLib so importer's library items are preserved
          }))) : Promise.resolve(),
      bundle.faction_relations?.length
        ? batchInsert("faction_relations", bundle.faction_relations.map((fr) => ({
            ...fr, id: idMap.get(fr.id as string) ?? crypto.randomUUID(), user_id: userId,
            faction_id: rCamp(fr.faction_id, idMap),
            target_faction_id: rCamp(fr.target_faction_id, idMap),
          }))) : Promise.resolve(),
    ]);
  }

  if (includeTypes.has("quests") && bundle.quests?.length) {
    const sorted = sortByHierarchy(bundle.quests, "parent_quest_id");
    await batchInsert("quests", sorted.map((q) => ({
      ...q,
      id: idMap.get(q.id as string) ?? crypto.randomUUID(),
      campaign_id: campaignId,
      user_id: userId,
      parent_quest_id: rCamp(q.parent_quest_id, idMap),
      giver_npc_id: rCamp(q.giver_npc_id, idMap),
      location_id: rCamp(q.location_id, idMap),
      player_visible_to: [],
    })));
    if (bundle.quest_objectives?.length) {
      await batchInsert("quest_objectives", bundle.quest_objectives.map((obj) => ({
        ...obj,
        id: idMap.get(obj.id as string) ?? crypto.randomUUID(),
        quest_id: rCamp(obj.quest_id, idMap),
      })));
    }
    if (bundle.quest_refs?.length) {
      await batchInsert("quest_refs", bundle.quest_refs.map((qr) => ({
        ...qr,
        id: idMap.get(qr.id as string) ?? crypto.randomUUID(),
        quest_id: rCamp(qr.quest_id, idMap),
        ref_id: ["npc", "location", "encounter"].includes(qr.ref_type as string)
          ? rCamp(qr.ref_id, idMap)
          : rLib(qr.ref_id, idMap),
      })));
    }
  }

  if (includeTypes.has("notes") && bundle.notes?.length) {
    await batchInsert("notes", bundle.notes.map((n) => ({
      ...n,
      id: idMap.get(n.id as string) ?? crypto.randomUUID(),
      campaign_id: campaignId,
      user_id: userId,
      linked_calendar_event_id: rCamp(n.linked_calendar_event_id, idMap),
      player_visible_to: [],
    })));
  }

  if (includeTypes.has("encounters") && bundle.encounters?.length) {
    await batchInsert("encounters", bundle.encounters.map((enc) => ({
      ...enc,
      id: idMap.get(enc.id as string) ?? crypto.randomUUID(),
      campaign_id: campaignId,
      user_id: userId,
      location_id: rCamp(enc.location_id, idMap),
      party_member_ids: [],
      companion_ids: [],
    })));
  }

  if (includeTypes.has("calendar_events") && bundle.calendar_events?.length) {
    await batchInsert("calendar_events", bundle.calendar_events.map((ev) => ({
      ...ev,
      id: idMap.get(ev.id as string) ?? crypto.randomUUID(),
      campaign_id: campaignId,
      user_id: userId,
      linked_quest_id: rCamp(ev.linked_quest_id, idMap),
      linked_encounter_id: rCamp(ev.linked_encounter_id, idMap),
      linked_location_id: rCamp(ev.linked_location_id, idMap),
      linked_note_id: rCamp(ev.linked_note_id, idMap),
      travel_party_member_ids: [],
    })));
  }

  // ── User-library entities ─────────────────────────────────────────────────

  if (includeTypes.has("monsters") && bundle.monsters?.length) {
    await batchInsert("monsters", bundle.monsters.map((m) => ({
      ...m,
      id: idMap.get(m.id as string) ?? crypto.randomUUID(),
      user_id: userId,
    })));
  }

  if (includeTypes.has("items") && bundle.items?.length) {
    await batchInsert("items", bundle.items.map((item) => ({
      ...item,
      id: idMap.get(item.id as string) ?? crypto.randomUUID(),
      user_id: userId,
    })));
  }

  if (includeTypes.has("spells") && bundle.spells?.length) {
    await batchInsert("spells", bundle.spells.map((sp) => ({
      ...sp,
      id: idMap.get(sp.id as string) ?? crypto.randomUUID(),
      user_id: userId,
    })));
  }

  if (includeTypes.has("scriptorium_documents") && bundle.scriptorium_documents?.length) {
    await batchInsert("scriptorium_documents", bundle.scriptorium_documents.map((doc) => ({
      ...doc,
      id: idMap.get(doc.id as string) ?? crypto.randomUUID(),
      user_id: userId,
    })));
  }

  return { newCampaign };
}

// ── Parse + preview ──────────────────────────────────────────────────────────

export async function parseBundleFile(file: File): Promise<GrimoireBundle> {
  let text: string;
  try {
    text = await decompress(file);
  } catch {
    throw new Error("Could not read bundle file. Make sure you selected a valid .grimoire file.");
  }

  let json: GrimoireBundle;
  try {
    json = JSON.parse(text) as GrimoireBundle;
  } catch {
    throw new Error("Could not parse bundle file. Make sure you selected a valid .grimoire file.");
  }

  if ((json as { file_type?: string }).file_type === "backup") {
    throw new Error("That's a campaign backup — use the backup import instead.");
  }
  if (json.file_type !== "world_bundle") {
    throw new Error("Unrecognised file type. Make sure you selected a .grimoire bundle file.");
  }
  if (json.version !== "1") {
    throw new Error(`Unsupported bundle version: ${json.version}`);
  }
  const hasContent = [
    json.npcs, json.locations, json.factions, json.quests,
    json.notes, json.encounters, json.calendar_events,
    json.monsters, json.items, json.spells, json.scriptorium_documents,
  ].some((arr) => arr && arr.length > 0);
  if (!hasContent) {
    throw new Error("This bundle appears to be empty.");
  }
  return json;
}

export function getBundlePreview(bundle: GrimoireBundle): BundlePreview {
  return {
    name: bundle.name,
    description: bundle.description,
    exportedAt: bundle.exported_at,
    entityCounts: bundle._meta.entity_counts,
  };
}

// ── Composables ──────────────────────────────────────────────────────────────

export function useExportWorldBundle() {
  return useMutation({
    mutationFn: (opts: BuildBundleOptions) => buildBundle(opts).then(downloadBundle),
  });
}

export function useImportWorldBundle() {
  const bundle = ref<GrimoireBundle | null>(null);
  const parseError = ref<string | null>(null);
  const queryClient = useQueryClient();

  function reset() {
    bundle.value = null;
    parseError.value = null;
  }

  async function parseFile(file: File) {
    parseError.value = null;
    try {
      bundle.value = await parseBundleFile(file);
    } catch (err) {
      parseError.value = err instanceof Error ? err.message : "Unknown error";
      bundle.value = null;
    }
  }

  const { mutateAsync, isPending } = useMutation({
    mutationFn: (opts: Omit<ImportBundleOptions, "bundle">) => {
      if (!bundle.value) throw new Error("No bundle loaded");
      return executeImport({ ...opts, bundle: bundle.value });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["npcs"] });
      queryClient.invalidateQueries({ queryKey: ["locations"] });
      queryClient.invalidateQueries({ queryKey: ["factions"] });
      queryClient.invalidateQueries({ queryKey: ["quests"] });
      queryClient.invalidateQueries({ queryKey: ["notes"] });
      queryClient.invalidateQueries({ queryKey: ["encounters"] });
      queryClient.invalidateQueries({ queryKey: ["calendar-events"] });
      queryClient.invalidateQueries({ queryKey: ["monsters"] });
      queryClient.invalidateQueries({ queryKey: ["items"] });
      queryClient.invalidateQueries({ queryKey: ["spells"] });
      queryClient.invalidateQueries({ queryKey: ["scriptorium"] });
    },
  });

  return {
    bundle,
    parseError,
    parseFile,
    executeImport: (opts: Omit<ImportBundleOptions, "bundle">) => mutateAsync(opts),
    isPending,
    reset,
  };
}
