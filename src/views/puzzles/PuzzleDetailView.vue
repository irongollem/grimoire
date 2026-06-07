<template>
  <PageHeader :title="isNew ? 'New Puzzle' : (puzzle?.name || 'Loading…')">
    <template #actions>
      <!-- View mode actions -->
      <template v-if="mode === 'view' && !isNew">
        <PageHeaderAction
          type="button"
          label="Edit"
          :icon="IconEdit"
          @click="mode = 'edit'"
        />
      </template>

      <!-- Edit mode actions -->
      <template v-else-if="mode === 'edit' || isNew">
        <PageHeaderAction
          v-if="isEdit"
          type="button"
          label="Delete"
          :icon="IconDelete"
          variant="destructive"
          @click="handleDelete"
        />
        <button
          v-if="isEdit"
          type="button"
          class="inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-3 py-1.5 font-cinzel text-xs font-semibold text-muted-foreground hover:text-foreground transition-colors"
          @click="mode = 'view'"
        >
          Cancel
        </button>
        <PageHeaderAction
          type="button"
          :disabled="saving || !form.name.trim()"
          :label="saving ? 'Saving…' : isNew ? 'Create' : 'Save'"
          :mobile-label="saving ? 'Saving…' : isNew ? 'Create' : 'Save'"
          variant="primary"
          :hide-label-on-mobile="false"
          @click="save"
        />
      </template>
    </template>

    <div v-if="isLoading" class="flex justify-center py-16">
      <LoadingSpinner />
    </div>

    <!-- ═══════════ VIEW MODE ═══════════ -->
    <template v-else-if="mode === 'view' && puzzle">
      <div class="flex flex-col gap-5 max-w-2xl">

        <!-- Art + Identity card -->
        <PuzzleIdentityCard :puzzle="puzzle" />

        <!-- Share panel -->
        <PuzzleSharePanel
          :share-state="shareState"
          :total-hints="puzzle.hints.length"
          @toggle-share="toggleShare"
          @save-share-state="saveShareState"
        />

        <!-- Setup description -->
        <div v-if="puzzle.description" class="rounded-lg border border-border bg-card overflow-hidden">
          <div class="px-3 py-2 border-b border-border bg-muted/20">
            <span class="font-cinzel text-xs font-semibold text-muted-foreground tracking-wider">Setup</span>
          </div>
          <div class="p-4">
            <RichTextViewer :content="puzzle.description" />
          </div>
        </div>

        <!-- Hints -->
        <div v-if="puzzle.hints.length" class="rounded-lg border border-border bg-card overflow-hidden">
          <div class="px-3 py-2 border-b border-border bg-muted/20">
            <span class="font-cinzel text-xs font-semibold text-muted-foreground tracking-wider">Hints</span>
          </div>
          <div class="divide-y divide-border">
            <div
              v-for="hint in sortedViewHints"
              :key="hint.order"
              class="flex items-start gap-3 px-4 py-3"
            >
              <span class="shrink-0 font-cinzel text-[10px] font-bold text-muted-foreground/60 w-4 mt-0.5">{{ hint.order }}</span>
              <div class="flex-1 min-w-0">
                <RichTextViewer :content="hint.text" />
              </div>
              <!-- Reveal toggle -->
              <button
                type="button"
                class="shrink-0 inline-flex items-center gap-1 font-cinzel text-[10px] font-semibold tracking-wider px-2 py-1 rounded transition-colors"
                :class="shareState.shared_hints.includes(hint.order)
                  ? 'bg-primary/15 text-primary hover:bg-primary/25'
                  : 'bg-muted text-muted-foreground hover:text-foreground'"
                :title="shareState.shared_hints.includes(hint.order) ? 'Hide from players' : 'Reveal to players'"
                @click="toggleHint(hint.order)"
              >
                <IconReveal v-if="shareState.shared_hints.includes(hint.order)" class="size-3" />
                <IconHide v-else class="size-3" />
                {{ shareState.shared_hints.includes(hint.order) ? 'Revealed' : 'Hidden' }}
              </button>
            </div>
          </div>
        </div>

        <!-- Solution (DM only, collapsible) -->
        <div v-if="puzzle.solution" class="rounded-lg border border-border bg-card overflow-hidden">
          <button
            type="button"
            class="w-full flex items-center justify-between px-3 py-2 border-b border-border bg-muted/20 hover:bg-muted/40 transition-colors"
            @click="solutionOpen = !solutionOpen"
          >
            <span class="font-cinzel text-xs font-semibold text-muted-foreground tracking-wider">Solution</span>
            <span class="font-cinzel text-[10px] text-muted-foreground tracking-wider">{{ solutionOpen ? 'Hide' : 'Reveal' }}</span>
          </button>
          <div v-if="solutionOpen" class="p-4">
            <RichTextViewer :content="puzzle.solution" />
          </div>
        </div>

        <!-- Outcomes -->
        <div v-if="puzzle.success_outcome || puzzle.failure_consequence" class="rounded-lg border border-border bg-card overflow-hidden">
          <div class="px-3 py-2 border-b border-border bg-muted/20">
            <span class="font-cinzel text-xs font-semibold text-muted-foreground tracking-wider">Outcomes</span>
          </div>
          <div class="divide-y divide-border">
            <div v-if="puzzle.success_outcome" class="p-4">
              <p class="font-cinzel text-[10px] font-semibold text-primary tracking-wider mb-1.5">SUCCESS</p>
              <RichTextViewer :content="puzzle.success_outcome" />
            </div>
            <div v-if="puzzle.failure_consequence" class="p-4">
              <p class="font-cinzel text-[10px] font-semibold text-destructive tracking-wider mb-1.5">FAILURE</p>
              <RichTextViewer :content="puzzle.failure_consequence" />
            </div>
          </div>
        </div>

        <!-- DM Notes -->
        <div v-if="puzzle.notes" class="rounded-lg border border-border bg-card overflow-hidden">
          <div class="px-3 py-2 border-b border-border bg-muted/20">
            <span class="font-cinzel text-xs font-semibold text-muted-foreground tracking-wider">DM Notes</span>
          </div>
          <div class="p-4">
            <RichTextViewer :content="puzzle.notes" />
          </div>
        </div>

      </div>
    </template>

    <!-- ═══════════ EDIT MODE ═══════════ -->
    <template v-else-if="mode === 'edit' || isNew">
      <div class="flex flex-col gap-4 max-w-2xl">

        <!-- Identity -->
        <div class="rounded-lg border border-border bg-card overflow-hidden">
          <div class="px-3 py-2 border-b border-border bg-muted/20">
            <span class="font-cinzel text-xs font-semibold text-muted-foreground tracking-wider">Identity</span>
          </div>
          <div class="p-4 flex gap-4">
            <!-- Image -->
            <div class="shrink-0 w-28">
              <EntityImageBlock
                :model-value="form.image_url"
                :focal-point="form.image_focal_point"
                bucket="puzzle-images"
                show-focal-point
                ai-kind="puzzle"
                :ai-context="aiContext"
                @update:model-value="form.image_url = $event"
                @update:focal-point="form.image_focal_point = $event"
              />
            </div>

            <!-- Fields -->
            <div class="flex-1 grid grid-cols-2 gap-3">
              <div class="col-span-2">
                <label class="block font-cinzel text-xs font-semibold text-muted-foreground tracking-wider mb-1">Name</label>
                <input
                  v-model="form.name"
                  placeholder="Puzzle name…"
                  class="w-full bg-background border border-border rounded-md px-3 py-1.5 font-cinzel text-sm font-bold text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                />
              </div>
              <div>
                <label class="block font-cinzel text-xs font-semibold text-muted-foreground tracking-wider mb-1">Type</label>
                <select
                  v-model="form.puzzle_type"
                  class="w-full bg-background border border-border rounded-md px-3 py-1.5 font-fell text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                >
                  <option v-for="t in PUZZLE_TYPES" :key="t" :value="t">{{ t }}</option>
                </select>
              </div>
              <div>
                <label class="block font-cinzel text-xs font-semibold text-muted-foreground tracking-wider mb-1">Difficulty</label>
                <select
                  v-model="form.difficulty"
                  class="w-full bg-background border border-border rounded-md px-3 py-1.5 font-fell text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                >
                  <option v-for="d in PUZZLE_DIFFICULTIES" :key="d" :value="d">{{ d }}</option>
                </select>
              </div>
              <div class="col-span-2">
                <label class="block font-cinzel text-xs font-semibold text-muted-foreground tracking-wider mb-1">Tags</label>
                <TagInput v-model="form.tags" />
              </div>
            </div>
          </div>
        </div>

        <!-- Setup -->
        <div class="rounded-lg border border-border bg-card overflow-hidden">
          <div class="px-3 py-2 border-b border-border bg-muted/20">
            <span class="font-cinzel text-xs font-semibold text-muted-foreground tracking-wider">Setup</span>
          </div>
          <div class="p-4">
            <label class="block font-cinzel text-xs font-semibold text-muted-foreground tracking-wider mb-2">
              What the players see / experience
            </label>
            <RichTextEditor
              :model-value="form.description"
              placeholder="Describe the room, the mechanisms, and what is immediately observable…"
              min-height="140px"
              @update:model-value="form.description = $event"
            />
          </div>
        </div>

        <!-- Skill Checks -->
        <PuzzleSkillChecksEditor
          :checks="form.skill_checks"
          @add-skill-check="addSkillCheck"
          @remove-skill-check="(i) => form.skill_checks.splice(i, 1)"
        />

        <!-- Hints -->
        <PuzzleHintsEditor
          :sorted-hints="sortedHints"
          @add-hint="addHint"
          @remove-hint="removeHint"
          @move-hint="moveHint"
          @update-hint-text="updateHintText"
        />

        <!-- Solution -->
        <div class="rounded-lg border border-border bg-card overflow-hidden">
          <div class="px-3 py-2 border-b border-border bg-muted/20">
            <span class="font-cinzel text-xs font-semibold text-muted-foreground tracking-wider">Solution</span>
          </div>
          <div class="p-4">
            <label class="block font-cinzel text-xs font-semibold text-muted-foreground tracking-wider mb-2">
              The answer / mechanism (DM eyes only)
            </label>
            <RichTextEditor
              :model-value="form.solution"
              placeholder="The answer is… / The mechanism works by…"
              min-height="120px"
              @update:model-value="form.solution = $event"
            />
          </div>
        </div>

        <!-- Outcomes -->
        <div class="rounded-lg border border-border bg-card overflow-hidden">
          <div class="px-3 py-2 border-b border-border bg-muted/20">
            <span class="font-cinzel text-xs font-semibold text-muted-foreground tracking-wider">Outcomes</span>
          </div>
          <div class="p-4 grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label class="block font-cinzel text-xs font-semibold text-muted-foreground tracking-wider mb-2">Success</label>
              <RichTextEditor
                :model-value="form.success_outcome"
                placeholder="What happens when the puzzle is solved…"
                min-height="100px"
                @update:model-value="form.success_outcome = $event"
              />
            </div>
            <div>
              <label class="block font-cinzel text-xs font-semibold text-muted-foreground tracking-wider mb-2">Failure / Consequence</label>
              <RichTextEditor
                :model-value="form.failure_consequence"
                placeholder="What happens on a wrong answer or giving up…"
                min-height="100px"
                @update:model-value="form.failure_consequence = $event"
              />
            </div>
          </div>
        </div>

        <!-- DM Notes -->
        <div class="rounded-lg border border-border bg-card overflow-hidden">
          <div class="px-3 py-2 border-b border-border bg-muted/20">
            <span class="font-cinzel text-xs font-semibold text-muted-foreground tracking-wider">DM Notes</span>
          </div>
          <div class="p-4">
            <RichTextEditor
              :model-value="form.notes"
              placeholder="Running notes, variant solutions, pacing tips…"
              min-height="100px"
              @update:model-value="form.notes = $event"
            />
          </div>
        </div>

      </div>
    </template>
  </PageHeader>
</template>

<script setup lang="ts">
import { computed, reactive, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import { buildEntityContext, toPlainText } from "@/ai/utils";
import { IconDelete, IconEdit, IconHide, IconReveal } from '@/lib/icons';
import { usePuzzle, useCreatePuzzle, useUpdatePuzzle, useDeletePuzzle } from "@/composables/usePuzzles";
import { useCampaignStore } from "@/stores/campaign";
import { PUZZLE_TYPES, PUZZLE_DIFFICULTIES } from "@/types/puzzle.types";
import type { PuzzleHint, PuzzleSkillCheck } from "@/types/puzzle.types";
import PageHeader from "@/components/common/PageHeader.vue";
import PageHeaderAction from "@/components/common/PageHeaderAction.vue";
import LoadingSpinner from "@/components/common/LoadingSpinner.vue";
import EntityImageBlock from "@/components/common/EntityImageBlock.vue";
import TagInput from "@/components/common/TagInput.vue";
import RichTextEditor from "@/components/common/RichTextEditor.vue";
import RichTextViewer from "@/components/common/RichTextViewer.vue";
import PuzzleIdentityCard from "@/components/puzzles/PuzzleIdentityCard.vue";
import PuzzleSharePanel from "@/components/puzzles/PuzzleSharePanel.vue";
import PuzzleHintsEditor from "@/components/puzzles/PuzzleHintsEditor.vue";
import PuzzleSkillChecksEditor from "@/components/puzzles/PuzzleSkillChecksEditor.vue";

const route    = useRoute();
const router   = useRouter();
const campaign = useCampaignStore();

const id     = computed(() => route.params.id as string | undefined);
const isNew  = computed(() => !id.value || id.value === "new");
const isEdit = computed(() => !isNew.value);

// Default to view mode for existing puzzles, edit for new
const mode = ref<"view" | "edit">(isNew.value ? "edit" : "view");

const { data: puzzle, isLoading } = usePuzzle(computed(() => id.value ?? ""));

// ── Edit form state ─────────────────────────────────────────────────────────

const form = reactive({
  name:                "",
  puzzle_type:         "Logic" as typeof PUZZLE_TYPES[number],
  difficulty:          "Medium" as typeof PUZZLE_DIFFICULTIES[number],
  description:         null as string | null,
  solution:            null as string | null,
  hints:               [] as PuzzleHint[],
  skill_checks:        [] as PuzzleSkillCheck[],
  success_outcome:     null as string | null,
  failure_consequence: null as string | null,
  image_url:           null as string | null,
  image_focal_point:   null as { x: number; y: number } | null,
  tags:                [] as string[],
  notes:               null as string | null,
});

const aiContext = computed(() =>
  buildEntityContext([
    form.name,
    `${form.puzzle_type} puzzle`,
    toPlainText(form.description),
  ]),
);

watch(puzzle, (p) => {
  if (!p) return;
  form.name                = p.name;
  form.puzzle_type         = p.puzzle_type;
  form.difficulty          = p.difficulty;
  form.description         = p.description;
  form.solution            = p.solution;
  form.hints               = p.hints.map((h) => ({ ...h }));
  form.skill_checks        = p.skill_checks.map((s) => ({ ...s }));
  form.success_outcome     = p.success_outcome;
  form.failure_consequence = p.failure_consequence;
  form.image_url           = p.image_url;
  form.image_focal_point   = p.image_focal_point;
  form.tags                = [...p.tags];
  form.notes               = p.notes;
}, { immediate: true });

// ── Share state (view mode, autosaved) ──────────────────────────────────────

const shareState = reactive({
  is_shared:    false,
  shared_hints: [] as number[],
  read_aloud:   null as string | null,
});

watch(puzzle, (p) => {
  if (!p) return;
  shareState.is_shared    = p.is_shared;
  shareState.shared_hints = [...p.shared_hints];
  shareState.read_aloud   = p.read_aloud;
}, { immediate: true });

const updateMutation = useUpdatePuzzle();

async function saveShareState() {
  if (!id.value) return;
  await updateMutation.mutateAsync({
    id: id.value,
    update: {
      is_shared:    shareState.is_shared,
      shared_hints: shareState.shared_hints,
      read_aloud:   shareState.read_aloud || null,
      // auto-assign campaign when sharing
      campaign_id: shareState.is_shared
        ? (puzzle.value?.campaign_id ?? campaign.activeCampaignId ?? null)
        : (puzzle.value?.campaign_id ?? null),
    },
  });
}

function toggleShare() {
  shareState.is_shared = !shareState.is_shared;
  if (!shareState.is_shared) shareState.shared_hints = [];
  saveShareState();
}

function toggleHint(order: number) {
  const idx = shareState.shared_hints.indexOf(order);
  if (idx >= 0) {
    shareState.shared_hints.splice(idx, 1);
  } else {
    shareState.shared_hints.push(order);
    shareState.shared_hints.sort((a, b) => a - b);
  }
  saveShareState();
}

// ── Hint helpers ────────────────────────────────────────────────────────────

const sortedHints = computed(() =>
  [...form.hints].sort((a, b) => a.order - b.order),
);

const sortedViewHints = computed(() =>
  puzzle.value ? [...puzzle.value.hints].sort((a, b) => a.order - b.order) : [],
);

function addHint() {
  const maxOrder = form.hints.reduce((m, h) => Math.max(m, h.order), 0);
  form.hints.push({ order: maxOrder + 1, text: "" });
}

function removeHint(sortedIndex: number) {
  const sorted = [...form.hints].sort((a, b) => a.order - b.order);
  const target = sorted[sortedIndex];
  const idx = form.hints.findIndex((h) => h.order === target.order);
  form.hints.splice(idx, 1);
  form.hints.sort((a, b) => a.order - b.order).forEach((h, i) => { h.order = i + 1; });
}

function moveHint(sortedIndex: number, direction: -1 | 1) {
  const sorted = [...form.hints].sort((a, b) => a.order - b.order);
  const swapIdx = sortedIndex + direction;
  if (swapIdx < 0 || swapIdx >= sorted.length) return;
  const aOrder = sorted[sortedIndex].order;
  const bOrder = sorted[swapIdx].order;
  const aHint = form.hints.find((h) => h.order === aOrder)!;
  const bHint = form.hints.find((h) => h.order === bOrder)!;
  aHint.order = bOrder;
  bHint.order = aOrder;
}

function updateHintText(order: number, text: string) {
  const hint = form.hints.find((h) => h.order === order);
  if (hint) hint.text = text;
}

function addSkillCheck() {
  form.skill_checks.push({ skill: "Investigation", dc: 15 });
}

// ── Save / delete ───────────────────────────────────────────────────────────

const createMutation = useCreatePuzzle();
const deleteMutation = useDeletePuzzle();
const saving         = ref(false);
const solutionOpen   = ref(false);

async function save() {
  if (!form.name.trim()) return;
  saving.value = true;
  try {
    const payload = {
      name:                form.name.trim(),
      puzzle_type:         form.puzzle_type,
      difficulty:          form.difficulty,
      description:         form.description || null,
      solution:            form.solution || null,
      hints:               [...form.hints].sort((a, b) => a.order - b.order),
      skill_checks:        form.skill_checks,
      success_outcome:     form.success_outcome || null,
      failure_consequence: form.failure_consequence || null,
      image_url:           form.image_url,
      image_focal_point:   form.image_focal_point,
      tags:                form.tags,
      notes:               form.notes || null,
    };
    if (isNew.value) {
      await createMutation.mutateAsync({ ...payload, campaign_id: null, is_shared: false, shared_hints: [], read_aloud: null });
      router.push({ path: "/dungeon-craft", query: { tab: "puzzles" } });
    } else {
      await updateMutation.mutateAsync({ id: id.value!, update: payload });
      mode.value = "view";
    }
  } finally {
    saving.value = false;
  }
}

async function handleDelete() {
  if (!id.value) return;
  if (!confirm(`Delete "${form.name}"? This cannot be undone.`)) return;
  await deleteMutation.mutateAsync(puzzle.value!);
  router.push({ path: "/dungeon-craft", query: { tab: "puzzles" } });
}
</script>
