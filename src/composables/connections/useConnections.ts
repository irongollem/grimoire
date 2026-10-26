/**
 * The World Web's data layer (#1084): one place that reads a thing's ties and
 * writes them, whether the tie lives in `world_links` or in the record that
 * already held it (a membership, a kin link, an NPC's home, a pack). Callers
 * name two things and a `TypeChoice`; where the row goes is decided here, so a
 * sheet, the picker and the web never learn the homes.
 */
import { computed, toValue, type MaybeRefOrGetter } from "vue";
import { useMutation, useQuery, useQueryClient, type QueryClient } from "@tanstack/vue-query";
import type { LinkKind } from "@edge-shared/worldLinkCatalogue.ts";
import { supabase, getCurrentUser } from "@/lib/supabase";
import { useCampaignStore } from "@/stores/campaign";
import { CONNECTIONS_KEY, KIN_LINKS_KEY } from "@/lib/campaignLiveSync/registry";
import { queueEmbeddingsInBackground, type EmbedManyEntity } from "@/lib/queueEmbeddings";
import { connectionsQueryKey, fetchConnections, linkInsert, type TypeChoice } from "@/lib/worldLinks/connections";
import { endColumns, kinInsertFor, personKey } from "@/lib/kinship/keys";
import type { Connection, ConnectionSource, WorldLink, WorldRef } from "@/types/connections.types";
import type { KinKind, PersonKey } from "@/types/kinship.types";

export { CONNECTIONS_KEY };

/** A tie's far end, with the name a record write may need (an inventory row stores its item's name). */
export type NamedRef = WorldRef & { name: string };

export interface CreateConnectionInput {
  subject: WorldRef;
  other: NamedRef;
  choice: TypeChoice;
  note?: string;
  told?: string;
  /** party_members ids the link is revealed to (links only; a record has no reveal of its own). */
  playerVisibleTo?: string[];
  /** A membership's role; "Member" when absent. */
  role?: string;
}

export interface UpdateLinkInput {
  id: string;
  note?: string;
  told?: string;
  playerVisibleTo?: string[];
}

export interface RemoveConnectionInput {
  connection: Connection;
  subject: WorldRef;
}

export interface RetypeConnectionInput {
  connection: Connection;
  subject: WorldRef;
  choice: TypeChoice;
}

const EMBEDDABLE: Partial<Record<LinkKind, EmbedManyEntity>> = {
  npc: "npc",
  faction: "faction",
  location: "location",
  item: "item",
};

/** Re-queue the embedding of each end that has one: what a thing is tied to is part of what it says about itself. */
function requeueEnds(...ends: WorldRef[]): void {
  const byEntity = new Map<EmbedManyEntity, Set<string>>();
  for (const end of ends) {
    const entity = EMBEDDABLE[end.kind];
    if (!entity) continue;
    const ids = byEntity.get(entity) ?? new Set<string>();
    ids.add(end.id);
    byEntity.set(entity, ids);
  }
  for (const [entity, ids] of byEntity) queueEmbeddingsInBackground(entity, [...ids]);
}

/** The query roots a record home's own screens read, refreshed beside the connections. */
const HOME_ROOTS: Record<ConnectionSource, readonly string[]> = {
  link: [],
  membership: ["faction-npcs", "npc-factions", "faction-party-members", "party-member-factions", "factions"],
  kin: [KIN_LINKS_KEY],
  npc_home: ["npcs", "locations"],
  pc_place: ["party", "locations"],
  keeper: ["locations", "npcs"],
  seat: ["factions", "locations"],
  patron_deity: ["party"],
  inventory: ["npc-inventory", "party-inventory", "items"],
  store: ["store-items", "items"],
  quest: ["quests"],
};

function invalidateFor(qc: QueryClient, ...sources: ConnectionSource[]): Promise<unknown> {
  const roots = new Set<string>([CONNECTIONS_KEY]);
  for (const s of sources) for (const r of HOME_ROOTS[s]) roots.add(r);
  return Promise.all([...roots].map((root) => qc.invalidateQueries({ queryKey: [root] })));
}

function requireContext(who: string): { campaignId: string; userId: string } {
  const campaignId = useCampaignStore().activeCampaignId;
  if (campaignId === null) throw new Error(`${who} called without a campaign`);
  const user = getCurrentUser();
  if (!user) throw new Error(`${who} called while signed out`);
  return { campaignId, userId: user.id };
}

// ── Reads ────────────────────────────────────────────────────────────────────

/** Every tie of one thing, links and records, from its own side. Idle while the thing is not chosen. */
export function useConnections(kind: MaybeRefOrGetter<LinkKind | null>, id: MaybeRefOrGetter<string | null>) {
  const campaign = useCampaignStore();
  const campaignId = computed(() => campaign.activeCampaignId);
  return useQuery({
    queryKey: computed(() => {
      const k = toValue(kind);
      const i = toValue(id);
      return k && i ? connectionsQueryKey(k, i, campaignId.value) : ([CONNECTIONS_KEY, "idle"] as const);
    }),
    queryFn: () => {
      const k = toValue(kind);
      const i = toValue(id);
      if (!k || !i) throw new Error("useConnections fetched without a subject");
      return fetchConnections(k, i, campaignId.value);
    },
    enabled: computed(() => !!toValue(kind) && !!toValue(id) && !!campaignId.value),
  });
}

/** Every `world_links` row of the campaign: the world web draws them all at once. */
export function useCampaignLinks() {
  const campaign = useCampaignStore();
  const campaignId = computed(() => campaign.activeCampaignId);
  return useQuery({
    queryKey: computed(() => [CONNECTIONS_KEY, "campaign", campaignId.value] as const),
    queryFn: async ({ queryKey: [, , cid] }) => {
      if (cid === null) throw new Error("useCampaignLinks fetched without a campaign");
      const { data, error } = await supabase
        .from("world_links")
        .select("*")
        .eq("campaign_id", cid)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return data as WorldLink[];
    },
    enabled: computed(() => !!campaignId.value),
  });
}

// ── Writes: the shape of each home ────────────────────────────────────────────

const KIN_KIND_OF: Record<string, KinKind> = {
  parent_of: "parent",
  spouse_of: "spouse",
  former_spouse_of: "former_spouse",
  sibling_of: "sibling",
  relative_of: "relative",
};

function kinKindFor(key: string): KinKind {
  const kind = KIN_KIND_OF[key];
  if (!kind) throw new Error(`"${key}" is not a kin type`);
  return kind;
}

function personKeyOf(ref: WorldRef): PersonKey {
  if (ref.kind === "npc") return personKey("npc", ref.id);
  if (ref.kind === "party_member") return personKey("pc", ref.id);
  throw new Error(`a ${ref.kind} is not a person`);
}

/** The two ends in the direction a choice stores them. */
function ends(subject: WorldRef, other: WorldRef, choice: Pick<TypeChoice, "subjectIsFrom">): { from: WorldRef; to: WorldRef } {
  return choice.subjectIsFrom ? { from: subject, to: other } : { from: other, to: subject };
}

/** Every end column of `world_links`, so a re-aimed link can null the old ones in the same statement. */
const LINK_END_COLUMNS = ["npc_id", "party_member_id", "faction_id", "location_id", "deity_id", "item_id"] as const;

async function itemName(item: WorldRef, other: NamedRef): Promise<string> {
  if (other.kind === "item" && other.id === item.id) return other.name;
  const { data, error } = await supabase.from("items").select("name").eq("id", item.id).single();
  if (error) throw error;
  return (data as { name: string }).name;
}

/** Write one tie to wherever it lives. A quest's own records are written by the quest, not here. */
async function writeTie(input: CreateConnectionInput): Promise<void> {
  const { subject, other, choice } = input;
  const { campaignId, userId } = requireContext("useCreateConnection");
  const { from, to } = ends(subject, other, choice);

  if (!choice.home) {
    const { error } = await supabase.from("world_links").insert({
      ...linkInsert(subject, other, choice),
      campaign_id: campaignId,
      user_id: userId,
      // Absent fields take the table's defaults: no note, nothing told, nobody knows.
      ...(input.note !== undefined ? { note: input.note } : {}),
      ...(input.told !== undefined ? { told: input.told } : {}),
      ...(input.playerVisibleTo !== undefined ? { player_visible_to: input.playerVisibleTo } : {}),
    });
    if (error) throw error;
    return;
  }

  switch (choice.home) {
    case "membership": {
      const table = from.kind === "npc" ? "faction_npcs" : "faction_party_members";
      const person = from.kind === "npc" ? { npc_id: from.id } : { party_member_id: from.id };
      const { error } = await supabase
        .from(table)
        .insert({ ...person, faction_id: to.id, role: input.role ?? "Member", user_id: userId });
      if (error) throw error;
      return;
    }
    case "kin": {
      const row = kinInsertFor(personKeyOf(from), kinKindFor(choice.key), personKeyOf(to), { note: input.note });
      const { error } = await supabase.from("kin_links").insert({ ...row, campaign_id: campaignId, user_id: userId });
      if (error) throw error;
      return;
    }
    case "npc_home":
      return setColumn("npcs", from.id, { location_id: to.id });
    case "pc_place":
      return setColumn("party_members", from.id, { current_location_id: to.id });
    case "keeper":
      // The venue holds the keeper: `to` is the location, `from` the NPC.
      return setColumn("locations", to.id, { npc_owner_id: from.id });
    case "seat":
      return setColumn("factions", from.id, { seat_location_id: to.id });
    case "patron_deity":
      return setColumn("party_members", from.id, { deity_id: to.id });
    case "inventory": {
      const name = await itemName(to, other);
      const row =
        from.kind === "npc"
          ? { table: "npc_inventory" as const, values: { npc_id: from.id } }
          : { table: "party_inventory" as const, values: { carried_by: from.id } };
      const { error } = await supabase
        .from(row.table)
        .insert({ ...row.values, item_id: to.id, name, quantity: 1, campaign_id: campaignId, user_id: userId });
      if (error) throw error;
      return;
    }
    case "store": {
      // The pair is item to location: the item is the `from` end.
      const { error } = await supabase.from("store_items").insert({ item_id: from.id, location_id: to.id, user_id: userId });
      if (error) throw error;
      return;
    }
    case "quest":
      throw new Error("a quest's ties are written on the quest, not as a connection");
  }
}

async function setColumn(table: "npcs" | "party_members" | "locations" | "factions", id: string, values: Record<string, string | null>) {
  const { error } = await supabase.from(table).update(values).eq("id", id);
  if (error) throw error;
}

/** Clear a single-column tie, but only while the column still names the far end (someone else may have re-pointed it). */
async function clearColumn(
  table: "npcs" | "party_members" | "locations" | "factions",
  rowId: string,
  column: string,
  expected: string,
) {
  const { error } = await supabase.from(table).update({ [column]: null }).eq("id", rowId).eq(column, expected);
  if (error) throw error;
}

/** Remove one tie from its home. */
async function eraseTie(connection: Connection, subject: WorldRef): Promise<void> {
  const other: WorldRef = { kind: connection.other_kind as LinkKind, id: connection.other_id };
  const byKind = (kind: LinkKind): WorldRef => (subject.kind === kind ? subject : other);

  switch (connection.source) {
    case "link": {
      const { error } = await supabase.from("world_links").delete().eq("id", connection.row_id);
      if (error) throw error;
      return;
    }
    case "membership": {
      const person = subject.kind === "faction" ? other : subject;
      const table = person.kind === "npc" ? "faction_npcs" : "faction_party_members";
      const { error } = await supabase.from(table).delete().eq("id", connection.row_id);
      if (error) throw error;
      return;
    }
    case "kin": {
      const { error } = await supabase.from("kin_links").delete().eq("id", connection.row_id);
      if (error) throw error;
      return;
    }
    case "npc_home":
      return clearColumn("npcs", connection.row_id, "location_id", byKind("location").id);
    case "pc_place":
      return clearColumn("party_members", connection.row_id, "current_location_id", byKind("location").id);
    case "keeper":
      return clearColumn("locations", connection.row_id, "npc_owner_id", byKind("npc").id);
    case "seat":
      return clearColumn("factions", connection.row_id, "seat_location_id", byKind("location").id);
    case "patron_deity":
      return clearColumn("party_members", connection.row_id, "deity_id", byKind("deity").id);
    case "inventory": {
      const person = subject.kind === "item" ? other : subject;
      const { error } = await supabase
        .from(person.kind === "npc" ? "npc_inventory" : "party_inventory")
        .delete()
        .eq("id", connection.row_id);
      if (error) throw error;
      return;
    }
    case "store": {
      const { error } = await supabase.from("store_items").delete().eq("id", connection.row_id);
      if (error) throw error;
      return;
    }
    case "quest":
      throw new Error("a quest's ties are removed on the quest, not as a connection");
  }
}

// ── Mutations ────────────────────────────────────────────────────────────────

/** Tie two things together with a chosen type; a record type writes to the record that already holds that kind of tie. */
export function useCreateConnection() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: writeTie,
    onSuccess: async (_d, input) => {
      requeueEnds(input.subject, input.other);
      await invalidateFor(qc, input.choice.home ?? "link");
    },
  });
}

/** Edit what a link says: the DM's note, the line players read, and who has been told. */
export function useUpdateLink() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, note, told, playerVisibleTo }: UpdateLinkInput): Promise<void> => {
      const patch = {
        ...(note !== undefined ? { note } : {}),
        ...(told !== undefined ? { told } : {}),
        ...(playerVisibleTo !== undefined ? { player_visible_to: playerVisibleTo } : {}),
      };
      const { error } = await supabase.from("world_links").update(patch).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => invalidateFor(qc, "link"),
  });
}

export function useRemoveConnection() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ connection, subject }: RemoveConnectionInput) => eraseTie(connection, subject),
    onSuccess: async (_d, { connection, subject }) => {
      requeueEnds(subject, { kind: connection.other_kind as LinkKind, id: connection.other_id });
      await invalidateFor(qc, connection.source);
    },
  });
}

/**
 * Change a tie's type in place (#1084: every type word is a picker, nothing is
 * re-added). One statement when the tie keeps its home; across homes the new
 * tie is written first and the old one removed after, so a failure leaves the
 * tie rather than losing it.
 */
export function useRetypeConnection() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ connection, subject, choice }: RetypeConnectionInput): Promise<void> => {
      const other: NamedRef = { kind: connection.other_kind as LinkKind, id: connection.other_id, name: connection.other_name };

      if (connection.source === "link" && !choice.home) {
        const patch: Record<string, string | null> = { type: choice.key };
        if (connection.outward !== choice.subjectIsFrom) {
          // Re-aimed: null every end column, then set the two the new direction names.
          for (const col of LINK_END_COLUMNS) {
            patch[`from_${col}`] = null;
            patch[`to_${col}`] = null;
          }
          Object.assign(patch, linkInsert(subject, other, choice));
        }
        const { error } = await supabase.from("world_links").update(patch).eq("id", connection.row_id);
        if (error) throw error;
        return;
      }

      if (connection.source === "kin" && choice.home === "kin") {
        const { from, to } = ends(subject, other, choice);
        const row = kinInsertFor(personKeyOf(from), kinKindFor(choice.key), personKeyOf(to));
        const patch = { ...endColumns(personKeyOf(from), personKeyOf(to)), kind: row.kind, parent_role: row.parent_role ?? null, adoptive: row.adoptive ?? false };
        const { error } = await supabase.from("kin_links").update(patch).eq("id", connection.row_id);
        if (error) throw error;
        return;
      }

      // A link and a record, or two homes: carry the words across where the new home has a place for them.
      await writeTie({
        subject,
        other,
        choice,
        ...(connection.note !== null ? { note: connection.note } : {}),
        ...(connection.told !== null ? { told: connection.told } : {}),
        ...(connection.player_visible_to !== null ? { playerVisibleTo: connection.player_visible_to } : {}),
        ...(connection.role !== null ? { role: connection.role } : {}),
      });
      await eraseTie(connection, subject);
    },
    onSuccess: async (_d, { connection, subject, choice }) => {
      requeueEnds(subject, { kind: connection.other_kind as LinkKind, id: connection.other_id });
      await invalidateFor(qc, connection.source, choice.home ?? "link");
    },
  });
}
