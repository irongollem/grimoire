<template>
  <Transition name="fade">
    <div
      v-if="ui.questGeneratorOpen"
      class="fixed inset-0 bg-black/60 z-40"
      @click="handleClose"
    />
  </Transition>

  <Transition name="slide-right">
    <aside
      v-if="ui.questGeneratorOpen"
      class="fixed right-0 top-0 bottom-0 w-full max-w-md bg-card border-l border-border z-50 flex flex-col"
    >
      <!-- Header -->
      <div class="flex items-center justify-between px-5 py-4 border-b border-border shrink-0">
        <h2 class="text-heading-sm font-semibold text-foreground">Quest Generator</h2>
        <AppButton variant="ghost" size="inline-xs" tooltip="Close" aria-label="Close" :icon="IconClose" icon-size="lg" @click="handleClose" />
      </div>

      <!-- Body -->
      <div class="flex-1 overflow-y-auto p-5 space-y-5">
        <!-- Generating state -->
        <div v-if="isGenerating" class="flex flex-col items-center gap-3 py-4">
          <IconGenerate class="h-7 w-7 text-primary animate-pulse" />
          <p class="text-body text-muted-foreground italic text-center">
            {{ currentLoadingQuote }}
          </p>
          <button
            type="button"
            class="mt-1 text-caption text-muted-foreground hover:text-foreground underline underline-offset-2 transition-colors"
            @click="dismissToBackground"
          >
            Continue in background
          </button>
        </div>

        <!-- Error state -->
        <div
          v-else-if="genError"
          class="rounded-md bg-destructive/10 border border-destructive/30 px-3 py-2"
        >
          <p class="text-caption text-destructive">{{ genError }}</p>
        </div>

        <!-- Results state -->
        <template v-else-if="hooks.length > 0">
          <div class="flex items-center justify-between">
            <p class="text-label-lg font-semibold text-muted-foreground">
              GENERATED HOOKS
            </p>
            <button
              type="button"
              class="text-caption text-muted-foreground hover:text-foreground underline underline-offset-2 transition-colors"
              @click="clearHooks"
            >
              Regenerate
            </button>
          </div>

          <div
            v-for="(hook, i) in hooks"
            :key="i"
            class="rounded-md border border-border bg-muted/30 p-4 space-y-3"
          >
            <h3 class="font-cinzel text-sm font-semibold text-foreground">{{ hook.title }}</h3>
            <p class="text-caption text-muted-foreground/70 italic">
              <span class="text-label not-italic text-muted-foreground/50 mr-1">PLAYER LOG</span>{{ hook.summary }}
            </p>

            <ul v-if="hook.objectives.length" class="space-y-1">
              <li
                v-for="obj in hook.objectives"
                :key="obj"
                class="flex items-start gap-2 text-caption text-muted-foreground"
              >
                <span class="text-primary mt-0.5 shrink-0">•</span>
                <span>{{ obj }}</span>
              </li>
            </ul>

            <div v-if="hook.tags.length" class="flex flex-wrap gap-1.5">
              <span
                v-for="tag in hook.tags"
                :key="tag"
                class="rounded-full bg-muted border border-border px-2 py-0.5 text-caption-sm text-muted-foreground"
              >
                {{ tag }}
              </span>
            </div>

            <GeneratedEntityChips
              :entities="resolvedEntitiesByHook[i] ?? []"
              @navigate="goToEntity"
            />

            <div class="flex items-center gap-2 flex-wrap">
              <AppButton
                v-if="!createdQuestIds[i]"
                variant="primary"
                size="sm"
                :icon="IconAdd"
                :disabled="creatingIndex === i"
                :label="creatingIndex === i ? 'Creating…' : 'Create Quest'"
                @click="createFromHook(hook, i)"
              />
              <template v-else>
                <span class="inline-flex items-center gap-1 font-cinzel text-xs font-semibold text-emerald-500">
                  <IconCheckCircle class="h-3.5 w-3.5" />
                  Created
                </span>
                <button
                  type="button"
                  class="text-caption text-primary hover:underline underline-offset-2 transition-colors"
                  @click="viewCreated(i)"
                >
                  View Quest →
                </button>
                <button
                  type="button"
                  class="text-caption text-primary hover:underline underline-offset-2 transition-colors"
                  @click="buildCreated(i)"
                >
                  Build flow →
                </button>
              </template>
            </div>
          </div>
        </template>

        <!-- Form state -->
        <template v-else>
          <!-- Party level -->
          <div class="flex items-center gap-3">
            <span class="text-label-lg font-semibold text-muted-foreground">
              PARTY LEVEL
            </span>
            <span class="text-body text-foreground font-semibold">
              {{ partyLevelDisplay }}
            </span>
          </div>

          <div class="gold-divider" />

          <!-- Quest Giver -->
          <div>
            <label class="block text-label-lg font-semibold text-muted-foreground mb-1.5">
              QUEST GIVER
              <span class="font-fell normal-case tracking-normal text-muted-foreground/60 ml-1">(optional)</span>
            </label>
            <EntityCombobox
              v-model="giverNpcId"
              :options="npcs ?? []"
              placeholder="Search NPCs…"
            />
          </div>

          <!-- Location -->
          <div>
            <label class="block text-label-lg font-semibold text-muted-foreground mb-1.5">
              LOCATION
              <span class="font-fell normal-case tracking-normal text-muted-foreground/60 ml-1">(optional)</span>
            </label>
            <EntityCombobox
              v-model="locationId"
              :options="locations ?? []"
              placeholder="Search locations…"
            />
          </div>

          <div class="gold-divider" />

          <!-- Theme -->
          <div>
            <label class="block text-label-lg font-semibold text-muted-foreground mb-1.5">
              THEME
              <span class="font-fell normal-case tracking-normal text-muted-foreground/60 ml-1">(optional — AI will use this)</span>
            </label>
            <textarea
              v-model="theme"
              rows="3"
              :maxlength="THEME_LIMIT"
              placeholder="A dragon cult terrorising trade routes along the northern pass…"
              class="w-full bg-muted border border-border rounded-md px-3 py-2 text-body text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring resize-none"
            />
            <div class="flex justify-end mt-1">
              <span
                class="text-caption"
                :class="theme.length >= THEME_LIMIT * 0.9 ? 'text-destructive' : 'text-muted-foreground/50'"
              >{{ theme.length }} / {{ THEME_LIMIT }}</span>
            </div>
          </div>

        </template>
      </div>

      <!-- Footer -->
      <div class="px-5 py-4 border-t border-border shrink-0 flex flex-col gap-2">
        <GenerationCostBadge
          v-if="isPro && isAiEnabled && !hooks.length"
          :credits="textCreditCost"
          :byok="textIsByok"
          class="self-center"
        />
        <AppButton
          v-if="isPro && isAiEnabled && !hooks.length"
          variant="primary"
          size="md"
          block
          :icon="IconGenerate"
          :disabled="isAnyAiGenerating || !affordable(textCreditCost, textIsByok)"
          :tooltip="
            isAnyAiGenerating && !isGenerating
              ? 'Another generation is already in progress'
              : undefined
          "
          :label="isGenerating ? 'Generating…' : 'Generate Quest Hooks'"
          @click="runGenerate"
        />
        <AppButton
          v-else-if="!isPro"
          variant="primary"
          size="md"
          block
          :icon="IconGenerate"
          label="Generate Quest Hooks"
          @click="showPaywall = true"
        />
      </div>
    </aside>
  </Transition>

  <PaywallModal
    v-model="showPaywall"
    message="AI generation is a Pro feature. Upgrade to generate NPCs, monsters, items, spells, puzzles, and quests."
  />
</template>

<script setup lang="ts">
import { ref, computed } from "vue";
import { AI_PROMPT_LIMIT_SHORT } from "@/ai/utils";

const THEME_LIMIT = AI_PROMPT_LIMIT_SHORT;
import { useRouter } from "vue-router";
import { IconAdd, IconCheckCircle, IconClose, IconGenerate } from '@/lib/icons';
import { useUiStore } from "@/stores/ui";
import { useCampaignStore } from "@/stores/campaign";
import { useParty } from "@/composables/useParty";
import { useNpcs } from "@/composables/useNpcs";
import { useAllLocations } from "@/composables/useLocations";
import { useAllFactions } from "@/composables/useFactions";
import { useCreateQuest, useCreateObjective, useCreateQuestRef } from "@/composables/useQuests";
import EntityCombobox from "@/components/common/EntityCombobox.vue";
import GeneratedEntityChips from "@/components/common/GeneratedEntityChips.vue";
import AppButton from "@/components/common/AppButton.vue";
import { useQuestGeneration } from "@/ai/useQuestGeneration";
import { toTiptapJson } from "@/ai/useNpcGeneration";
import { useSubscription } from "@/composables/useSubscription";
import { currentLoadingQuote } from "@/ai/aiGenerationState";
import { isAnyAiGenerating } from "@/ai/aiGeneratorRegistry";
import PaywallModal from "@/components/common/PaywallModal.vue";
import GenerationCostBadge from "@/components/common/GenerationCostBadge.vue";
import { useAiCredits } from "@/composables/useAiCredits";
import { useProviderConfig } from "@/composables/useProviderConfig";
import { resolveGeneratedEntities, type ResolvedEntity } from "@/ai/resolveGeneratedEntities";
import type { QuestHookResult } from "@/ai/types";

const ui = useUiStore();
const router = useRouter();
const campaign = useCampaignStore();
// Mounted on every DM page — only fetch the dropdown data once the panel opens.
const panelOpen = () => ui.questGeneratorOpen;
const { data: party } = useParty(panelOpen);
const { data: npcs } = useNpcs(panelOpen);
const { data: locations } = useAllLocations(panelOpen);
const { data: factions } = useAllFactions(panelOpen);
const { isPro } = useSubscription();
const showPaywall = ref(false);
const creatingIndex = ref<number | null>(null);
const createdQuestIds = ref<Record<number, string>>({});

const giverNpcId = ref("");
const locationId = ref("");

const {
  isGenerating,
  error: genError,
  concept: genConcept,
  completedEntityId,
  clearCompleted,
  hooks,
  provenance,
  generate,
  clearHooks,
} = useQuestGeneration();

const { mutateAsync: createQuest } = useCreateQuest();
const { mutateAsync: createObjective } = useCreateObjective();
const { mutateAsync: createQuestRef } = useCreateQuestRef();

const isAiEnabled = computed(() => campaign.isAiEnabled);

// Same pools the comboboxes above already fetch — resolveGeneratedEntities
// just needs the {id, name} shape.
const entityPools = computed(() => ({
  npcs: (npcs.value ?? []).map((n) => ({ id: n.id, name: n.name })),
  locations: (locations.value ?? []).map((l) => ({ id: l.id, name: l.name })),
  factions: (factions.value ?? []).map((f) => ({ id: f.id, name: f.name })),
}));

/** Chip data per hook, aligned by index with `hooks`. */
const resolvedEntitiesByHook = computed<ResolvedEntity[][]>(() =>
  hooks.value.map((hook) => resolveGeneratedEntities(hook, entityPools.value)),
);

const ENTITY_CHIP_ROUTE: Record<ResolvedEntity["kind"], string> = {
  npc: "/npcs",
  location: "/locations",
  faction: "/factions",
};

function goToEntity(entity: ResolvedEntity) {
  if (!entity.id) return;
  ui.questGeneratorOpen = false;
  router.push(`${ENTITY_CHIP_ROUTE[entity.kind]}/${entity.id}`);
}

const { costOf, affordable } = useAiCredits();
const { textMultiplierFor } = useProviderConfig();
const textProvider = computed(() => campaign.activeCampaign?.text_provider ?? "openai");
const textIsByok = computed(() => !!campaign.decryptedApiKey);
const textCreditCost = computed(
  () => Math.round(costOf("quest_generation") * textMultiplierFor(textProvider.value) * 100) / 100,
);

const partyLevelDisplay = computed(() => {
  const levels = (party.value ?? []).map((m) => m.level);
  if (!levels.length) return "—";
  const avg = Math.ceil(levels.reduce((a, b) => a + b, 0) / levels.length);
  return `${avg} (avg of ${levels.length} member${levels.length !== 1 ? "s" : ""})`;
});

const theme = ref("");

function handleClose() {
  ui.questGeneratorOpen = false;
}

function dismissToBackground() {
  ui.questGeneratorOpen = false;
}

async function runGenerate() {
  const levels = (party.value ?? []).map((m) => m.level);
  const avgLevel = levels.length
    ? Math.ceil(levels.reduce((a, b) => a + b, 0) / levels.length)
    : 1;

  const lines: string[] = [`Party level: ${avgLevel}`];

  const npc = giverNpcId.value ? (npcs.value ?? []).find((n) => n.id === giverNpcId.value) : null;
  const loc = locationId.value ? (locations.value ?? []).find((l) => l.id === locationId.value) : null;

  const constraints: string[] = [];
  if (npc) {
    const detail = [npc.occupation, npc.relationship].filter(Boolean).join(", ");
    constraints.push(`Quest Giver: ${npc.name}${detail ? ` (${detail})` : ""}`);
  }
  if (loc) constraints.push(`Location: ${loc.name}`);

  if (constraints.length) {
    lines.push(
      "\nUse these constraints for all 5 hooks (the quest giver and location are already set — weave them naturally into the hook descriptions and discovery objectives):",
    );
    lines.push(constraints.join("\n"));
  }

  if (theme.value.trim()) lines.push(`\nTheme: ${theme.value.trim()}`);

  genConcept.value = theme.value.trim() || `Level ${avgLevel} quest hooks`;
  clearCompleted();
  createdQuestIds.value = {};
  await generate(lines.join("\n"));
}

function viewCreated(index: number) {
  const id = createdQuestIds.value[index];
  if (id) {
    ui.questGeneratorOpen = false;
    router.push(`/quests/${id}`);
  }
}

function buildCreated(index: number) {
  const id = createdQuestIds.value[index];
  if (id) {
    ui.questGeneratorOpen = false;
    ui.dmMode = "prep";
    router.push(`/quests/${id}`);
  }
}

async function createFromHook(hook: QuestHookResult, index: number) {
  creatingIndex.value = index;
  try {
    const quest = await createQuest({
      title: hook.title,
      summary: hook.summary,
      description: hook.hook_description ? toTiptapJson(hook.hook_description) : null,
      tags: hook.tags,
      status: "active",
      giver_npc_id: giverNpcId.value || null,
      location_id: locationId.value || null,
      parent_quest_id: null,
      rewards: null,
      reward_pp: 0,
      reward_gp: 0,
      reward_ep: 0,
      reward_sp: 0,
      reward_cp: 0,
      reward_item_ids: [],
      reward_currency_pools: [],
      notes: null,
      player_visible_to: [],
      started_at: null,
      resolved_at: null,
      ai_provenance: provenance.value,
    });

    await Promise.all(
      hook.objectives.map((desc, i) =>
        createObjective({
          quest_id: quest.id,
          description: desc,
          status: "pending" as const,
          is_player_visible: false,
          sort_order: i,
        }),
      ),
    );

    // Resolved npcs/locations become quest_refs so they show up in Key NPCs /
    // Key Locations on the quest detail page — but skip the giver/location,
    // which are already first-class FK columns on the quest row, and never
    // ref a faction: QuestRefType (quest.types.ts) has no "faction" member,
    // so a resolved faction stays chip-only in this panel.
    const refTargets = resolveGeneratedEntities(hook, entityPools.value).filter(
      (e): e is ResolvedEntity & { kind: "npc" | "location"; id: string } =>
        e.id !== null &&
        (e.kind === "npc" || e.kind === "location") &&
        !(e.kind === "npc" && e.id === giverNpcId.value) &&
        !(e.kind === "location" && e.id === locationId.value),
    );

    // Best-effort like the objectives above, but explicitly tolerant of
    // per-ref failure: a lost cross-reference chip is fine, an undone quest
    // creation is not.
    await Promise.allSettled(
      refTargets.map((e) =>
        createQuestRef({
          quest_id: quest.id,
          ref_type: e.kind,
          ref_id: e.id,
          is_player_visible: false,
        }),
      ),
    );

    createdQuestIds.value = { ...createdQuestIds.value, [index]: quest.id };
    completedEntityId.value = quest.id;
  } finally {
    creatingIndex.value = null;
  }
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
