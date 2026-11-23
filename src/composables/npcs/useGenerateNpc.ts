/**
 * "Generate an NPC with AI and save it" — the workflow `NpcGeneratorPanel.vue` used to own inline, extracted so Ask
 * Grimoire (#1253) runs the exact same pipeline the page does instead of a second copy, as `useGenerateMonster` does
 * for monsters.
 *
 * Deliberately narrow: generate, create the row, log the pictures, then the ties the DM chose (faction, family,
 * associate) and the starter inventory. The panel keeps what is its own: navigation, the paywall and credit gates,
 * the toasts, and the cost display. A caller reads the outcome, not a toast: the page shows the link errors in one,
 * Ask lists them as part of the result.
 *
 * The portrait is its own part of the outcome. The text and the row are saved before a picture is known to have
 * worked, so a failed picture never costs the NPC: `portrait` says what became of it and the caller offers to paint
 * it again on the saved row (`useMissingPortrait`).
 */
import { useCreateNpcInCampaign } from "@/composables/npcs/useNpcs";
import { useImageGenerationLog } from "@/composables/ai/useImageGenerationLog";
import { useCreateKinLinkInCampaign } from "@/composables/kinship/useKinLinks";
import { useAddFactionNpc } from "@/composables/factions/useFactions";
import { useCreateConnectionInCampaign } from "@/composables/connections/useConnections";
import { useAddNpcInventoryItemInCampaign } from "@/composables/items/useNpcInventory";
import { useNpcStarterPacks } from "@/composables/npcs/useNpcStarterPacks";
import { useGameSystem } from "@/composables/rules/useGameSystem";
import { useToast } from "@/composables/useToast";
import { useCampaignStore } from "@/stores/campaign";
import { useNpcGeneration, toTiptapJson } from "@/ai/useNpcGeneration";
import { isAnyAiGenerating } from "@/ai/aiGeneratorRegistry";
import { getNpcTemplate } from "@/data/npcTemplates";
import { getCalendarAdapter } from "@/settings/index";
import { generatedBirthFromAge } from "@/lib/npcGenerator/generatedBirth";
import { kinInsertFor, parsePersonKey, personKey } from "@/lib/kinship/keys";
import { kinPromptLine, type GeneratorKinRelation, type PromptPerson } from "@/lib/npcGenerator/kinPrompt";
import { npcStarterStatTemplate } from "@/lib/npcGenerator/starterStats";
import { npcStarterInventory, type NpcStarterInventoryPack } from "@/lib/npcGenerator/inventorySets";
import { itemRefColumns } from "@/lib/itemRef";
import type { TypeChoice } from "@/lib/worldLinks/connections";
import type { PersonKey } from "@/types/kinship.types";
import type { ItemIndexEntry } from "@/types/item.types";
import type { NpcInsert, NpcRelationship } from "@/types/npc.types";

/** What the DM picked besides the concept: the NPC generator form's fields. */
export interface NpcGenerateForm {
  name: string;
  race: string;
  alignment: string;
  relationship: NpcRelationship;
  templateId: string;
  location_id: string | null;
  faction_id: string | null;
  faction_role: string;
  related_npc_id: string | null;
  /** What the new NPC is to the associate when the tie is a bond. Exclusive with kin. */
  related_npc_tie: TypeChoice;
  /** What the new NPC is to the associate when the tie is family. Exclusive with a bond. */
  related_npc_kin: GeneratorKinRelation | null;
  /** A character as the associate (arrives by link; the combobox lists NPCs). */
  related_pc_id: string | null;
  /** The other parent when the new NPC is a child. */
  second_parent: PersonKey | null;
}

/** The rows the generation context names things from, read by the caller (a panel reads them only while open). */
export interface NpcContextSources {
  locations: readonly { id: string; name: string; player_summary?: string | null }[];
  factions: readonly { id: string; name: string; faction_type?: string | null }[];
  npcs: readonly { id: string; name: string; born_year?: number | null; race?: string | null }[];
  party: readonly { id: string; name: string; born_year?: number | null }[];
  todayYear: number | null;
}

/** The constraint lines the model is given beside the concept: the form's choices, spelled out. */
export function buildNpcAiContext(
  form: NpcGenerateForm,
  locationId: string | null,
  items: readonly ItemIndexEntry[],
  sources: NpcContextSources,
): string {
  const constraints: string[] = [];
  const location = sources.locations.find((loc) => loc.id === locationId);
  if (form.name.trim()) constraints.push(`Name: ${form.name.trim()}`);
  if (form.race) constraints.push(`Race: ${form.race}`);
  if (form.alignment) constraints.push(`Alignment: ${form.alignment}`);
  if (form.relationship) constraints.push(`Party relationship: ${form.relationship}`);
  if (location) constraints.push(`Location: ${location.name}`);
  if (form.faction_id) {
    const faction = sources.factions.find((f) => f.id === form.faction_id);
    if (faction) {
      const typeLabel = faction.faction_type ? ` (${faction.faction_type})` : "";
      constraints.push(`Faction: ${faction.name}${typeLabel}, Role: ${form.faction_role}`);
    }
  }
  const kinPeople = kinPromptPeople(form, sources);
  if (form.related_npc_kin && kinPeople.length > 0) {
    constraints.push(kinPromptLine(form.related_npc_kin, kinPeople, sources.todayYear));
  } else if (form.related_pc_id || form.related_npc_id) {
    // A bond with a party member (Ask can name one; the page's picker only lists NPCs for a bond).
    const other = form.related_pc_id
      ? sources.party.find((p) => p.id === form.related_pc_id)
      : sources.npcs.find((n) => n.id === form.related_npc_id);
    if (other) {
      constraints.push(`Known associate: ${other.name} (this NPC is ${form.related_npc_tie.word} ${other.name})`);
    }
  }
  if (items.length) {
    constraints.push(`Starting inventory (include each exact item in this NPC's inventory): ${items.map((item) => item.name).join(", ")}`);
  }
  // Keep variable-length lore behind selected names, relationships and items.
  if (location?.player_summary) constraints.push(`Location summary: ${location.player_summary}`);
  return constraints.join("\n");
}

/** The family tie's other ends: the associate, then the second parent, as the prompt names them. */
function kinPromptPeople(form: NpcGenerateForm, sources: NpcContextSources): PromptPerson[] {
  const people: PromptPerson[] = [];
  const keys: PersonKey[] = [];
  if (form.related_pc_id) keys.push(personKey("pc", form.related_pc_id));
  else if (form.related_npc_id) keys.push(personKey("npc", form.related_npc_id));
  if (form.related_npc_kin === "child" && form.second_parent) keys.push(form.second_parent);
  for (const key of keys) {
    const { type, id } = parsePersonKey(key);
    const row = (type === "npc" ? sources.npcs : sources.party).find((p) => p.id === id);
    if (row) people.push({ name: row.name, bornYear: row.born_year ?? null, species: "race" in row && typeof row.race === "string" && row.race.trim() !== "" ? row.race.trim() : null });
  }
  return people;
}

export interface GenerateNpcRequest {
  /** What the DM wrote, trimmed: the gallery keeps it as the picture's prompt. */
  concept: string;
  /** What the model is asked: the concept with inventory mention tokens spelled as item names. */
  prompt: string;
  /** `buildNpcAiContext`'s lines. */
  context: string;
  generateAlterEgo: boolean;
  generateImage: boolean;
  form: NpcGenerateForm;
  locationId: string | null;
  inventoryItems: readonly ItemIndexEntry[];
  /** The associate the form names, when it still exists in this campaign. */
  associate: { id: string; name: string } | null;
}

/** What became of a picture: not asked for, painted and saved, or asked for and not painted. */
export type PictureState = "none" | "saved" | "failed";

export interface GenerateNpcOutcome {
  /** The created row's id, or `null` when generation or creation did not finish. */
  id: string | null;
  name: string | null;
  /**
   * Why a `null` id. Before generation (`stage: "prepare"`) nothing has been said yet, so the caller says it. After it,
   * the shared `error` ref of `useNpcGeneration` already holds the same sentence, which the panel renders.
   * `null` with a `null` id means the DM declined the likeness notice.
   */
  error: string | null;
  stage: "prepare" | "generate" | "saved";
  portrait: PictureState;
  disguisePortrait: PictureState;
  /** Ties the DM chose that could not be written; the NPC is saved anyway. */
  linkErrors: string[];
  /** Set when the starter inventory could not be added; the NPC is saved anyway. */
  inventoryError: string | null;
}

function noOutcome(stage: "prepare" | "generate", error: string | null): GenerateNpcOutcome {
  return {
    id: null, name: null, error, stage, portrait: "none", disguisePortrait: "none", linkErrors: [], inventoryError: null,
  };
}

export function useGenerateNpc() {
  const campaign = useCampaignStore();
  const toast = useToast();
  const { offers } = useGameSystem();
  const { mutateAsync: createNpc } = useCreateNpcInCampaign();
  const { logImageGeneration } = useImageGenerationLog();
  const { mutateAsync: addFactionNpc } = useAddFactionNpc();
  const { mutateAsync: createConnection } = useCreateConnectionInCampaign();
  const { mutateAsync: createKinLink } = useCreateKinLinkInCampaign();
  const { mutateAsync: addNpcInventoryItem } = useAddNpcInventoryItemInCampaign();
  // Read on demand with `refetch`: the packs are the admin's, and only a generation needs them.
  const starterPackQuery = useNpcStarterPacks(() => false);
  const { error: genError, concept: genConcept, clearCompleted, generate } = useNpcGeneration();

  async function seedNpcInventory(
    npcId: string,
    result: Pick<NpcInsert, "occupation" | "tags">,
    inventoryItems: readonly ItemIndexEntry[],
    campaignId: string,
    packs: readonly NpcStarterInventoryPack[],
  ) {
    const rows: { name: string; item: ItemIndexEntry | null }[] = npcStarterInventory(result.occupation, result.tags ?? [], packs).map((name) => ({ name, item: null }));
    for (const item of inventoryItems) {
      const existing = rows.findIndex((row) => row.name.toLowerCase() === item.name.toLowerCase());
      if (existing >= 0) rows.splice(existing, 1);
      rows.push({ name: item.name, item });
    }

    const seen = new Set<string>();
    for (const row of rows) {
      const key = row.item ? `ref:${row.item.id}` : `name:${row.name.toLowerCase()}`;
      if (seen.has(key)) continue;
      seen.add(key);
      await addNpcInventoryItem({
        npc_id: npcId,
        campaign_id: campaignId,
        ...itemRefColumns(row.item?.id),
        name: row.name,
        quantity: 1,
        notes: null,
      });
    }
  }

  /** The faction, the family tie and the associate the form named, written once the NPC exists. Returns what failed. */
  async function applyNpcLinks(
    npcId: string,
    form: NpcGenerateForm,
    campaignId: string,
    associate: { id: string; name: string } | null,
  ): Promise<string[]> {
    const errors: string[] = [];
    if (form.faction_id) {
      try {
        await addFactionNpc({ faction_id: form.faction_id, npc_id: npcId, role: form.faction_role });
      } catch (error: unknown) {
        errors.push(`faction: ${toast.fromError(error)}`);
      }
    }
    if (form.related_npc_kin) {
      // The new NPC is the subject: "Wren is the child of Brenna" writes the parent link Brenna to Wren.
      const subject = personKey("npc", npcId);
      const others: PersonKey[] = [];
      if (form.related_pc_id) others.push(personKey("pc", form.related_pc_id));
      else if (form.related_npc_id) others.push(personKey("npc", form.related_npc_id));
      if (form.related_npc_kin === "child" && form.second_parent) others.push(form.second_parent);
      // The second parent can end up naming the associate (the DM picks it, then changes the associate), and a
      // pair holds one link: write each person once.
      const self = personKey("npc", npcId);
      for (const other of new Set(others.filter((o) => o !== self))) {
        try {
          await createKinLink({ input: kinInsertFor(subject, form.related_npc_kin, other), campaignId });
        } catch (error: unknown) {
          errors.push(`family tie: ${toast.fromError(error)}`);
        }
      }
    } else if (form.related_npc_id || form.related_pc_id) {
      if (!associate) {
        errors.push("the selected associate is no longer in this campaign");
        return errors;
      }
      // The new NPC is the subject, and the choice is read from it: "Wren is apprentice of Brenna". A character is the
      // other end when the caller named one (the page's picker only lists NPCs; Ask can name a party member).
      try {
        await createConnection({ input: {
          subject: { kind: "npc", id: npcId },
          other: { kind: form.related_pc_id ? "party_member" : "npc", id: associate.id, name: associate.name },
          choice: form.related_npc_tie,
        }, campaignId });
      } catch (error: unknown) {
        errors.push(`relationship: ${toast.fromError(error)}`);
      }
    }
    return errors;
  }

  /**
   * Checks `isAnyAiGenerating` up front for the reason `useGenerateMonster` does: `generate()` bails on it without
   * touching its own `error`, so reading `genError` afterwards could surface a stale error from an earlier run.
   *
   * A quota failure on the create arrives as a thrown error (a race, or a stale count) for the caller to turn into
   * its paywall; everything after the row is saved is reported in the outcome and never throws.
   */
  async function generateAndCreateNpc(request: GenerateNpcRequest): Promise<GenerateNpcOutcome> {
    if (isAnyAiGenerating.value) return noOutcome("prepare", "Another AI generation is already in progress.");
    const campaignId = campaign.activeCampaignId;
    if (!campaignId) return noOutcome("prepare", "No active campaign selected.");
    const { form } = request;
    const supportsStatBlocks = offers("stat-blocks");
    const calendarId = campaign.activeCampaign?.calendar_id ?? null;
    const customCalendar = campaign.activeCampaign?.custom_calendar ?? null;
    const today = { year: campaign.todayYear, month: campaign.todayMonth, day: campaign.todayDay };
    genConcept.value = request.concept;
    clearCompleted();

    let packs: readonly NpcStarterInventoryPack[];
    try {
      const loaded = await starterPackQuery.refetch();
      if (loaded.isError || !loaded.data) throw loaded.error ?? new Error("Starter inventory packs are unavailable.");
      packs = loaded.data;
    } catch (error: unknown) {
      return noOutcome("prepare", toast.fromError(error, "Couldn't load starter inventory packs. Retry before generating."));
    }
    if (campaign.activeCampaignId !== campaignId) {
      return noOutcome("prepare", "The active campaign changed. Reopen the generator and try again.");
    }
    const starterPacks = packs.map((pack) => ({ ...pack, cues: [...pack.cues], items: [...pack.items] }));

    const result = await generate(request.prompt, {
      context: request.context,
      generateAlterEgo: request.generateAlterEgo,
      generateImage: request.generateImage,
    });
    if (!result) return noOutcome("generate", genError.value);

    const templateId = form.templateId === "auto"
      ? (supportsStatBlocks ? npcStarterStatTemplate(result.occupation, result.tags ?? []) : null)
      : form.templateId;
    const tpl = templateId ? getNpcTemplate(templateId) : null;

    const payload: NpcInsert = {
      name: form.name.trim() || result.name,
      campaign_id: campaignId,
      race: form.race || result.race || null,
      alignment: form.alignment || result.alignment || null,
      age: result.age || null,
      ...generatedBirthFromAge(
        getCalendarAdapter(calendarId, customCalendar),
        result.age,
        today,
      ),
      occupation: result.occupation || null,
      appearance: result.appearance ? toTiptapJson(result.appearance) : null,
      personality: result.personality ? toTiptapJson(result.personality) : null,
      voice: result.voice?.trim() || null,
      backstory: result.backstory ? toTiptapJson(result.backstory) : null,
      notes: result.notes ? toTiptapJson(result.notes) : null,
      status: result.status,
      relationship: form.relationship || result.relationship,
      portrait_url: result.portrait_url ?? null,
      cutout_url: null,
      portrait_focal_point: null,
      disguise_name: result.disguise_name ?? null,
      disguise_portrait_url: result.disguise_portrait_url ?? null,
      disguise_portrait_focal_point: null,
      is_revealed: false,
      tags: result.tags ?? [],
      stat_block: tpl?.stat_block ?? null,
      location_id: request.locationId,
      scriptorium_doc_id: null,
      player_visible_to: [],
      player_visible_fields: [],
      ai_provenance: result.ai_provenance ?? null,
    };

    const created = await createNpc(payload);

    // Log generated portraits to the Gallery, linked back to the new NPC.
    if (result.portrait_url) {
      void logImageGeneration({
        kind: "npc_portrait", imageUrl: result.portrait_url, prompt: genConcept.value,
        targetId: created.id, targetColumn: "portrait_url", campaignId,
      });
    }
    if (result.disguise_portrait_url) {
      void logImageGeneration({
        kind: "npc_portrait", imageUrl: result.disguise_portrait_url, prompt: result.disguise_name ?? genConcept.value,
        targetId: created.id, targetColumn: "disguise_portrait_url", campaignId,
      });
    }

    const linkErrors = await applyNpcLinks(created.id, form, campaignId, request.associate);
    let inventoryError: string | null = null;
    try {
      await seedNpcInventory(created.id, { occupation: result.occupation || null, tags: result.tags ?? [] }, request.inventoryItems, campaignId, starterPacks);
    } catch (error: unknown) {
      // The NPC is already saved. The DM can add items from its inventory tab.
      inventoryError = toast.fromError(error, "NPC created, but some starter items could not be added.");
    }

    return {
      id: created.id,
      name: payload.name,
      error: null,
      stage: "saved",
      portrait: pictureState(request.generateImage, result.portrait_url),
      // The alter ego's picture is painted from the true one, so no portrait means none of the two was asked of the model.
      disguisePortrait: pictureState(request.generateImage && request.generateAlterEgo, result.disguise_portrait_url),
      linkErrors,
      inventoryError,
    };
  }

  return { generateAndCreateNpc, applyNpcLinks };
}

function pictureState(asked: boolean, url: string | null | undefined): PictureState {
  if (!asked) return "none";
  return url ? "saved" : "failed";
}
