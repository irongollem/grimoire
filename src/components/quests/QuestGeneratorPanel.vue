<template>
  <GeneratorPanelFrame :open="questsUi.questGeneratorOpen" title="Quest Generator" @close="handleClose">
    <!-- Generating state -->
    <div v-if="isGenerating" class="flex flex-col items-center gap-3 py-4">
      <IconGenerate class="h-7 w-7 text-primary animate-pulse" />
      <p class="text-body text-muted-foreground italic text-center">
        {{ currentLoadingQuote }}
      </p>
      <AppButton
        variant="ghost"
        size="inline-caption"
        class="mt-1 underline underline-offset-2"
        label="Continue in background"
        @click="handleClose"
      />
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
        <AppButton
          variant="ghost"
          size="inline-caption"
          class="underline underline-offset-2"
          label="Regenerate"
          @click="clearHooks"
        />
      </div>

      <div
        v-for="(hook, i) in hooks"
        :key="i"
        class="rounded-md border border-border bg-muted/30 p-4 space-y-3"
      >
        <h3 class="text-heading-sm font-semibold text-foreground">{{ hook.title }}</h3>
        <p class="text-caption text-muted-foreground/70 italic">
          <span class="text-label not-italic text-muted-foreground/50 mr-1">PLAYER LOG</span>{{ hook.summary }}
        </p>

        <ul v-if="hook.objectives.length" class="space-y-1">
          <li
            v-for="obj in hook.objectives"
            :key="obj.description"
            class="flex items-start gap-2 text-caption text-muted-foreground"
          >
            <span class="text-primary mt-0.5 shrink-0">•</span>
            <span>{{ obj.description }}</span>
          </li>
        </ul>

        <!-- Story spine preview (#822) — the beats and their order, visible
             before Create rather than discovered afterwards. Deliberately
             compact: a numbered list and a route summary, not a graph
             editor. -->
        <div v-if="spineBeatsByHook[i]?.length" class="space-y-1">
          <p class="text-label text-muted-foreground/60">STORY BEATS</p>
          <ol class="space-y-1">
            <li
              v-for="(beat, bi) in spineBeatsByHook[i]"
              :key="beat.key"
              class="flex items-baseline gap-2 text-caption text-muted-foreground"
            >
              <span class="text-label text-primary shrink-0">{{ bi + 1 }}.</span>
              <span class="flex-1">{{ beat.title }}</span>
              <span class="text-caption-sm text-muted-foreground/50 uppercase shrink-0">{{ beat.kind }}</span>
            </li>
          </ol>
          <p v-if="spineRoutesByHook[i]?.length" class="text-caption-sm text-muted-foreground/50">
            Route: {{ spineRoutesByHook[i].join(", ") }}
          </p>
        </div>

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
            <span class="inline-flex items-center gap-1 text-label-lg font-semibold text-ink-success">
              <IconCheckCircle class="h-3.5 w-3.5" />
              Created
            </span>
            <AppButton
              variant="link"
              size="inline-caption"
              class="hover:underline underline-offset-2"
              label="View Quest →"
              @click="viewCreated(i)"
            />
            <AppButton
              variant="link"
              size="inline-caption"
              class="hover:underline underline-offset-2"
              label="Build flow →"
              @click="buildCreated(i)"
            />
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
          <span class="font-fell normal-case tracking-normal text-muted-foreground/60 ml-1">(optional, AI will use this)</span>
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

    <template v-if="!hooks.length" #footer>
      <GenerationCostBadge
        v-if="isAiEnabled && !hooks.length"
        :credits="textCreditCost"
        :byok="textIsByok"
        class="self-center"
      />
      <AppButton
        v-if="isAiEnabled && !hooks.length"
        variant="primary"
        size="md"
        block
        :icon="IconGenerate"
        :disabled="isAnyAiGenerating"
        :tooltip="
          isAnyAiGenerating && !isGenerating
            ? 'Another generation is already in progress'
            : undefined
        "
        :label="isGenerating ? 'Generating…' : 'Generate Quest Hooks'"
        @click="runGenerate"
      />
      <AiOffNotice v-else-if="!isAiEnabled && !hooks.length" />
    </template>
  </GeneratorPanelFrame>

  <PaywallModal v-model="showQuotaPaywall" resource="quests" />
</template>

<script setup lang="ts">
import { ref, computed } from "vue";
import { AI_PROMPT_LIMIT_SHORT } from "@/ai/utils";

const THEME_LIMIT = AI_PROMPT_LIMIT_SHORT;
import { useRouter } from "vue-router";
import { IconAdd, IconCheckCircle, IconGenerate } from '@/lib/icons';
import { useQuestsUiStore } from "@/stores/ui/quests";
import { useCampaignStore } from "@/stores/campaign";
import { useActiveParty } from "@/composables/party/useActiveParty";
import { useNpcs } from "@/composables/npcs/useNpcs";
import { useAllLocations } from "@/composables/locations/useLocations";
import { useAllFactions } from "@/composables/factions/useFactions";
import { useCreateQuestFromHook } from "@/composables/quests/useCreateQuestFromHook";
import EntityCombobox from "@/components/common/controls/EntityCombobox.vue";
import GeneratedEntityChips from "@/components/common/ai/GeneratedEntityChips.vue";
import AppButton from "@/components/common/controls/AppButton.vue";
import GeneratorPanelFrame from "@/components/common/ai/GeneratorPanelFrame.vue";
import { useQuestGeneration } from "@/ai/useQuestGeneration";
import { currentLoadingQuote } from "@/ai/aiGenerationState";
import { isAnyAiGenerating } from "@/ai/aiGeneratorRegistry";
import GenerationCostBadge from "@/components/common/ai/GenerationCostBadge.vue";
import AiOffNotice from "@/components/common/feedback/AiOffNotice.vue";
import PaywallModal from "@/components/common/overlays/PaywallModal.vue";
import { useAiCredits } from "@/composables/ai/useAiCredits";
import { useGenerationGate } from "@/composables/ai/useGenerationGate";
import { useCampaignProviders } from "@/composables/ai/useCampaignProviders";
import { resolveGeneratedEntities, type ResolvedEntity, ENTITY_KIND_ROUTE } from "@/ai/resolveGeneratedEntities";
import { describeSpineRoutes, planSpineBeats } from "@/lib/quests/spine";
import { useToast } from "@/composables/useToast";
import type { QuestHookResult } from "@/ai/types";

const questsUi = useQuestsUiStore();
const router = useRouter();
const campaign = useCampaignStore();
// Mounted on every DM page — only fetch the dropdown data once the panel opens.
const panelOpen = () => questsUi.questGeneratorOpen;
const { data: party } = useActiveParty(panelOpen);
const { data: npcs } = useNpcs(panelOpen);
const { data: locations } = useAllLocations(panelOpen);
const { data: factions } = useAllFactions(panelOpen);
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

const { createFromHook: createQuestFromHook } = useCreateQuestFromHook();
const toast = useToast();

/** Spine preview data per hook, aligned by index with `hooks` (#822). Reuses
 * the same plan functions the write path uses, so the preview can never show
 * a beat or route that createFromHook would then silently drop. */
const spineBeatsByHook = computed(() => hooks.value.map((hook) => planSpineBeats(hook.beats)));
const spineRoutesByHook = computed(() =>
  spineBeatsByHook.value.map((beats, i) => describeSpineRoutes(beats, hooks.value[i]!.routes)),
);

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

function goToEntity(entity: ResolvedEntity) {
  if (!entity.id) return;
  questsUi.questGeneratorOpen = false;
  router.push(`${ENTITY_KIND_ROUTE[entity.kind]}/${entity.id}`);
}

const { costOf } = useAiCredits();
const { textCredits, textIsByok } = useCampaignProviders();
const textCreditCost = computed(
  () => textCredits(costOf("quest_generation")),
);

const { showQuotaPaywall, canSpend, gateQuotaError } = useGenerationGate("quests");

const partyLevelDisplay = computed(() => {
  const levels = (party.value ?? []).map((m) => m.level);
  if (!levels.length) return "-";
  const avg = Math.ceil(levels.reduce((a, b) => a + b, 0) / levels.length);
  return `${avg} (avg of ${levels.length} member${levels.length !== 1 ? "s" : ""})`;
});

const theme = ref("");

function handleClose() {
  questsUi.questGeneratorOpen = false;
}

async function runGenerate() {
  if (!canSpend(textCreditCost.value, textIsByok.value)) return;

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
    questsUi.questGeneratorOpen = false;
    router.push(`/quests/${id}`);
  }
}

function buildCreated(index: number) {
  const id = createdQuestIds.value[index];
  if (id) {
    questsUi.questGeneratorOpen = false;
    // The overview named outright, rather than forced by writing `dmMode = "prep"`
    // and leaning on prep's default landing — which ended a running session as a
    // side effect of building a generated quest. See #758.
    router.push({ path: `/quests/${id}`, query: { view: "overview" } });
  }
}

// The actual write path — quest, spine beats/edges, objectives split
// pending/dormant by reachability, raise consequences, and resolved
// npc/location refs — lives in useCreateQuestFromHook (#822). It moved out
// of this panel once the spine write logic pushed the file past the 600-line
// soft cap in CLAUDE.md; this component now owns only the preview (see
// spineBeatsByHook/spineRoutesByHook above) and the Create button's own
// pending/created-index bookkeeping.
async function createFromHook(hook: QuestHookResult, index: number) {
  creatingIndex.value = index;
  try {
    const { questId, beatsCreated } = await createQuestFromHook({
      hook,
      giverNpcId: giverNpcId.value,
      locationId: locationId.value,
      entityPools: entityPools.value,
      aiProvenance: provenance.value,
    });
    // #822: no beat is manufactured when the model returned no usable spine —
    // a quest with no beats is a legitimate state, not a failure — but
    // silence would still be worse than either option: the DM asked for a
    // quest and got less than one, and shouldn't have to open Story flow to
    // notice.
    if (beatsCreated === 0) {
      toast.info(
        `"${hook.title}" has no story beats yet. The AI didn't return one. Its objectives are ready; write the beats yourself in Story flow.`,
        8000,
      );
    }
    createdQuestIds.value = { ...createdQuestIds.value, [index]: questId };
    completedEntityId.value = questId;
  } catch (e) {
    if (gateQuotaError(e)) return;
    throw e;
  } finally {
    creatingIndex.value = null;
  }
}
</script>
