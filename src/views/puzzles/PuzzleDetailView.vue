<template>
  <PageHeader :title="isNew ? 'New Puzzle' : (puzzle?.name || 'Loading…')">
    <template #actions>
      <!-- View mode actions -->
      <template v-if="mode === 'view' && !isNew">
        <PuzzleRevealControl v-if="puzzle" :puzzle="puzzle" />
        <PageHeaderAction
          label="Edit"
          :icon="IconEdit"
          @click="mode = 'edit'"
        />
      </template>

      <!-- Edit mode actions -->
      <template v-else-if="mode === 'edit' || isNew">
        <PageHeaderAction
          v-if="isEdit"
          variant="destructive"
          label="Delete"
          :icon="IconDelete"
          @click="handleDelete"
        />
        <AppButton
          v-if="isEdit"
          variant="subtle"
          size="sm"
          label="Cancel"
          @click="mode = 'view'"
        />
        <PageHeaderAction
          variant="primary"
          :disabled="saving || !form.name.trim()"
          :label="saving ? 'Saving…' : isNew ? 'Create' : 'Save'"
          :collapse-label-on-mobile="false"
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

        <!-- Anchor links — where this puzzle lives in the world -->
        <div v-if="anchorLocation || anchorFeature" class="flex flex-wrap gap-1.5">
          <AppButton
            v-if="anchorLocation"
            variant="chip"
            size="xs"
            :icon="IconLocation"
            :label="anchorLocation.name"
            :to="`/locations/${anchorLocation.id}`"
          />
          <AppButton
            v-if="anchorFeature"
            variant="chip"
            size="xs"
            :icon="IconDungeon"
            :label="anchorFeature.name"
            :to="`/dungeon-features/${anchorFeature.id}`"
          />
        </div>

        <!--
          Read-aloud text. This used to sit inside a "Player Share" panel with
          the share toggle; the sharing decision moved to the reveal control in
          the header, and the prose stayed on the page where there is room to
          write it. It is player-facing content, like the description below.
        -->
        <div class="overflow-hidden rounded-lg border border-border bg-card">
          <div class="border-b border-border bg-muted/20 px-3 py-2">
            <span class="text-label-lg font-semibold text-muted-foreground">
              Read-Aloud
              <span class="ml-1 font-fell normal-case tracking-normal text-muted-foreground/60">
                (players will see this)
              </span>
            </span>
          </div>
          <div class="p-4">
            <!--
              Native <textarea> on purpose: `read_aloud` is plain text the DM
              speaks at the table, and RichTextEditor would store Tiptap JSON
              that the player view renders as markup. The chrome comes from
              `fieldVariants` rather than a hand-written class string, so it
              stays in step with AppInput.
            -->
            <textarea
              v-model="readAloud"
              rows="3"
              placeholder="Read this aloud as the party enters the room…"
              :class="cn(fieldVariants({ size: 'body' }), 'w-full resize-y')"
              @blur="saveReadAloud"
            />
          </div>
        </div>

        <!-- Setup description -->
        <div v-if="puzzle.description" class="rounded-lg border border-border bg-card overflow-hidden">
          <div class="px-3 py-2 border-b border-border bg-muted/20">
            <span class="text-label-lg font-semibold text-muted-foreground">Setup</span>
          </div>
          <div class="p-4">
            <RichTextViewer :content="puzzle.description" />
          </div>
        </div>

        <!-- Hints -->
        <div v-if="puzzle.hints.length" class="rounded-lg border border-border bg-card overflow-hidden">
          <div class="px-3 py-2 border-b border-border bg-muted/20">
            <span class="text-label-lg font-semibold text-muted-foreground">Hints</span>
          </div>
          <div class="divide-y divide-border">
            <div
              v-for="hint in sortedViewHints"
              :key="hint.order"
              class="flex items-start gap-3 px-4 py-3"
            >
              <span class="shrink-0 font-cinzel text-2xs font-bold text-muted-foreground/60 w-4 mt-0.5">{{ hint.order }}</span>
              <div class="flex-1 min-w-0">
                <RichTextViewer :content="hint.text" />
              </div>
              <!--
                The same decision as the reveal control's "hints given", offered
                here because this is where the DM is reading the hint text. Both
                write the same column through the same mutation, so they are two
                ways to reach one state rather than two states.
              -->
              <AppButton
                class="shrink-0"
                :variant="isHintShared(hint.order) ? 'tinted' : 'chip'"
                :tone="isHintShared(hint.order) ? 'primary' : undefined"
                emphasis="soft"
                size="xs"
                :icon="isHintShared(hint.order) ? IconReveal : IconHide"
                :label="isHintShared(hint.order) ? 'Revealed' : 'Hidden'"
                :title="isHintShared(hint.order) ? 'Hide from players' : 'Reveal to players'"
                @click="toggleHint(hint.order)"
              />
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
            <span class="text-label-lg font-semibold text-muted-foreground">Solution</span>
            <span class="text-label text-muted-foreground">{{ solutionOpen ? 'Hide' : 'Reveal' }}</span>
          </button>
          <div v-if="solutionOpen" class="p-4">
            <RichTextViewer :content="puzzle.solution" />
          </div>
        </div>

        <!-- Outcomes -->
        <div v-if="puzzle.success_outcome || puzzle.failure_consequence" class="rounded-lg border border-border bg-card overflow-hidden">
          <div class="px-3 py-2 border-b border-border bg-muted/20">
            <span class="text-label-lg font-semibold text-muted-foreground">Outcomes</span>
          </div>
          <div class="divide-y divide-border">
            <div v-if="puzzle.success_outcome" class="p-4">
              <p class="text-eyebrow font-semibold text-primary mb-1.5">SUCCESS</p>
              <RichTextViewer :content="puzzle.success_outcome" />
            </div>
            <div v-if="puzzle.failure_consequence" class="p-4">
              <p class="text-label font-semibold text-destructive mb-1.5">FAILURE</p>
              <RichTextViewer :content="puzzle.failure_consequence" />
            </div>
          </div>
        </div>

        <!-- DM Notes -->
        <div v-if="puzzle.notes" class="rounded-lg border border-border bg-card overflow-hidden">
          <div class="px-3 py-2 border-b border-border bg-muted/20">
            <span class="text-label-lg font-semibold text-muted-foreground">DM Notes</span>
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
            <span class="text-label-lg font-semibold text-muted-foreground">Identity</span>
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
                :ai-target-id="puzzle?.id"
                :ai-context="aiContext"
                @update:model-value="form.image_url = $event"
                @update:focal-point="form.image_focal_point = $event"
              />
            </div>

            <!-- Fields -->
            <div class="flex-1 grid grid-cols-2 gap-3">
              <div class="col-span-2">
                <label class="block text-label-lg font-semibold text-muted-foreground mb-1">Name</label>
                <AppInput v-model="form.name" size="heading" placeholder="Puzzle name…" />
              </div>
              <div>
                <label class="block text-label-lg font-semibold text-muted-foreground mb-1">Type</label>
                <AppSelect v-model="form.puzzle_type" tone="default" size="body" weight="normal" block>
                  <option v-for="t in PUZZLE_TYPES" :key="t" :value="t">{{ t }}</option>
                </AppSelect>
              </div>
              <div>
                <label class="block text-label-lg font-semibold text-muted-foreground mb-1">Difficulty</label>
                <AppSelect v-model="form.difficulty" tone="default" size="body" weight="normal" block>
                  <option v-for="d in PUZZLE_DIFFICULTIES" :key="d" :value="d">{{ d }}</option>
                </AppSelect>
              </div>
              <div>
                <label class="block text-label-lg font-semibold text-muted-foreground mb-1">Location</label>
                <EntityCombobox
                  :model-value="form.location_id ?? ''"
                  :options="locationOptions"
                  placeholder="— none —"
                  @update:model-value="form.location_id = $event || null"
                >
                  <template #option="{ opt }">
                    <span :style="{ paddingLeft: `${(opt as LocationOption).depth * 12}px` }">{{ opt.name }}</span>
                  </template>
                </EntityCombobox>
              </div>
              <div>
                <label class="block text-label-lg font-semibold text-muted-foreground mb-1">Dungeon Feature</label>
                <EntityCombobox
                  :model-value="form.dungeon_feature_id ?? ''"
                  :options="pickableDungeonFeatures ?? []"
                  placeholder="— none —"
                  @update:model-value="form.dungeon_feature_id = $event || null"
                />
              </div>
              <div class="col-span-2">
                <label class="block text-label-lg font-semibold text-muted-foreground mb-1">Tags</label>
                <TagInput v-model="form.tags" />
              </div>
              <div class="col-span-2">
                <CampaignScopeField v-model="form.campaign_id" />
              </div>
            </div>
          </div>
        </div>

        <!-- Setup -->
        <div class="rounded-lg border border-border bg-card overflow-hidden">
          <div class="px-3 py-2 border-b border-border bg-muted/20">
            <span class="text-label-lg font-semibold text-muted-foreground">Setup</span>
          </div>
          <div class="p-4">
            <label class="block text-label-lg font-semibold text-muted-foreground mb-2">
              What the players see / experience
            </label>
            <RichTextEditor
              :model-value="form.description"
              placeholder="Describe the room, the mechanisms, and what is immediately observable…"
              size="md"
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
            <span class="text-label-lg font-semibold text-muted-foreground">Solution</span>
          </div>
          <div class="p-4">
            <label class="block text-label-lg font-semibold text-muted-foreground mb-2">
              The answer / mechanism (DM eyes only)
            </label>
            <RichTextEditor
              :model-value="form.solution"
              placeholder="The answer is… / The mechanism works by…"
              size="md"
              @update:model-value="form.solution = $event"
            />
          </div>
        </div>

        <!-- Outcomes -->
        <div class="rounded-lg border border-border bg-card overflow-hidden">
          <div class="px-3 py-2 border-b border-border bg-muted/20">
            <span class="text-label-lg font-semibold text-muted-foreground">Outcomes</span>
          </div>
          <div class="p-4 grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label class="block text-label-lg font-semibold text-muted-foreground mb-2">Success</label>
              <RichTextEditor
                :model-value="form.success_outcome"
                placeholder="What happens when the puzzle is solved…"
                size="md"
                @update:model-value="form.success_outcome = $event"
              />
            </div>
            <div>
              <label class="block text-label-lg font-semibold text-muted-foreground mb-2">Failure / Consequence</label>
              <RichTextEditor
                :model-value="form.failure_consequence"
                placeholder="What happens on a wrong answer or giving up…"
                size="md"
                @update:model-value="form.failure_consequence = $event"
              />
            </div>
          </div>
        </div>

        <!-- DM Notes -->
        <div class="rounded-lg border border-border bg-card overflow-hidden">
          <div class="px-3 py-2 border-b border-border bg-muted/20">
            <span class="text-label-lg font-semibold text-muted-foreground">DM Notes</span>
          </div>
          <div class="p-4">
            <RichTextEditor
              :model-value="form.notes"
              placeholder="Running notes, variant solutions, pacing tips…"
              size="md"
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
import { IconDelete, IconDungeon, IconEdit, IconHide, IconLocation, IconReveal } from '@/lib/icons';
import { usePuzzle, useCreatePuzzle, useUpdatePuzzle, useDeletePuzzle } from "@/composables/dungeon-features/usePuzzles";
import { useCampaignStore } from "@/stores/campaign";
import { markEdited, type AiProvenance } from "@/ai/provenance";
import { cn, deepEqual } from "@/lib/utils";
import { fieldVariants } from "@/components/common/fieldVariants";
import { PUZZLE_TYPES, PUZZLE_DIFFICULTIES } from "@/types/puzzle.types";
import type { PuzzleHint, PuzzleSkillCheck } from "@/types/puzzle.types";
import PageHeader from "@/components/common/PageHeader.vue";
import PageHeaderAction from "@/components/common/PageHeaderAction.vue";
import AppButton from "@/components/common/AppButton.vue";
import AppInput from "@/components/common/AppInput.vue";
import AppSelect from "@/components/common/AppSelect.vue";
import LoadingSpinner from "@/components/common/LoadingSpinner.vue";
import EntityImageBlock from "@/components/common/EntityImageBlock.vue";
import TagInput from "@/components/common/TagInput.vue";
import CampaignScopeField from "@/components/common/CampaignScopeField.vue";
import RichTextEditor from "@/components/common/RichTextEditor.vue";
import RichTextViewer from "@/components/common/RichTextViewer.vue";
import PuzzleIdentityCard from "@/components/puzzles/PuzzleIdentityCard.vue";
import PuzzleRevealControl from "@/components/puzzles/PuzzleRevealControl.vue";
import PuzzleHintsEditor from "@/components/puzzles/PuzzleHintsEditor.vue";
import PuzzleSkillChecksEditor from "@/components/puzzles/PuzzleSkillChecksEditor.vue";
import EntityCombobox from "@/components/common/EntityCombobox.vue";
import { useLocationTree } from "@/composables/locations/useLocations";
import { useDungeonFeatures } from "@/composables/dungeon-features/useDungeonFeatures";
import type { Location } from "@/types/location.types";

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
  location_id:         null as string | null,
  dungeon_feature_id:  null as string | null,
  ai_provenance:       null as AiProvenance | null,
  // New puzzles default to the active campaign; existing ones keep whatever
  // scope they already have (#597) — overwritten below once `puzzle` loads.
  campaign_id:         campaign.activeCampaignId as string | null,
});

type LocationOption = Location & { depth: number };
const { locationOptions } = useLocationTree();
// Two lists, deliberately not one: `dungeonFeatures` resolves the anchor this
// puzzle already stores, which must survive even after the DM rescopes the
// feature to another campaign (#800) — so it stays unscoped.
// `pickableDungeonFeatures` backs the combobox that sets a new anchor, which
// should only ever offer this campaign's own features.
const { data: dungeonFeatures } = useDungeonFeatures(() => ({ includeAllScopes: true }));
const { data: pickableDungeonFeatures } = useDungeonFeatures();

const anchorLocation = computed(() =>
  puzzle.value?.location_id
    ? (locationOptions.value.find((l) => l.id === puzzle.value!.location_id) ?? null)
    : null,
);
const anchorFeature = computed(() =>
  puzzle.value?.dungeon_feature_id
    ? (dungeonFeatures.value?.find((f) => f.id === puzzle.value!.dungeon_feature_id) ?? null)
    : null,
);

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
  form.location_id         = p.location_id;
  form.dungeon_feature_id  = p.dungeon_feature_id;
  form.ai_provenance       = p.ai_provenance ?? null;
  form.campaign_id         = p.campaign_id;
}, { immediate: true });

// ── Player-facing state (view mode, autosaved) ──────────────────────────────
//
// The audience and the "share this at all" toggle used to live here, in a
// `shareState` object mirrored back to the row. Both are now the reveal control
// in the header, which owns `player_visible_to`, `is_shared` and `campaign_id`
// together — one writer, so they cannot drift apart. What is left is the prose
// and the hint ladder, which the page still edits in place.

const updateMutation = useUpdatePuzzle();

const readAloud = ref<string | null>(null);
watch(puzzle, (p) => {
  if (p) readAloud.value = p.read_aloud;
}, { immediate: true });

async function saveReadAloud() {
  if (!id.value || readAloud.value === puzzle.value?.read_aloud) return;
  await updateMutation.mutateAsync({
    id: id.value,
    update: { read_aloud: readAloud.value || null },
  });
}

function isHintShared(order: number): boolean {
  return puzzle.value?.shared_hints.includes(order) ?? false;
}

async function toggleHint(order: number) {
  if (!id.value || !puzzle.value) return;
  const current = puzzle.value.shared_hints;
  const next = current.includes(order)
    ? current.filter((o) => o !== order)
    : [...current, order].sort((a, b) => a - b);
  await updateMutation.mutateAsync({ id: id.value, update: { shared_hints: next } });
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
    // Material edit detection (#606): tags, image art, the location/dungeon-
    // feature links and campaign scope are excluded per the "moves/tags/image"
    // carve-outs.
    const contentChanged = !!puzzle.value && (
      form.name.trim() !== puzzle.value.name ||
      form.puzzle_type !== puzzle.value.puzzle_type ||
      form.difficulty !== puzzle.value.difficulty ||
      !deepEqual(form.description || null, puzzle.value.description) ||
      !deepEqual(form.solution || null, puzzle.value.solution) ||
      !deepEqual([...form.hints].sort((a, b) => a.order - b.order), [...puzzle.value.hints].sort((a, b) => a.order - b.order)) ||
      !deepEqual(form.skill_checks, puzzle.value.skill_checks) ||
      !deepEqual(form.success_outcome || null, puzzle.value.success_outcome) ||
      !deepEqual(form.failure_consequence || null, puzzle.value.failure_consequence) ||
      !deepEqual(form.notes || null, puzzle.value.notes)
    );
    if (contentChanged) form.ai_provenance = markEdited(form.ai_provenance);

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
      location_id:         form.location_id,
      dungeon_feature_id:  form.dungeon_feature_id,
      ai_provenance:       form.ai_provenance,
      campaign_id:         form.campaign_id,
      // Widening a shared puzzle back to "all campaigns" un-shares it. Sharing
      // is a promise to one campaign's players, and get_player_visible_puzzles
      // finds a puzzle by its campaign_id — so a null campaign with is_shared
      // still set is a puzzle the DM believes is on the table and no player can
      // see. Narrowing the state beats leaving that lie in the row.
      ...(form.campaign_id === null
        ? { is_shared: false, shared_hints: [], player_visible_to: [] }
        : {}),
    };
    if (isNew.value) {
      await createMutation.mutateAsync({
        ...payload,
        is_shared: false,
        shared_hints: [],
        player_visible_to: [],
        read_aloud: null,
      });
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
