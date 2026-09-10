<template>
  <section class="space-y-5">
    <p v-if="isPro && !isAiEnabled" class="text-body text-muted-foreground">
      AI is off for this campaign.
    </p>

    <template v-else>
      <div class="grid gap-5 lg:grid-cols-2 lg:items-start">
        <!-- Left — the conversation -->
        <div class="space-y-4">
          <template v-if="turn === 0">
            <div>
              <h3 class="font-cinzel text-sm font-semibold text-foreground">Describe the quest</h3>
              <textarea
                v-model="prose"
                rows="8"
                :maxlength="QUEST_DESIGN_PROSE_LIMIT"
                placeholder="What the quest is, the stages you see, where it might fork. Use your own names."
                class="mt-2 w-full resize-none rounded-md border border-border bg-muted px-3 py-2 text-body text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
              />
              <div class="mt-1 flex justify-end">
                <span
                  class="text-caption"
                  :class="prose.length >= QUEST_DESIGN_PROSE_LIMIT * 0.9 ? 'text-destructive' : 'text-muted-foreground/50'"
                >{{ prose.length }} / {{ QUEST_DESIGN_PROSE_LIMIT }}</span>
              </div>
            </div>

            <div class="flex flex-wrap items-center justify-between gap-2">
              <div class="space-y-0.5">
                <GenerationCostBadge :credits="textCreditCost" :byok="textIsByok" />
                <p class="text-caption text-muted-foreground/70">
                  1 credit per exchange · up to {{ QUEST_DESIGN_TURN_BUDGET }} exchanges in a sitting
                </p>
              </div>
            </div>

            <AppButton
              v-if="isPro"
              variant="primary"
              size="md"
              block
              :icon="IconGenerate"
              :disabled="proposeDisabled"
              :label="isGenerating ? 'Proposing…' : 'Propose a tree'"
              @click="onPropose"
            />
            <AppButton
              v-else
              variant="primary"
              size="md"
              block
              :icon="IconGenerate"
              label="Propose a tree"
              @click="showPaywall = true"
            />
          </template>

          <template v-else>
            <div class="space-y-1.5 rounded-md border border-border/60 bg-muted/30 p-3">
              <blockquote class="text-body italic text-muted-foreground">{{ prose }}</blockquote>
              <AppButton
                variant="link"
                size="inline-caption"
                class="underline underline-offset-2"
                label="Edit"
                @click="onEdit"
              />
            </div>

            <p v-if="note" class="text-caption text-muted-foreground">{{ note }}</p>

            <template v-if="questions.length">
              <QuestDesignQuestionCard
                v-for="question in questions"
                :key="question.key"
                :question="question"
                :about-title="aboutTitleFor(question)"
                @update:selection="(selection) => onSelection(question.key, selection)"
              />
            </template>
            <p v-else class="text-caption text-muted-foreground">
              No open questions — the tree is settled.
            </p>

            <label class="grid gap-1.5">
              <span class="text-label-lg font-semibold text-muted-foreground">
                Anything else to tell it? <span class="font-normal">(optional)</span>
              </span>
              <AppInput v-model="noteText" placeholder="A detail, a correction, a new twist…" />
            </label>

            <div class="flex flex-wrap items-center justify-between gap-2">
              <AppButton
                variant="primary"
                size="md"
                :disabled="!canSend"
                :label="isGenerating ? 'Sending…' : 'Send answers'"
                @click="onSendAnswers"
              />
              <span class="text-caption text-muted-foreground/70">
                Exchange {{ turn }} of {{ QUEST_DESIGN_TURN_BUDGET }} · {{ creditsSoFar }} credits so far
              </span>
            </div>
          </template>

          <p v-if="error" role="alert" class="rounded-md border border-destructive/40 p-2 text-caption text-destructive">
            {{ error }}
          </p>
        </div>

        <!-- Right — the tree -->
        <div>
          <QuestDesignTreePreview
            v-if="tree && diff"
            :tree="tree"
            :diff="diff"
            :entities="resolvedEntities"
            @navigate="goToEntity"
          />
          <div
            v-else
            class="flex min-h-40 items-center justify-center rounded-xl border border-dashed border-border p-6 text-center lg:sticky lg:top-4"
          >
            <p class="text-body text-muted-foreground">Your tree appears here.</p>
          </div>
        </div>
      </div>

      <div class="flex flex-wrap items-start justify-between gap-3 border-t border-border pt-4">
        <div>
          <AppButton
            variant="primary"
            size="md"
            :disabled="!tree || creating"
            :label="creating ? 'Creating…' : 'Create quest'"
            @click="onCreate"
          />
          <p v-if="tree && questions.length" class="mt-1 text-caption text-muted-foreground/70">
            You can create now and finish the rest in the story flow.
          </p>
        </div>
        <AppButton
          variant="link"
          size="inline-caption"
          class="underline underline-offset-2"
          label="Start over"
          @click="onStartOver"
        />
      </div>
    </template>
  </section>

  <PaywallModal
    v-model="showPaywall"
    message="AI generation is a Pro feature. Upgrade to generate NPCs, monsters, items, spells, puzzles, and quests."
  />
</template>

<script setup lang="ts">
/**
 * The Design it flow (#873) — a third way to start a quest, beside typing one
 * and pasting a page (QuestFlowStarter.vue). A multi-turn conversation with
 * the quest-designer model: the DM describes the quest in prose, the model
 * proposes a beat tree and asks up to three questions per turn where the
 * prose left a fork genuinely ambiguous, and the DM answers until the tree is
 * settled or the ten-exchange budget runs out. Every turn's tree is rendered
 * through the same pure plan functions (src/lib/quests/spine.ts) the actual
 * write path uses, so the preview can never promise a beat, route or
 * objective status that Create quest would then not deliver.
 *
 * The wire protocol, the composable (useQuestDesigner) and the write path
 * (useCreateQuestFromHook, extended with parentQuestId) are owned by other
 * executors on this epic — this component only consumes their declared
 * surface.
 */
import { computed, ref } from "vue";
import { useRouter } from "vue-router";
import { useCampaignStore } from "@/stores/campaign";
import { useSubscription } from "@/composables/billing/useSubscription";
import { useNpcs } from "@/composables/npcs/useNpcs";
import { useAllLocations } from "@/composables/locations/useLocations";
import { useAllFactions } from "@/composables/factions/useFactions";
import { useCreateQuestFromHook } from "@/composables/quests/useCreateQuestFromHook";
import { useAiCredits } from "@/composables/ai/useAiCredits";
import { useProviderConfig } from "@/composables/ai/useProviderConfig";
import { useConfirm } from "@/composables/useConfirm";
import { useToast } from "@/composables/useToast";
import { resolveGeneratedEntities, type EntityPools, type ResolvedEntity, ENTITY_KIND_ROUTE } from "@/ai/resolveGeneratedEntities";
import { planSpineBeats } from "@/lib/quests/spine";
import { useQuestDesigner } from "@/ai/useQuestDesigner";
import {
  QUEST_DESIGN_PROSE_LIMIT,
  QUEST_DESIGN_TURN_BUDGET,
  diffDesignTrees,
  toDesignAnswer,
  type QuestDesignAnswer,
  type QuestDesignDiff,
  type QuestDesignQuestion,
} from "@/lib/quests/designer";
import AppButton from "@/components/common/AppButton.vue";
import AppInput from "@/components/common/AppInput.vue";
import GenerationCostBadge from "@/components/common/GenerationCostBadge.vue";
import PaywallModal from "@/components/common/PaywallModal.vue";
import QuestDesignQuestionCard from "./QuestDesignQuestionCard.vue";
import QuestDesignTreePreview from "./QuestDesignTreePreview.vue";
import { IconGenerate } from "@/lib/icons";

const { parentId = null } = defineProps<{ parentId?: string | null }>();

const router = useRouter();
const campaign = useCampaignStore();
const { isPro } = useSubscription();
const { data: npcs } = useNpcs();
const { data: locations } = useAllLocations();
const { data: factions } = useAllFactions();
const { createFromHook } = useCreateQuestFromHook();
const { costOf, affordable } = useAiCredits();
const { textMultiplierFor } = useProviderConfig();
const { confirm } = useConfirm();
const toast = useToast();

const {
  prose,
  tree,
  previousTree,
  questions,
  note,
  turn,
  turnsLeft,
  provenance,
  isGenerating,
  error,
  propose,
  answer,
  reset,
} = useQuestDesigner();

const showPaywall = ref(false);
const creating = ref(false);
const noteText = ref("");
const selections = ref<Record<string, { optionKey: string | null; freeText: string }>>({});

const isAiEnabled = computed(() => campaign.isAiEnabled);
const textIsByok = computed(() => !!campaign.decryptedApiKey);
const textProvider = computed(() => campaign.activeCampaign?.text_provider ?? "openai");
const textCreditCost = computed(
  () => Math.round(costOf("quest_design_turn") * textMultiplierFor(textProvider.value) * 100) / 100,
);
const creditsSoFar = computed(() => Math.round(turn.value * textCreditCost.value * 100) / 100);

const proposeDisabled = computed(
  () => isGenerating.value || prose.value.trim().length === 0 || !affordable(textCreditCost.value, textIsByok.value),
);

const hasAnyAnswer = computed(() => {
  const anyQuestionAnswered = questions.value.some((question) => {
    const selection = selections.value[question.key];
    return !!selection && (selection.optionKey !== null || selection.freeText.trim().length > 0);
  });
  return anyQuestionAnswered || noteText.value.trim().length > 0;
});
const canSend = computed(() => hasAnyAnswer.value && turnsLeft.value > 0 && !isGenerating.value);

const beatTitleByKey = computed(() => new Map(planSpineBeats(tree.value?.beats).map((beat) => [beat.key, beat.title])));
function aboutTitleFor(question: QuestDesignQuestion): string | null {
  if (!question.about) return null;
  return beatTitleByKey.value.get(question.about) ?? null;
}

function onSelection(key: string, selection: { optionKey: string | null; freeText: string }) {
  selections.value = { ...selections.value, [key]: selection };
}

const diff = computed<QuestDesignDiff | null>(() =>
  tree.value ? diffDesignTrees(previousTree.value, tree.value) : null,
);

// Same pools the write path needs — resolveGeneratedEntities and
// createFromHook both just want the {id, name} shape.
const entityPools = computed<EntityPools>(() => ({
  npcs: (npcs.value ?? []).map((n) => ({ id: n.id, name: n.name })),
  locations: (locations.value ?? []).map((l) => ({ id: l.id, name: l.name })),
  factions: (factions.value ?? []).map((f) => ({ id: f.id, name: f.name })),
}));

const resolvedEntities = computed<ResolvedEntity[]>(() =>
  tree.value ? resolveGeneratedEntities(tree.value, entityPools.value) : [],
);

function goToEntity(entity: ResolvedEntity) {
  if (!entity.id) return;
  router.push(`${ENTITY_KIND_ROUTE[entity.kind]}/${entity.id}`);
}

async function onPropose() {
  await propose();
}

async function onSendAnswers() {
  if (!canSend.value) return;
  const newAnswers: QuestDesignAnswer[] = [];
  for (const question of questions.value) {
    const selection = selections.value[question.key];
    if (!selection) continue;
    const built = toDesignAnswer(question, selection);
    if (built) newAnswers.push(built);
  }
  const trimmedNote = noteText.value.trim();
  if (trimmedNote) {
    newAnswers.push({ question_key: "note", question: "Anything else to tell it?", answer: trimmedNote });
  }
  if (!newAnswers.length) return;
  selections.value = {};
  noteText.value = "";
  await answer(newAnswers);
}

async function onEdit() {
  const ok = await confirm(
    "Editing the prose starts over — every answer so far will be lost.",
    { title: "Start over?", confirmLabel: "Start over" },
  );
  if (ok) reset();
}

async function onStartOver() {
  const ok = await confirm(
    "Starting over discards this tree and every answer so far.",
    { title: "Start over?", confirmLabel: "Start over" },
  );
  if (ok) reset();
}

async function onCreate() {
  if (!tree.value || creating.value) return;
  creating.value = true;
  try {
    const { questId, beatsCreated } = await createFromHook({
      hook: tree.value,
      giverNpcId: "",
      locationId: "",
      entityPools: entityPools.value,
      aiProvenance: provenance.value,
      parentQuestId: parentId ?? null,
    });
    // Mirrors QuestGeneratorPanel's createFromHook: a settled tree with no
    // beats is a legitimate response (see spine.ts), but the DM asked for a
    // quest and got less than one, and shouldn't have to open Story flow to
    // notice.
    if (beatsCreated === 0) {
      toast.info(
        `"${tree.value.title}" has no story beats yet — the AI didn't return one. Its objectives are ready; write the beats yourself in Story flow.`,
        8000,
      );
    }
    // Same landing as every other quest-creation flow — see the overview
    // note in QuestFlowStarter.vue for why the surface is named outright.
    await router.push({ path: `/quests/${questId}`, query: { view: "overview" } });
  } finally {
    creating.value = false;
  }
}
</script>
