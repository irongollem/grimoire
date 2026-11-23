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
import { useNpcsUiStore } from "@/stores/ui/npcs";
import { useCreateNpcInCampaign } from "@/composables/npcs/useNpcs";
import { useGenerationGate } from "@/composables/ai/useGenerationGate";
import { useNpcQuote } from "@/composables/ai/quotes/npcQuote";
import { buildNpcAiContext, useGenerateNpc } from "@/composables/npcs/useGenerateNpc";
import { useCampaignPeoples } from "@/composables/canon/useCampaignPeoples";
import { npcSpecies } from "@/lib/canon/npcSpecies";
import { getNpcTemplate } from "@/data/npcTemplates";
import type { NpcInsert, NpcRelationship } from "@/types/npc.types";
import { DEFAULT_ASSOCIATE } from "@/lib/npcGenerator/associate";
import { useParty } from "@/composables/party/useParty";
import { parsePersonKey } from "@/lib/kinship/keys";
import { isGeneratorKin, parseKinQueryKey } from "@/lib/npcGenerator/kinPrompt";
import { useCampaignStore } from "@/stores/campaign";
import { useNpcGeneration } from "@/ai/useNpcGeneration";
import AppButton from "@/components/common/controls/AppButton.vue";
import GeneratorPanelFrame from "@/components/common/ai/GeneratorPanelFrame.vue";
import GenerationCostBadge from "@/components/common/ai/GenerationCostBadge.vue";
import AiOffNotice from "@/components/common/feedback/AiOffNotice.vue";
import PaywallModal from "@/components/common/overlays/PaywallModal.vue";
import { isAnyAiGenerating } from "@/ai/aiGeneratorRegistry";
import { AI_PROMPT_LIMIT } from "@/ai/utils";
import { useLocationTree } from "@/composables/locations/useLocations";
import { useAllFactions } from "@/composables/factions/useFactions";
import { useNpcs } from "@/composables/npcs/useNpcs";
import NpcGeneratorForm from "@/components/npcs/NpcGeneratorForm.vue";
import type { QuickForm } from "@/components/npcs/NpcGeneratorForm.vue";
import { useItemIndex } from "@/composables/items/useItemIndex";
import { locationNamedInStory } from "@/lib/npcGenerator/storyLocation";
import { mentionTokenPattern } from "@/lib/mentionToken";
import type { ItemIndexEntry } from "@/types/item.types";
import { useToast } from "@/composables/useToast";

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
const campaign = useCampaignStore();
const {
  isGenerating,
  error: genError,
  completedEntityId: completedNpcId,
} = useNpcGeneration();
const { generateAndCreateNpc, applyNpcLinks, applyGeneratorLinks } = useGenerateNpc();
const { peoples } = useCampaignPeoples();
// This panel is mounted on every DM page (DefaultLayout) so background
// generation survives navigation, but its dropdown data is only read while the
// panel is open. Gate the fetches on that so a closed panel costs no egress.
const panelOpen = () => npcsUi.npcGeneratorOpen;
const { locationOptions } = useLocationTree(panelOpen);
const { data: factions } = useAllFactions(panelOpen);
const { data: npcs } = useNpcs(panelOpen);
const { data: party } = useParty(panelOpen);
const { data: itemOptions } = useItemIndex(() => ({ enabled: panelOpen() }));
const toast = useToast();
const isCreateFlowPending = ref(false);
const mentionedItemIds = ref<string[]>([]);

const isAiEnabled = computed(() => campaign.isAiEnabled);

const { showQuotaPaywall, canSpend, gateQuotaError } = useGenerationGate("npcs");

const quoteFor = useNpcQuote();

// The price Ask Grimoire quotes for the same run. Null while any part that will be charged has no known price yet.
const quote = computed(() => quoteFor({ portrait: generateImage.value, alterEgo: generateAlterEgo.value }));
const effectiveCreditCost = computed(() => quote.value.total);
// GenerationCostBadge's own byok flag needs "no credits will be charged at all", not just the text provider: an
// image-only BYOK key still leaves the text portion billed.
const isFullyByok = computed(() => quote.value.byok);

function dismissToBackground() {
  npcsUi.npcGeneratorOpen = false;
}

function handleClose() {
  npcsUi.npcGeneratorOpen = false;
}

function aiContext(form: typeof quickForm, raceLines: readonly string[], selectedLocationId: string | null, items: readonly ItemIndexEntry[]): string {
  return buildNpcAiContext(form, selectedLocationId, items, {
    locations: locationOptions.value,
    factions: factions.value ?? [],
    npcs: npcs.value ?? [],
    party: party.value ?? [],
    todayYear: campaign.todayYear,
  }, form.links, raceLines);
}

function mentionedItems(): ItemIndexEntry[] {
  const selected = new Set(mentionedItemIds.value);
  return (itemOptions.value ?? []).filter((item) => selected.has(item.id));
}

function replaceItemTokens(text: string, items: readonly ItemIndexEntry[]): string {
  return items.reduce((result, item) => result.replace(mentionTokenPattern(item.name), (_match, prefix: string) => `${prefix}${item.name}`), text);
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
  // The species the DM picked, else one rolled at the world's shares (#1255 item 30).
  const species = npcSpecies(quickForm.race, peoples.value);
  const formAtStart = { ...quickForm, race: species.race };
  const locationId = formAtStart.location_id ?? locationNamedInStory(concept.value, locationOptions.value)?.id ?? null;
  const inventoryItems = [...mentionedItems()];
  const associate = formAtStart.related_npc_id
    ? npcs.value?.find((n) => n.id === formAtStart.related_npc_id) ?? null
    : null;

  let outcome;
  try {
    outcome = await generateAndCreateNpc({
      concept: concept.value.trim(),
      prompt: replaceItemTokens(concept.value.trim(), inventoryItems),
      context: aiContext(formAtStart, species.lines, locationId, inventoryItems),
      generateAlterEgo: generateAlterEgo.value,
      generateImage: generateImage.value,
      form: formAtStart,
      locationId,
      inventoryItems,
      associate,
      links: formAtStart.links,
    });
  } catch (e) {
    if (gateQuotaError(e)) return;
    throw e;
  }
  // A generation that failed left its message on the shared `genError` ref this panel renders; only what happened
  // before generating has not been said yet.
  if (outcome.stage === "prepare" && outcome.error) toast.error(outcome.error);
  if (!outcome.id) return;
  if (outcome.linkErrors.length) toast.error(`NPC created, but some connections could not be added: ${outcome.linkErrors.join("; ")}`);
  if (outcome.inventoryError) toast.error(outcome.inventoryError);

  if (campaign.activeCampaignId === campaignId && npcsUi.npcGeneratorOpen) {
    npcsUi.npcGeneratorOpen = false;
    router.push(`/npcs/${outcome.id}`);
  } else {
    completedNpcId.value = outcome.id;
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
  also_kin: [],
  links: [],
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
  const formAtStart = { ...quickForm, race: npcSpecies(quickForm.race, peoples.value).race };
  const associateNpc = formAtStart.related_npc_id
    ? npcs.value?.find((n) => n.id === formAtStart.related_npc_id) ?? null
    : null;
  const tpl = formAtStart.templateId && formAtStart.templateId !== "auto" ? getNpcTemplate(formAtStart.templateId) : null;
  const name = formAtStart.name.trim() || randomName();

  const payload: NpcInsert = {
    name,
    campaign_id: campaignId,
    race: formAtStart.race || null,
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
  const linkErrors = [
    ...await applyNpcLinks(created.id, formAtStart, campaignId, associateNpc),
    ...await applyGeneratorLinks({ kind: "npc", id: created.id }, formAtStart.links, campaignId),
  ];
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
