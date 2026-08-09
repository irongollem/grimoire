<template>
  <Transition name="fade">
    <div
      v-if="ui.npcGeneratorOpen"
      class="fixed inset-0 bg-black/60 z-40"
      @click="handleClose"
    />
  </Transition>

  <Transition name="slide-right">
    <aside
      v-if="ui.npcGeneratorOpen"
      class="fixed right-0 top-0 bottom-0 w-full max-w-md bg-card border-l border-border z-50 flex flex-col"
    >
      <!-- Header -->
      <div
        class="flex items-center justify-between px-5 py-4 border-b border-border shrink-0"
      >
        <h2 class="text-heading-sm font-semibold text-foreground">
          NPC Generator
        </h2>
        <button
          class="text-muted-foreground hover:text-foreground"
          @click="handleClose"
        >
          <IconClose class="h-5 w-5" />
        </button>
      </div>

      <!-- Body -->
      <div class="flex-1 overflow-y-auto p-5 space-y-5">
        <NpcGeneratorForm
          v-model:concept="concept"
          :quick-form="quickForm"
          @update:quick-form="onUpdateQuickForm"
          v-model:generate-alter-ego="generateAlterEgo"
          v-model:generate-image="generateImage"
          :is-ai-enabled="isAiEnabled"
          :is-generating="isGenerating"
          :gen-error="genError"
          @dismiss-to-background="dismissToBackground"
        />
      </div>

      <!-- Footer -->
      <div
        class="px-5 py-4 border-t border-border flex flex-col gap-2 shrink-0"
      >
        <p
          v-if="effectiveCreditCost > 0 && isPro && isAiEnabled"
          class="text-caption text-center"
          :class="canAfford ? 'text-muted-foreground' : 'text-destructive font-semibold'"
        >{{ creditLine }}</p>
        <button
          v-if="isPro && isAiEnabled"
          type="button"
          :disabled="isAnyAiGenerating || !concept.trim() || (effectiveCreditCost > 0 && !canAfford)"
          :title="
            isAnyAiGenerating && !isGenerating
              ? 'Another generation is already in progress'
              : undefined
          "
          class="w-full inline-flex items-center justify-center gap-1.5 py-2 text-label-lg font-semibold rounded-md bg-primary text-primary-foreground hover:opacity-90 disabled:opacity-50 transition-opacity"
          @click="generateAndCreate"
        >
          <IconGenerate class="h-3.5 w-3.5" />
          {{ isGenerating ? "Generating…" : "Generate with AI" }}
        </button>
        <button
          v-else-if="!isPro"
          type="button"
          class="w-full inline-flex items-center justify-center gap-1.5 py-2 text-label-lg font-semibold rounded-md bg-primary text-primary-foreground hover:opacity-90 transition-opacity"
          @click="showPaywall = true"
        >
          <IconGenerate class="h-3.5 w-3.5" />
          Generate with AI
        </button>
        <button
          type="button"
          :disabled="isCreating"
          class="w-full py-2 text-label-lg font-semibold bg-primary text-primary-foreground rounded-md hover:opacity-90 disabled:opacity-50 transition-opacity"
          @click="quickCreate"
        >
          {{ isCreating ? "Creating…" : "Quick Create NPC" }}
        </button>
      </div>
    </aside>
  </Transition>
  <PaywallModal
    v-model="showPaywall"
    message="AI generation is a Pro feature. Upgrade to generate NPCs, monsters, items, spells, puzzles, and session artwork."
  />
</template>

<script setup lang="ts">
import { ref, reactive, computed } from "vue";
import { useRouter } from "vue-router";
import { IconClose, IconGenerate } from "@/lib/icons";
import { useUiStore } from "@/stores/ui";
import { useCreateNpc } from "@/composables/useNpcs";
import { useImageGenerationLog } from "@/composables/useImageGenerationLog";
import { useAiCredits } from "@/composables/useAiCredits";
import { useProviderConfig, PORTRAIT_SIZE_BY_PROVIDER } from "@/composables/useProviderConfig";
import { getNpcTemplate } from "@/data/npcTemplates";
import type { NpcInsert, NpcRelationship, NpcRelationshipType } from "@/types/npc.types";
import { NPC_RELATIONSHIP_TYPE_LABELS } from "@/types/npc.types";
import { useCampaignStore } from "@/stores/campaign";
import { useNpcGeneration, toTiptapJson } from "@/ai/useNpcGeneration";
import { useSubscription } from "@/composables/useSubscription";
import PaywallModal from "@/components/common/PaywallModal.vue";
import { isAnyAiGenerating } from "@/ai/aiGeneratorRegistry";
import { useLocationTree } from "@/composables/useLocations";
import { useAllFactions, useAddFactionNpc } from "@/composables/useFactions";
import { useNpcs } from "@/composables/useNpcs";
import { useCreateNpcRelation } from "@/composables/useNpcRelations";
import NpcGeneratorForm from "@/components/npcs/NpcGeneratorForm.vue";
import type { QuickForm } from "@/components/npcs/NpcGeneratorForm.vue";

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

const ui = useUiStore();
const router = useRouter();
const { mutateAsync: createNpc, isPending: isCreating } = useCreateNpc();
const { logImageGeneration } = useImageGenerationLog();
const campaign = useCampaignStore();
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
const panelOpen = () => ui.npcGeneratorOpen;
const { locationOptions } = useLocationTree(panelOpen);
const { data: factions } = useAllFactions(panelOpen);
const { mutateAsync: addFactionNpc } = useAddFactionNpc();
const { data: npcs } = useNpcs(panelOpen);
const { mutateAsync: createNpcRelation } = useCreateNpcRelation();

const isAiEnabled = computed(() => campaign.isAiEnabled);
const { isPro } = useSubscription();
const showPaywall = ref(false);

const { costOf, balance, isLoading: creditsLoading } = useAiCredits();
const { textMultiplierFor, imageMultiplierFor } = useProviderConfig();

const textProvider  = computed(() => campaign.activeCampaign?.text_provider  ?? "openai");
const imageProvider = computed(() => campaign.activeCampaign?.image_provider ?? "openai");
const textIsByok    = computed(() => !!campaign.decryptedApiKey);
// BYOK only if THAT provider's own key is present. openai-mini bills against
// the OpenAI key, so it resolves to the same one.
const imageIsByok   = computed(() =>
  imageProvider.value === "gemini" ? !!campaign.decryptedGeminiKey : !!campaign.decryptedOpenAiKey,
);

const effectiveCreditCost = computed(() => {
  let cost = 0;
  if (!textIsByok.value) {
    cost += Math.round(costOf("npc_text") * textMultiplierFor(textProvider.value) * 100) / 100;
  }
  if (generateImage.value && !imageIsByok.value) {
    const n = generateAlterEgo.value ? 2 : 1;
    const size = PORTRAIT_SIZE_BY_PROVIDER[imageProvider.value] ?? PORTRAIT_SIZE_BY_PROVIDER.openai;
    cost += Math.round(costOf("portrait", { size }) * imageMultiplierFor(imageProvider.value) * n * 100) / 100;
  }
  return cost;
});

const canAfford  = computed(() => creditsLoading.value || (balance.value ?? 0) >= effectiveCreditCost.value);
const creditLine = computed(() => {
  const cost = parseFloat(effectiveCreditCost.value.toFixed(2));
  const bal  = parseFloat(((balance.value ?? 0) as number).toFixed(2));
  return `${cost === 1 ? "1 credit" : `${cost} credits`} · Balance: ${bal}`;
});

function dismissToBackground() {
  ui.npcGeneratorOpen = false;
}

function handleClose() {
  ui.npcGeneratorOpen = false;
}

function buildAiPrompt(): string {
  const lines = [concept.value.trim()];
  const constraints: string[] = [];
  if (quickForm.name.trim()) constraints.push(`Name: ${quickForm.name.trim()}`);
  if (quickForm.race) constraints.push(`Race: ${quickForm.race}`);
  if (quickForm.alignment) constraints.push(`Alignment: ${quickForm.alignment}`);
  if (quickForm.relationship) constraints.push(`Party relationship: ${quickForm.relationship}`);
  if (quickForm.location_id) {
    const loc = locationOptions.value.find((l) => l.id === quickForm.location_id);
    if (loc) {
      constraints.push(`Location: ${loc.name}`);
      if (loc.player_summary) constraints.push(`locationSummary: ${loc.player_summary}`);
    }
  }
  if (quickForm.faction_id) {
    const faction = factions.value?.find((f) => f.id === quickForm.faction_id);
    if (faction) {
      const typeLabel = faction.faction_type ? ` (${faction.faction_type})` : "";
      constraints.push(`Faction: ${faction.name}${typeLabel}, Role: ${quickForm.faction_role}`);
    }
  }
  if (quickForm.related_npc_id) {
    const npc = npcs.value?.find((n) => n.id === quickForm.related_npc_id);
    if (npc) {
      const relLabel = NPC_RELATIONSHIP_TYPE_LABELS[quickForm.related_npc_relationship];
      constraints.push(`Known associate: ${npc.name} (${relLabel})`);
    }
  }
  if (constraints.length) {
    lines.push("\nUse these constraints (override only if the concept explicitly conflicts):");
    lines.push(constraints.join("\n"));
  }
  return lines.join("\n");
}

async function generateAndCreate() {
  genConcept.value = concept.value.trim();
  clearCompleted();

  const result = await generate(buildAiPrompt(), {
    generateAlterEgo: generateAlterEgo.value,
    generateImage: generateImage.value,
  });
  if (!result) return;

  const tpl = quickForm.templateId ? getNpcTemplate(quickForm.templateId) : null;

  const payload: NpcInsert = {
    name: quickForm.name.trim() || result.name,
    campaign_id: campaign.activeCampaignId,
    race: quickForm.race || result.race || null,
    alignment: quickForm.alignment || result.alignment || null,
    age: result.age || null,
    occupation: result.occupation || null,
    appearance: result.appearance ? toTiptapJson(result.appearance) : null,
    personality: result.personality ? toTiptapJson(result.personality) : null,
    backstory: result.backstory ? toTiptapJson(result.backstory) : null,
    notes: result.notes ? toTiptapJson(result.notes) : null,
    status: result.status,
    relationship: quickForm.relationship || result.relationship,
    portrait_url: result.portrait_url ?? null,
    portrait_focal_point: null,
    disguise_name: result.disguise_name ?? null,
    disguise_portrait_url: result.disguise_portrait_url ?? null,
    disguise_portrait_focal_point: null,
    is_revealed: false,
    tags: result.tags ?? [],
    stat_block: tpl?.stat_block ?? null,
    location_id: quickForm.location_id,
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
      targetId: created.id, targetColumn: "portrait_url",
    });
  }
  if (result.disguise_portrait_url) {
    void logImageGeneration({
      kind: "npc_portrait", imageUrl: result.disguise_portrait_url, prompt: result.disguise_name ?? genConcept.value,
      targetId: created.id, targetColumn: "disguise_portrait_url",
    });
  }

  await applyPostCreate(created.id);

  if (ui.npcGeneratorOpen) {
    ui.npcGeneratorOpen = false;
    router.push(`/npcs/${created.id}`);
  } else {
    completedNpcId.value = created.id;
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
  templateId: "",
  location_id: null,
  faction_id: null,
  faction_role: "Member",
  related_npc_id: null,
  related_npc_relationship: "contact" as NpcRelationshipType,
});

function onUpdateQuickForm(value: QuickForm) {
  Object.assign(quickForm, value);
}

async function applyPostCreate(npcId: string) {
  if (quickForm.faction_id) {
    await addFactionNpc({
      faction_id: quickForm.faction_id,
      npc_id: npcId,
      role: quickForm.faction_role,
    });
  }
  if (quickForm.related_npc_id) {
    await createNpcRelation({
      npc_id: npcId,
      related_npc_id: quickForm.related_npc_id,
      relationship_type: quickForm.related_npc_relationship,
      notes: null,
    });
  }
}

async function quickCreate() {
  const tpl = quickForm.templateId ? getNpcTemplate(quickForm.templateId) : null;
  const name = quickForm.name.trim() || randomName();

  const payload: NpcInsert = {
    name,
    campaign_id: campaign.activeCampaignId,
    race: quickForm.race || null,
    alignment: quickForm.alignment || null,
    age: null,
    occupation: null,
    appearance: null,
    personality: null,
    backstory: null,
    notes: concept.value.trim() || null,
    status: "alive",
    relationship: quickForm.relationship,
    portrait_url: null,
    portrait_focal_point: null,
    tags: [],
    stat_block: tpl?.stat_block ?? null,
    location_id: quickForm.location_id,
    scriptorium_doc_id: null,
    disguise_name: null,
    disguise_portrait_url: null,
    disguise_portrait_focal_point: null,
    is_revealed: false,
    player_visible_to: [],
    player_visible_fields: [],
  };

  const created = await createNpc(payload);
  await applyPostCreate(created.id);
  ui.npcGeneratorOpen = false;
  router.push(`/npcs/${created.id}`);
}
</script>

<style scoped>
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.2s ease;
}
.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
.slide-right-enter-active,
.slide-right-leave-active {
  transition: transform 0.25s ease;
}
.slide-right-enter-from,
.slide-right-leave-to {
  transform: translateX(100%);
}
</style>
