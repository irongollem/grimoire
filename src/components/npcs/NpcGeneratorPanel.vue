<template>
  <GeneratorPanelFrame :open="npcsUi.npcGeneratorOpen" title="NPC Generator" @close="handleClose">
    <NpcGeneratorForm
      v-model:concept="concept"
      :quick-form="quickForm"
      @update:quick-form="onUpdateQuickForm"
      v-model:generate-alter-ego="generateAlterEgo"
      v-model:generate-image="generateImage"
      :item-options="itemOptions ?? []"
      @update:mentioned-item-ids="mentionedItemIds = $event"
      :is-ai-enabled="isAiEnabled"
      :is-generating="isGenerating"
      :gen-error="genError"
      @dismiss-to-background="dismissToBackground"
    />

    <template #footer>
      <GenerationCostBadge
        v-if="isAiEnabled"
        :credits="effectiveCreditCost"
        :byok="isFullyByok"
        class="self-center"
      />
      <AppButton
        v-if="isAiEnabled"
        variant="primary"
        size="md"
        block
        :icon="IconGenerate"
        :disabled="isAnyAiGenerating || isCreateFlowPending || !concept.trim() || concept.trim().length > AI_PROMPT_LIMIT"
        :tooltip="isAnyAiGenerating && !isGenerating ? 'Another generation is already in progress' : undefined"
        :label="isCreateFlowPending && !isGenerating ? 'Finishing…' : isGenerating ? 'Generating…' : 'Generate with AI'"
        @click="generateAndCreate"
      />
      <AiOffNotice v-else />
      <AppButton
        variant="primary"
        size="md"
        block
        :disabled="isCreating || isCreateFlowPending"
        :label="isCreateFlowPending || isCreating ? 'Creating…' : 'Quick Create NPC'"
        @click="quickCreate"
      />
    </template>
  </GeneratorPanelFrame>

  <PaywallModal v-model="showQuotaPaywall" resource="npcs" />
</template>

<script setup lang="ts">
import { ref, reactive, computed, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import { IconGenerate } from "@/lib/icons";
import { rollPeople } from "@/lib/canon/peoples";
import { useNpcsUiStore } from "@/stores/ui/npcs";
import { useCreateNpcInCampaign } from "@/composables/npcs/useNpcs";
import { useImageGenerationLog } from "@/composables/ai/useImageGenerationLog";
import { useAiCredits } from "@/composables/ai/useAiCredits";
import { useGenerationGate } from "@/composables/ai/useGenerationGate";
import { PORTRAIT_SIZE_BY_PROVIDER } from "@/composables/ai/useProviderConfig";
import { useCampaignProviders } from "@/composables/ai/useCampaignProviders";
import { getNpcTemplate } from "@/data/npcTemplates";
import type { NpcInsert, NpcRelationship } from "@/types/npc.types";
import { DEFAULT_ASSOCIATE } from "@/lib/npcGenerator/associate";
import { useParty } from "@/composables/party/useParty";
import { useCreateKinLinkInCampaign } from "@/composables/kinship/useKinLinks";
import { kinInsertFor, parsePersonKey, personKey } from "@/lib/kinship/keys";
import { isGeneratorKin, kinPromptLine, parseKinQueryKey, type PromptPerson } from "@/lib/npcGenerator/kinPrompt";
import type { PersonKey } from "@/types/kinship.types";
import { useCampaignStore } from "@/stores/campaign";
import { useCampaignPeoples } from "@/composables/canon/useCampaignPeoples";
import { generatedBirthFromAge } from "@/lib/npcGenerator/generatedBirth";
import { getCalendarAdapter } from "@/settings/index";
import { useNpcGeneration, toTiptapJson } from "@/ai/useNpcGeneration";
import AppButton from "@/components/common/controls/AppButton.vue";
import GeneratorPanelFrame from "@/components/common/ai/GeneratorPanelFrame.vue";
import GenerationCostBadge from "@/components/common/ai/GenerationCostBadge.vue";
import AiOffNotice from "@/components/common/feedback/AiOffNotice.vue";
import PaywallModal from "@/components/common/overlays/PaywallModal.vue";
import { isAnyAiGenerating } from "@/ai/aiGeneratorRegistry";
import { AI_PROMPT_LIMIT } from "@/ai/utils";
import { useLocationTree } from "@/composables/locations/useLocations";
import { useAllFactions, useAddFactionNpc } from "@/composables/factions/useFactions";
import { useNpcs } from "@/composables/npcs/useNpcs";
import { useCreateConnectionInCampaign } from "@/composables/connections/useConnections";
import NpcGeneratorForm from "@/components/npcs/NpcGeneratorForm.vue";
import type { QuickForm } from "@/components/npcs/NpcGeneratorForm.vue";
import { useItemIndex } from "@/composables/items/useItemIndex";
import { useAddNpcInventoryItemInCampaign } from "@/composables/items/useNpcInventory";
import { itemRefColumns } from "@/lib/itemRef";
import { npcStarterInventory, type NpcStarterInventoryPack } from "@/lib/npcGenerator/inventorySets";
import { useNpcStarterPacks } from "@/composables/npcs/useNpcStarterPacks";
import { npcStarterStatTemplate } from "@/lib/npcGenerator/starterStats";
import { locationNamedInStory } from "@/lib/npcGenerator/storyLocation";
import { mentionTokenPattern } from "@/lib/mentionToken";
import type { ItemIndexEntry } from "@/types/item.types";
import { useToast } from "@/composables/useToast";
import { useGameSystem } from "@/composables/rules/useGameSystem";

const FIRST_NAMES = [
  "Aldric", "Mira", "Theron", "Selja", "Corvus", "Lysa",
  "Dain", "Vex", "Orin", "Nessa", "Balthus", "Kira", "Fenris", "Yara", "Cael",
];
const LAST_NAMES = [
  "Stone", "Ashvale", "Brightwater", "Darkwood", "Ironside",
  "Swiftarrow", "Flamecrest", "Coldbrook", "Thornwall", "Duskmantle",
];

function randomName(): string {
  const first = FIRST_NAMES[Math.floor(Math.random() * FIRST_NAMES.length)];
  const last = LAST_NAMES[Math.floor(Math.random() * LAST_NAMES.length)];
  return `${first} ${last}`;
}

const npcsUi = useNpcsUiStore();
const router = useRouter();
const route = useRoute();
const { mutateAsync: createNpc, isPending: isCreating } = useCreateNpcInCampaign();
const { logImageGeneration } = useImageGenerationLog();
const campaign = useCampaignStore();
const { peoples } = useCampaignPeoples();
const {
  isGenerating,
  error: genError,
  concept: genConcept,
  completedEntityId: completedNpcId,
  clearCompleted,
  generate,
} = useNpcGeneration();
// This panel is mounted on every DM page (DefaultLayout) so background
// generation survives navigation, but its dropdown data is only read while the
// panel is open. Gate the fetches on that so a closed panel costs no egress.
const panelOpen = () => npcsUi.npcGeneratorOpen;
const { locationOptions } = useLocationTree(panelOpen);
const { data: factions } = useAllFactions(panelOpen);
const { mutateAsync: addFactionNpc } = useAddFactionNpc();
const { data: npcs } = useNpcs(panelOpen);
const { mutateAsync: createConnection } = useCreateConnectionInCampaign();
const { mutateAsync: createKinLink } = useCreateKinLinkInCampaign();
const { data: party } = useParty(panelOpen);
const { data: itemOptions } = useItemIndex(() => ({ enabled: panelOpen() }));
const { mutateAsync: addNpcInventoryItem } = useAddNpcInventoryItemInCampaign();
const toast = useToast();
const { offers } = useGameSystem();
const starterPackQuery = useNpcStarterPacks(panelOpen);
const isCreateFlowPending = ref(false);
const mentionedItemIds = ref<string[]>([]);

const isAiEnabled = computed(() => campaign.isAiEnabled);

const { showQuotaPaywall, canSpend, gateQuotaError } = useGenerationGate("npcs");

const { costOf } = useAiCredits();
const { textCredits, textIsByok, imageProvider, imageCredits, imageIsByok } = useCampaignProviders();

// Null while any part that will be charged has no known price yet.
const effectiveCreditCost = computed<number | null>(() => {
  let cost = 0;
  if (!textIsByok.value) {
    const text = textCredits(costOf("npc_text"));
    if (text === null) return null;
    cost += text;
  }
  if (generateImage.value && !imageIsByok.value) {
    if (imageProvider.value === null) return null;
    const n = generateAlterEgo.value ? 2 : 1;
    const size = PORTRAIT_SIZE_BY_PROVIDER[imageProvider.value];
    // Rounded up PER portrait, then multiplied by count — matches the server,
    // which charges (and records) each portrait as its own whole-credit line
    // rather than rounding a pre-multiplied total (generate-npc/index.ts).
    const perPortrait = imageCredits(costOf("portrait", { size }));
    if (perPortrait === null) return null;
    cost += perPortrait * n;
  }
  return cost;
});

// GenerationCostBadge's own byok flag needs "no credits will be charged at
// all", not just the text provider — an image-only BYOK key still leaves the
// text portion billed, so this is true only when every component in play is
// covered by the DM's own key.
const isFullyByok = computed(() => textIsByok.value && (!generateImage.value || imageIsByok.value));

function dismissToBackground() {
  npcsUi.npcGeneratorOpen = false;
}

function handleClose() {
  npcsUi.npcGeneratorOpen = false;
}

/** The family tie's other ends: the associate, then the second parent, as the prompt names them. */
function kinPromptPeople(): PromptPerson[] {
  const people: PromptPerson[] = [];
  const keys: PersonKey[] = [];
  if (quickForm.related_pc_id) keys.push(personKey("pc", quickForm.related_pc_id));
  else if (quickForm.related_npc_id) keys.push(personKey("npc", quickForm.related_npc_id));
  if (quickForm.related_npc_kin === "child" && quickForm.second_parent) keys.push(quickForm.second_parent);
  for (const key of keys) {
    const { type, id } = parsePersonKey(key);
    const row = type === "npc" ? npcs.value?.find((n) => n.id === id) : party.value?.find((p) => p.id === id);
    if (row) people.push({ name: row.name, bornYear: row.born_year ?? null });
  }
  return people;
}

/**
 * Who the new person is: the species the DM picked, else one rolled from the world's peoples (once per generation, so
 * the prompt and the saved NPC agree). `constraints` are the prompt lines; a roll that lands on "anyone else" has no
 * name and asks for a people the list does not hold. A rolled creature is a people of the world, not an opponent, and
 * the prompt says so. With no peoples set the species is left to the generator. The `race` column stays free text, so
 * a rolled people's name is what is saved.
 */
interface RaceChoice { race: string; constraints: string[] }
function chooseRace(picked: string): RaceChoice {
  if (picked) return { race: picked, constraints: [`Race: ${picked}`] };
  const list = peoples.value;
  if (list.length === 0) return { race: "", constraints: [] };
  const rolled = rollPeople(list);
  if (rolled) {
    const constraints = [`Race: ${rolled.name}`];
    if (rolled.kind === "creature") constraints.push(`This person is a ${rolled.name}, one of the world's peoples, not a monster to fight.`);
    return { race: rolled.name, constraints };
  }
  return { race: "", constraints: [`Race: not one of ${list.map((p) => p.name).join(", ")}; a people this world rarely sees`] };
}

function buildAiContext(selectedLocationId: string | null, items: readonly ItemIndexEntry[], raceConstraints: readonly string[]): string {
  const constraints: string[] = [];
  const location = locationOptions.value.find((loc) => loc.id === selectedLocationId);
  if (quickForm.name.trim()) constraints.push(`Name: ${quickForm.name.trim()}`);
  constraints.push(...raceConstraints);
  if (quickForm.alignment) constraints.push(`Alignment: ${quickForm.alignment}`);
  if (quickForm.relationship) constraints.push(`Party relationship: ${quickForm.relationship}`);
  if (location) constraints.push(`Location: ${location.name}`);
  if (quickForm.faction_id) {
    const faction = factions.value?.find((f) => f.id === quickForm.faction_id);
    if (faction) {
      const typeLabel = faction.faction_type ? ` (${faction.faction_type})` : "";
      constraints.push(`Faction: ${faction.name}${typeLabel}, Role: ${quickForm.faction_role}`);
    }
  }
  const kinPeople = kinPromptPeople();
  if (quickForm.related_npc_kin && kinPeople.length > 0) {
    constraints.push(kinPromptLine(quickForm.related_npc_kin, kinPeople, campaign.todayYear));
  } else if (quickForm.related_npc_id) {
    const npc = npcs.value?.find((n) => n.id === quickForm.related_npc_id);
    if (npc) {
      constraints.push(`Known associate: ${npc.name} (this NPC is ${quickForm.related_npc_tie.word} ${npc.name})`);
    }
  }
  if (items.length) {
    constraints.push(`Starting inventory (include each exact item in this NPC's inventory): ${items.map((item) => item.name).join(", ")}`);
  }
  // Keep variable-length lore behind selected names, relationships and items.
  if (location?.player_summary) constraints.push(`Location summary: ${location.player_summary}`);
  return constraints.join("\n");
}

function mentionedItems(): ItemIndexEntry[] {
  const selected = new Set(mentionedItemIds.value);
  return (itemOptions.value ?? []).filter((item) => selected.has(item.id));
}

function replaceItemTokens(text: string, items: readonly ItemIndexEntry[]): string {
  return items.reduce((result, item) => result.replace(mentionTokenPattern(item.name), (_match, prefix: string) => `${prefix}${item.name}`), text);
}

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

async function generateAndCreate() {
  if (isCreateFlowPending.value) return;
  isCreateFlowPending.value = true;
  try {
    await runGenerateAndCreate();
  } finally {
    isCreateFlowPending.value = false;
  }
}

async function runGenerateAndCreate() {
  if (!canSpend(effectiveCreditCost.value, isFullyByok.value)) return;
  const campaignId = campaign.activeCampaignId;
  if (!campaignId) return;
  const supportsStatBlocks = offers("stat-blocks");
  const calendarId = campaign.activeCampaign?.calendar_id ?? null;
  const customCalendar = campaign.activeCampaign?.custom_calendar ?? null;
  const today = { year: campaign.todayYear, month: campaign.todayMonth, day: campaign.todayDay };
  const locationId = quickForm.location_id ?? locationNamedInStory(concept.value, locationOptions.value)?.id ?? null;
  const inventoryItems = [...mentionedItems()];
  const prompt = replaceItemTokens(concept.value.trim(), inventoryItems);
  const formAtStart = { ...quickForm };
  const raceChoice = chooseRace(formAtStart.race);
  const context = buildAiContext(locationId, inventoryItems, raceChoice.constraints);
  const generateAlterEgoAtStart = generateAlterEgo.value;
  const generateImageAtStart = generateImage.value;
  const associateNpc = formAtStart.related_npc_id
    ? npcs.value?.find((n) => n.id === formAtStart.related_npc_id) ?? null
    : null;
  genConcept.value = concept.value.trim();
  clearCompleted();

  let packs: readonly NpcStarterInventoryPack[];
  try {
    const loaded = await starterPackQuery.refetch();
    if (loaded.isError || !loaded.data) throw loaded.error ?? new Error("Starter inventory packs are unavailable.");
    packs = loaded.data;
  } catch (error: unknown) {
    toast.error(toast.fromError(error, "Couldn't load starter inventory packs. Retry before generating."));
    return;
  }
  if (campaign.activeCampaignId !== campaignId) {
    toast.error("The active campaign changed. Reopen the generator and try again.");
    return;
  }
  const starterPacks = packs.map((pack) => ({ ...pack, cues: [...pack.cues], items: [...pack.items] }));

  const result = await generate(prompt, {
    context,
    generateAlterEgo: generateAlterEgoAtStart,
    generateImage: generateImageAtStart,
  });
  if (!result) return;

  const templateId = formAtStart.templateId === "auto"
    ? (supportsStatBlocks ? npcStarterStatTemplate(result.occupation, result.tags ?? []) : null)
    : formAtStart.templateId;
  const tpl = templateId ? getNpcTemplate(templateId) : null;

  const payload: NpcInsert = {
    name: formAtStart.name.trim() || result.name,
    campaign_id: campaignId,
    race: raceChoice.race || result.race || null,
    alignment: formAtStart.alignment || result.alignment || null,
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
    relationship: formAtStart.relationship || result.relationship,
    portrait_url: result.portrait_url ?? null,
    cutout_url: null,
    portrait_focal_point: null,
    disguise_name: result.disguise_name ?? null,
    disguise_portrait_url: result.disguise_portrait_url ?? null,
    disguise_portrait_focal_point: null,
    is_revealed: false,
    tags: result.tags ?? [],
    stat_block: tpl?.stat_block ?? null,
    location_id: locationId,
    scriptorium_doc_id: null,
    player_visible_to: [],
    player_visible_fields: [],
    ai_provenance: result.ai_provenance ?? null,
  };

  let created;
  try {
    created = await createNpc(payload);
  } catch (e) {
    if (gateQuotaError(e)) return;
    throw e;
  }

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

  const linkErrors = await applyPostCreate(created.id, formAtStart, campaignId, associateNpc);
  if (linkErrors.length) toast.error(`NPC created, but some connections could not be added: ${linkErrors.join("; ")}`);
  try {
    await seedNpcInventory(created.id, { occupation: result.occupation || null, tags: result.tags ?? [] }, inventoryItems, campaignId, starterPacks);
  } catch (error: unknown) {
    // The NPC is already saved. The DM can add items from its inventory tab.
    toast.error(toast.fromError(error, "NPC created, but some starter items could not be added."));
  }

  if (campaign.activeCampaignId === campaignId && npcsUi.npcGeneratorOpen) {
    npcsUi.npcGeneratorOpen = false;
    router.push(`/npcs/${created.id}`);
  } else {
    completedNpcId.value = created.id;
    if (campaign.activeCampaignId !== campaignId) {
      toast.info("NPC created in the campaign where generation started. Switch back to open it.");
    }
  }
}

const concept = ref("");
const generateAlterEgo = ref(false);
const generateImage = ref(true);
const quickForm = reactive<QuickForm>({
  name: "",
  race: "",
  alignment: "",
  relationship: "unknown" as NpcRelationship,
  templateId: "auto",
  location_id: null,
  faction_id: null,
  faction_role: "Member",
  related_npc_id: null,
  related_npc_tie: DEFAULT_ASSOCIATE,
  related_npc_kin: null,
  related_pc_id: null,
  second_parent: null,
});

// "Add relative" opens the generator with the family tie already filled in:
// /npcs?kin=<child|parent|spouse|sibling>&of=<npc:id|pc:id>&also=<npc:id|pc:id>
// (`kin` is what the new NPC is to `of`; `also` is the second parent of a child).
// The query is consumed once, so reopening the panel later starts blank.
watch(
  () => route.query.kin,
  (kin) => {
    if (!isGeneratorKin(kin)) return;
    const of = parseKinQueryKey(route.query.of);
    if (!of) return;
    const also = kin === "child" ? parseKinQueryKey(route.query.also) : null;
    const { type, id } = parsePersonKey(of);
    Object.assign(quickForm, {
      related_npc_id: type === "npc" ? id : null,
      related_pc_id: type === "pc" ? id : null,
      related_npc_kin: kin,
      second_parent: also,
    });
    npcsUi.npcGeneratorOpen = true;
    const { kin: _k, of: _o, also: _a, ...rest } = route.query;
    void router.replace({ query: rest });
  },
  { immediate: true },
);

function onUpdateQuickForm(value: QuickForm) {
  Object.assign(quickForm, value);
}

async function applyPostCreate(
  npcId: string,
  form: QuickForm = quickForm,
  campaignId = campaign.activeCampaignId!,
  associateNpc = npcs.value?.find((n) => n.id === form.related_npc_id) ?? null,
) : Promise<string[]> {
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
  } else if (form.related_npc_id) {
    const other = associateNpc;
    if (!other) {
      errors.push("the selected associate is no longer in this campaign");
      return errors;
    }
    // The new NPC is the subject, and the choice is read from it: "Wren is apprentice of Brenna".
    try {
      await createConnection({ input: {
        subject: { kind: "npc", id: npcId },
        other: { kind: "npc", id: other.id, name: other.name },
        choice: form.related_npc_tie,
      }, campaignId });
    } catch (error: unknown) {
      errors.push(`relationship: ${toast.fromError(error)}`);
    }
  }
  return errors;
}

async function quickCreate() {
  if (isCreateFlowPending.value) return;
  isCreateFlowPending.value = true;
  try {
    await runQuickCreate();
  } finally {
    isCreateFlowPending.value = false;
  }
}

async function runQuickCreate() {
  const campaignId = campaign.activeCampaignId;
  if (!campaignId) return;
  const formAtStart = { ...quickForm };
  const raceChoice = chooseRace(formAtStart.race);
  const associateNpc = formAtStart.related_npc_id
    ? npcs.value?.find((n) => n.id === formAtStart.related_npc_id) ?? null
    : null;
  const tpl = formAtStart.templateId && formAtStart.templateId !== "auto" ? getNpcTemplate(formAtStart.templateId) : null;
  const name = formAtStart.name.trim() || randomName();

  const payload: NpcInsert = {
    name,
    campaign_id: campaignId,
    race: raceChoice.race || null,
    alignment: formAtStart.alignment || null,
    age: null,
    occupation: null,
    appearance: null,
    personality: null,
    voice: null,
    backstory: null,
    notes: concept.value.trim() || null,
    status: "alive",
    relationship: formAtStart.relationship,
    portrait_url: null,
    cutout_url: null,
    portrait_focal_point: null,
    tags: [],
    stat_block: tpl?.stat_block ?? null,
    location_id: formAtStart.location_id,
    scriptorium_doc_id: null,
    disguise_name: null,
    disguise_portrait_url: null,
    disguise_portrait_focal_point: null,
    is_revealed: false,
    player_visible_to: [],
    player_visible_fields: [],
  };

  const created = await createNpc(payload);
  const linkErrors = await applyPostCreate(created.id, formAtStart, campaignId, associateNpc);
  if (linkErrors.length) toast.error(`NPC created, but some connections could not be added: ${linkErrors.join("; ")}`);
  if (campaign.activeCampaignId === campaignId) {
    npcsUi.npcGeneratorOpen = false;
    router.push(`/npcs/${created.id}`);
  } else {
    completedNpcId.value = created.id;
    toast.info("NPC created in the campaign where creation started. Switch back to open it.");
  }
}
</script>
