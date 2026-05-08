<template>
  <PageHeader :title="isNew ? 'New Puzzle' : (puzzle?.name || 'Loading…')">
    <template #actions>
      <!-- View mode actions -->
      <template v-if="mode === 'view' && !isNew">
        <button
          type="button"
          class="inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-3 py-1.5 font-cinzel text-xs font-semibold text-muted-foreground hover:text-foreground hover:border-primary/50 transition-colors"
          @click="mode = 'edit'"
        >
          <IconEdit class="size-3.5 shrink-0" />
          Edit
        </button>
      </template>

      <!-- Edit mode actions -->
      <template v-else-if="mode === 'edit' || isNew">
        <button
          v-if="isEdit"
          type="button"
          class="font-fell text-sm text-destructive hover:opacity-70 transition-opacity"
          @click="handleDelete"
        >
          Delete
        </button>
        <button
          v-if="isEdit"
          type="button"
          class="inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-3 py-1.5 font-cinzel text-xs font-semibold text-muted-foreground hover:text-foreground transition-colors"
          @click="mode = 'view'"
        >
          Cancel
        </button>
        <button
          type="button"
          :disabled="saving || !form.name.trim()"
          class="inline-flex items-center gap-1.5 rounded-md bg-primary px-4 py-2 font-cinzel text-xs font-semibold text-primary-foreground tracking-wider hover:opacity-90 transition-opacity disabled:opacity-50"
          @click="save"
        >
          {{ saving ? "Saving…" : isNew ? "Create" : "Save" }}
        </button>
      </template>
    </template>

    <div v-if="isLoading" class="flex justify-center py-16">
      <LoadingSpinner />
    </div>

    <!-- ═══════════ VIEW MODE ═══════════ -->
    <template v-else-if="mode === 'view' && puzzle">
      <div class="flex flex-col gap-5 max-w-2xl">

        <!-- Art + Identity card -->
        <div class="rounded-lg border border-border bg-card overflow-hidden">
          <div class="flex gap-0">
            <!-- Portrait -->
            <div class="shrink-0 w-40 sm:w-52 self-stretch">
              <FocalImage
                :src="puzzle.image_url"
                :alt="puzzle.name"
                format="portrait"
                :focal-point="puzzle.image_focal_point"
                placeholder="/assets/placeholders/enigma.webp"
                class="h-full"
              />
            </div>

            <!-- Title + meta -->
            <div class="flex-1 p-4 flex flex-col gap-2 min-w-0">
              <h2 class="font-cinzel text-xl font-bold text-foreground leading-tight">{{ puzzle.name }}</h2>
              <div class="flex flex-wrap gap-2">
                <span
                  class="font-cinzel text-[10px] px-2 py-0.5 rounded tracking-wider text-white font-bold"
                  :style="{ backgroundColor: PUZZLE_TYPE_COLORS[puzzle.puzzle_type] + 'DD' }"
                >{{ puzzle.puzzle_type }}</span>
                <span
                  class="font-cinzel text-[10px] px-2 py-0.5 rounded tracking-wider text-white font-bold"
                  :style="{ backgroundColor: PUZZLE_DIFFICULTY_COLORS[puzzle.difficulty] + 'DD' }"
                >{{ puzzle.difficulty }}</span>
              </div>
              <div v-if="puzzle.tags.length" class="flex flex-wrap gap-1 mt-auto">
                <span
                  v-for="tag in puzzle.tags"
                  :key="tag"
                  class="font-cinzel text-[9px] px-1.5 py-0.5 rounded-full bg-muted text-muted-foreground tracking-wider"
                >{{ tag }}</span>
              </div>

              <!-- Skill checks -->
              <div v-if="puzzle.skill_checks.length" class="flex flex-wrap gap-2 mt-1">
                <span
                  v-for="sc in puzzle.skill_checks"
                  :key="sc.skill"
                  class="font-fell text-[11px] text-muted-foreground"
                >
                  {{ sc.skill }} DC {{ sc.dc }}
                </span>
              </div>
            </div>
          </div>
        </div>

        <!-- Share panel -->
        <div class="rounded-lg border border-border bg-card overflow-hidden">
          <div class="px-4 py-3 border-b border-border bg-muted/20 flex items-center justify-between gap-3">
            <div class="flex items-center gap-2">
              <IconShare class="size-3.5 text-muted-foreground shrink-0" />
              <span class="font-cinzel text-xs font-semibold text-muted-foreground tracking-wider">Player Share</span>
            </div>
            <!-- Share toggle -->
            <button
              type="button"
              class="relative inline-flex h-5 w-9 items-center rounded-full transition-colors focus:outline-none"
              :class="shareState.is_shared ? 'bg-primary' : 'bg-muted border border-border'"
              @click="toggleShare"
            >
              <span
                class="inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform shadow-sm"
                :class="shareState.is_shared ? 'translate-x-4.5' : 'translate-x-0.5'"
              />
            </button>
          </div>
          <div class="p-4 space-y-3">
            <p v-if="!shareState.is_shared" class="font-fell text-xs text-muted-foreground italic">
              Toggle sharing to make this puzzle visible to players in your campaign.
            </p>
            <template v-else>
              <p class="font-fell text-xs text-muted-foreground">
                Shared with players in your campaign. Revealed hints: {{ shareState.shared_hints.length }} / {{ puzzle.hints.length }}
              </p>

              <!-- Read aloud -->
              <div>
                <label class="block font-cinzel text-xs font-semibold text-muted-foreground tracking-wider mb-1.5">
                  Read-Aloud Text
                  <span class="font-fell normal-case tracking-normal text-muted-foreground/60 ml-1">(players will see this)</span>
                </label>
                <textarea
                  v-model="shareState.read_aloud"
                  rows="3"
                  placeholder="Read this aloud as the party enters the room…"
                  class="w-full bg-background border border-border rounded-md px-3 py-2 font-fell text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring resize-y"
                  @blur="saveShareState"
                />
              </div>
            </template>
          </div>
        </div>

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
              <ImageUpload
                :model-value="form.image_url"
                :focal-point="form.image_focal_point"
                aspect="square"
                show-focal-point
                bucket="puzzle-images"
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
        <div class="rounded-lg border border-border bg-card overflow-hidden">
          <div class="px-3 py-2 border-b border-border bg-muted/20 flex items-center justify-between">
            <span class="font-cinzel text-xs font-semibold text-muted-foreground tracking-wider">Skill Checks</span>
            <button
              type="button"
              class="font-cinzel text-[10px] font-semibold text-primary hover:opacity-80 transition-opacity tracking-wider"
              @click="addSkillCheck"
            >
              + Add
            </button>
          </div>
          <div class="p-4 space-y-2">
            <p v-if="!form.skill_checks.length" class="font-fell text-xs text-muted-foreground italic">
              No skill checks yet.
            </p>
            <div v-for="(check, i) in form.skill_checks" :key="i" class="flex items-center gap-2">
              <select
                v-model="check.skill"
                class="flex-1 bg-background border border-border rounded-md px-2 py-1.5 font-fell text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
              >
                <option v-for="s in PUZZLE_SKILLS" :key="s" :value="s">{{ s }}</option>
              </select>
              <span class="font-cinzel text-xs text-muted-foreground shrink-0">DC</span>
              <input
                v-model.number="check.dc"
                type="number"
                min="1"
                max="30"
                class="w-16 bg-background border border-border rounded-md px-2 py-1.5 font-fell text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring text-center"
              />
              <button
                type="button"
                class="shrink-0 text-muted-foreground hover:text-destructive transition-colors"
                @click="form.skill_checks.splice(i, 1)"
              >
                <IconClose class="size-3.5" />
              </button>
            </div>
          </div>
        </div>

        <!-- Hints -->
        <div class="rounded-lg border border-border bg-card overflow-hidden">
          <div class="px-3 py-2 border-b border-border bg-muted/20 flex items-center justify-between">
            <span class="font-cinzel text-xs font-semibold text-muted-foreground tracking-wider">Hints</span>
            <button
              type="button"
              class="font-cinzel text-[10px] font-semibold text-primary hover:opacity-80 transition-opacity tracking-wider"
              @click="addHint"
            >
              + Add Hint
            </button>
          </div>
          <div class="p-4 space-y-3">
            <p v-if="!form.hints.length" class="font-fell text-xs text-muted-foreground italic">
              No hints yet. Add tiered hints from subtle to obvious.
            </p>
            <div v-for="(hint, i) in sortedHints" :key="hint.order" class="flex items-start gap-2">
              <span class="shrink-0 mt-1.5 font-cinzel text-[10px] font-bold text-muted-foreground w-6 text-right">{{ hint.order }}</span>
              <RichTextEditor
                :model-value="hint.text"
                :placeholder="`Hint ${hint.order}…`"
                min-height="80px"
                class="flex-1"
                @update:model-value="hint.text = $event"
              />
              <div class="shrink-0 flex flex-col gap-0.5 mt-1">
                <button
                  v-if="i > 0"
                  type="button"
                  class="text-muted-foreground hover:text-foreground transition-colors"
                  @click="moveHint(i, -1)"
                >
                  <IconChevronUp class="size-3.5" />
                </button>
                <button
                  v-if="i < form.hints.length - 1"
                  type="button"
                  class="text-muted-foreground hover:text-foreground transition-colors"
                  @click="moveHint(i, 1)"
                >
                  <IconChevronDown class="size-3.5" />
                </button>
                <button
                  type="button"
                  class="text-muted-foreground hover:text-destructive transition-colors"
                  @click="removeHint(i)"
                >
                  <IconClose class="size-3.5" />
                </button>
              </div>
            </div>
          </div>
        </div>

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
import { IconChevronDown, IconChevronUp, IconClose, IconEdit, IconHide, IconReveal, IconShare } from '@/lib/icons';
import { usePuzzle, useCreatePuzzle, useUpdatePuzzle, useDeletePuzzle } from "@/composables/usePuzzles";
import { useCampaignStore } from "@/stores/campaign";
import { PUZZLE_TYPES, PUZZLE_DIFFICULTIES, PUZZLE_SKILLS, PUZZLE_TYPE_COLORS, PUZZLE_DIFFICULTY_COLORS } from "@/types/puzzle.types";
import type { PuzzleHint, PuzzleSkillCheck } from "@/types/puzzle.types";
import PageHeader from "@/components/common/PageHeader.vue";
import LoadingSpinner from "@/components/common/LoadingSpinner.vue";
import ImageUpload from "@/components/common/ImageUpload.vue";
import TagInput from "@/components/common/TagInput.vue";
import RichTextEditor from "@/components/common/RichTextEditor.vue";
import RichTextViewer from "@/components/common/RichTextViewer.vue";
import FocalImage from "@/components/common/FocalImage.vue";

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
