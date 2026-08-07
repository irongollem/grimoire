<template>
  <PageHeader
    :title="isNew ? 'New Rule' : (rule?.title || 'Loading…')"
    description="Custom rule, system, or table"
  >
    <template v-if="isNew || isEditing" #actions>
      <AppButton
        v-if="!isNew"
        variant="subtle"
        size="md"
        label="Cancel"
        @click="onCancel"
      />
    </template>

    <div v-if="isLoading" class="flex justify-center py-16">
      <LoadingSpinner />
    </div>

    <RuleSheet v-else-if="!isNew && !isEditing && rule" :rule="rule" />

    <form v-else class="max-w-3xl space-y-5" @submit.prevent="handleSave">
      <!-- Title -->
      <div class="space-y-1.5">
        <label class="text-label-lg font-semibold text-muted-foreground">TITLE</label>
        <input
          v-model="form.title"
          type="text"
          placeholder="e.g. Corruption Track, Icy Weather Rules…"
          required
          class="w-full bg-card border border-border rounded-md px-3 py-2 text-body text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
        />
      </div>

      <!-- Category + Tags row -->
      <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div class="space-y-1.5">
          <label class="text-label-lg font-semibold text-muted-foreground">CATEGORY</label>
          <select
            v-model="form.category"
            class="w-full bg-card border border-border rounded-md px-3 py-2 text-body text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
          >
            <option value="">None</option>
            <option v-for="cat in RULE_CATEGORIES" :key="cat" :value="cat">{{ cat }}</option>
          </select>
        </div>

        <div class="space-y-1.5">
          <label class="text-label-lg font-semibold text-muted-foreground">TAGS</label>
          <TagInput v-model="tags" />
        </div>
      </div>

      <!-- Player visibility -->
      <label class="flex items-center gap-2 cursor-pointer select-none">
        <input type="checkbox" v-model="form.isPlayerVisible" class="rounded" />
        <span class="text-label-lg font-semibold text-muted-foreground">VISIBLE TO PLAYERS</span>
        <span class="text-caption text-muted-foreground italic">— players can read this rule in their portal</span>
      </label>

      <!-- Rich text content -->
      <div class="space-y-1.5">
        <label class="text-label-lg font-semibold text-muted-foreground">CONTENT</label>
        <RichTextEditor v-model="form.content" placeholder="Write your rule, table, or system here…" />
      </div>

      <!-- ── Tracker (optional bolt-on) ──────────────────────────────────────── -->
      <div class="rounded-lg border border-border bg-card">
        <!-- Header row -->
        <div class="flex items-center justify-between px-4 py-3">
          <div>
            <span class="text-label-lg font-semibold text-muted-foreground">TRACKER</span>
            <p class="text-caption text-muted-foreground italic mt-0.5">
              Attach a per-player track (like Corruption, Hunger, Sanity) with named levels and DM controls.
            </p>
          </div>
          <AppButton
            v-if="!tracker"
            variant="subtle"
            size="sm"
            :icon="IconAdd"
            label="Add Tracker"
            class="border-dashed"
            @click="addTracker"
          />
          <button
            v-else
            type="button"
            class="text-caption text-muted-foreground hover:text-destructive transition-colors"
            @click="removeTracker"
          >
            Remove
          </button>
        </div>

        <!-- Tracker form (when active) -->
        <div v-if="tracker" class="border-t border-border px-4 py-4 space-y-5">

          <!-- Label + Type -->
          <div class="grid grid-cols-2 gap-3">
            <div class="space-y-1.5">
              <label class="text-eyebrow font-semibold text-muted-foreground">TRACK LABEL</label>
              <input
                v-model="tracker.label"
                type="text"
                placeholder="Corruption, Hunger, Sanity…"
                class="w-full bg-background border border-border rounded px-2.5 py-1.5 text-body text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
              />
            </div>
            <div class="space-y-1.5">
              <label class="text-label font-semibold text-muted-foreground">TYPE</label>
              <select
                v-model="tracker.type"
                class="w-full bg-background border border-border rounded px-2.5 py-1.5 text-body text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                @change="onTypeChange"
              >
                <option value="level">Level — named states (Chilled → Frozen → Hypothermic)</option>
                <option value="points">Points — numeric pool (0–20 Sanity)</option>
              </select>
            </div>
          </div>

          <!-- Min / Max -->
          <div class="grid grid-cols-2 gap-3">
            <div class="space-y-1.5">
              <label class="text-eyebrow font-semibold text-muted-foreground">MIN VALUE</label>
              <input
                v-model.number="tracker.min"
                type="number"
                class="w-full bg-background border border-border rounded px-2.5 py-1.5 text-body text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
              />
            </div>
            <div class="space-y-1.5">
              <label class="text-label font-semibold text-muted-foreground">MAX VALUE</label>
              <input
                v-model.number="tracker.max"
                type="number"
                class="w-full bg-background border border-border rounded px-2.5 py-1.5 text-body text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
              />
            </div>
          </div>

          <!-- ── Levels (type = "level") ──────────────────────────────────── -->
          <div v-if="tracker.type === 'level'" class="space-y-2">
            <div class="flex items-center justify-between">
              <label class="text-eyebrow font-semibold text-muted-foreground">LEVELS</label>
              <AppButton
                variant="ghost"
                size="inline-xs"
                :icon="IconAdd"
                label="Add Level"
                @click="addLevel"
              />
            </div>

            <div
              v-if="!tracker.levels?.length"
              class="text-caption text-muted-foreground italic"
            >
              No levels yet — add one for each named state (e.g. Unaffected, Chilled, Frozen).
            </div>

            <div
              v-for="(lvl, li) in tracker.levels"
              :key="li"
              class="rounded-md border border-border bg-background p-3 space-y-2"
            >
              <!-- Level header row: value, label, color, delete -->
              <div class="flex items-center gap-2">
                <div class="flex flex-col items-center gap-0.5 shrink-0">
                  <span class="font-cinzel text-2xs text-muted-foreground">VAL</span>
                  <input
                    :value="lvl.value"
                    type="text"
                    placeholder="0"
                    title="Number (e.g. 3) or ability modifier (STR, DEX, CON, INT, WIS, CHA)"
                    class="w-12 bg-muted border border-border rounded px-1.5 py-1 font-cinzel text-xs text-foreground text-center focus:outline-none focus:ring-1 focus:ring-ring"
                    @change="lvl.value = parseLevelValue(($event.target as HTMLInputElement).value)"
                  />
                </div>
                <input
                  v-model="lvl.label"
                  type="text"
                  placeholder="Level name"
                  class="flex-1 bg-muted border border-border rounded px-2.5 py-1.5 text-body text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                />
                <select
                  v-model="lvl.color"
                  class="w-24 bg-muted border border-border rounded px-2 py-1.5 text-caption text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                >
                  <option value="">no color</option>
                  <option v-for="c in LEVEL_COLORS" :key="c.value" :value="c.value">{{ c.label }}</option>
                </select>
                <button
                  type="button"
                  class="shrink-0 text-muted-foreground hover:text-destructive transition-colors p-1"
                  @click="removeLevel(li)"
                >
                  <IconClose class="size-3.5" />
                </button>
              </div>

              <!-- Effects on this level -->
              <div class="pl-14 space-y-1">
                <div
                  v-for="(fx, fi) in (lvl.effects ?? [])"
                  :key="fi"
                  class="flex items-center gap-1.5"
                >
                  <select
                    v-model="fx.type"
                    class="bg-muted border border-border rounded px-1.5 py-0.5 text-caption text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                  >
                    <option value="note">Note</option>
                    <option value="speed">Speed penalty</option>
                    <option value="disadvantage_checks">Disadv. ability checks</option>
                    <option value="disadvantage_saves">Disadv. saving throws</option>
                    <option value="exhaustion">Exhaustion level</option>
                    <option value="save">Saving throw</option>
                  </select>
                  <input
                    v-if="fx.type === 'speed'"
                    v-model.number="fx.value"
                    type="number"
                    placeholder="−10"
                    class="w-16 bg-muted border border-border rounded px-1.5 py-0.5 text-caption text-foreground text-right focus:outline-none focus:ring-1 focus:ring-ring"
                  />
                  <input
                    v-if="fx.type === 'exhaustion'"
                    v-model.number="fx.value"
                    type="number"
                    min="1"
                    max="6"
                    placeholder="1"
                    class="w-14 bg-muted border border-border rounded px-1.5 py-0.5 text-caption text-foreground text-center focus:outline-none focus:ring-1 focus:ring-ring"
                  />
                  <input
                    v-if="fx.type === 'disadvantage_checks' || fx.type === 'disadvantage_saves'"
                    v-model="fx.scope"
                    type="text"
                    placeholder="STR,DEX (blank = all)"
                    class="w-36 bg-muted border border-border rounded px-1.5 py-0.5 text-caption text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                  />
                  <!-- Save type: ability + DC formula -->
                  <template v-if="fx.type === 'save'">
                    <select
                      v-model="fx.ability"
                      class="w-16 bg-muted border border-border rounded px-1.5 py-0.5 text-caption text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                    >
                      <option value="">Ability</option>
                      <option v-for="ab in SAVE_ABILITIES" :key="ab.value" :value="ab.value">{{ ab.label }}</option>
                    </select>
                    <span class="font-cinzel text-2xs text-muted-foreground shrink-0">DC</span>
                    <input
                      v-model.number="fx.dcBase"
                      type="number"
                      min="1"
                      placeholder="10"
                      title="Base DC value"
                      class="w-14 bg-muted border border-border rounded px-1.5 py-0.5 text-caption text-foreground text-center focus:outline-none focus:ring-1 focus:ring-ring"
                    />
                    <label class="flex items-center gap-1 shrink-0 cursor-pointer" title="Add current tracker value to DC">
                      <input type="checkbox" v-model="fx.dcAddTracker" class="rounded" />
                      <span class="font-cinzel text-2xs text-muted-foreground">+VAL</span>
                    </label>
                  </template>
                  <input
                    v-if="fx.type !== 'save'"
                    v-model="fx.label"
                    type="text"
                    placeholder="Shown on player sheet"
                    class="flex-1 bg-muted border border-border rounded px-1.5 py-0.5 text-caption text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                  />
                  <button
                    type="button"
                    class="shrink-0 text-muted-foreground hover:text-destructive transition-colors"
                    @click="removeEffect(lvl, fi)"
                  >
                    <IconClose class="size-3" />
                  </button>
                </div>
                <button
                  type="button"
                  class="text-caption-sm text-muted-foreground hover:text-foreground italic transition-colors"
                  @click="addEffect(lvl)"
                >
                  + add effect
                </button>
              </div>
            </div>
          </div>

          <!-- ── DM Buttons ───────────────────────────────────────────────── -->
          <div class="space-y-2">
            <div class="flex items-center justify-between">
              <label class="text-eyebrow font-semibold text-muted-foreground">TRACKER BUTTONS</label>
              <AppButton
                variant="ghost"
                size="inline-xs"
                :icon="IconAdd"
                label="Add Button"
                @click="addButton"
              />
            </div>
            <p class="text-caption text-muted-foreground italic">
              Controls shown in the party panel. "Δ change by" adjusts the current value; "= set to" snaps to an exact value. Toggle "Players" to also show the button in the player portal.
            </p>

            <div
              v-if="!tracker.dmButtons?.length"
              class="text-caption text-muted-foreground italic"
            >
              No buttons yet.
            </div>

            <div
              v-for="(btn, bi) in tracker.dmButtons"
              :key="bi"
              class="flex items-center gap-2"
            >
              <input
                v-model="btn.label"
                type="text"
                placeholder="Add Corruption"
                class="flex-1 min-w-0 bg-background border border-border rounded px-2.5 py-1.5 text-body text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
              />
              <!-- Mode toggle: Δ change by / = set to -->
              <SegmentedControl
                :model-value="btn.mode ?? 'delta'"
                :options="[
                  { value: 'delta', label: 'Δ', tooltip: 'Change by amount' },
                  { value: 'set', label: '=', tooltip: 'Set to exact value' },
                ]"
                size="xs"
                class="shrink-0"
                @update:model-value="btn.mode = $event"
              />
              <!-- Value input -->
              <input
                v-if="!btn.mode || btn.mode === 'delta'"
                v-model.number="btn.delta"
                type="number"
                placeholder="+1"
                class="w-16 shrink-0 bg-background border border-border rounded px-2 py-1.5 text-body text-foreground text-right focus:outline-none focus:ring-1 focus:ring-ring"
              />
              <input
                v-else
                v-model.number="btn.setValue"
                type="number"
                placeholder="0"
                class="w-16 shrink-0 bg-background border border-border rounded px-2 py-1.5 text-body text-foreground text-right focus:outline-none focus:ring-1 focus:ring-ring"
              />
              <!-- Player visibility toggle -->
              <label
                class="flex items-center gap-1 shrink-0 cursor-pointer"
                title="Also show this button to players in their portal"
              >
                <input type="checkbox" v-model="btn.playerVisible" class="rounded" />
                <span class="font-cinzel text-2xs text-muted-foreground">Players</span>
              </label>
              <button
                type="button"
                class="shrink-0 text-muted-foreground hover:text-destructive transition-colors p-1"
                @click="removeButton(bi)"
              >
                <IconClose class="size-3.5" />
              </button>
            </div>
          </div>

        </div>
      </div>

      <!-- Actions -->
      <div class="flex items-center gap-3 pt-2">
        <button
          type="submit"
          :disabled="saving"
          class="inline-flex items-center gap-1.5 rounded-md bg-primary px-4 py-2 text-label-lg font-semibold text-primary-foreground hover:opacity-90 transition-opacity disabled:opacity-50"
        >
          {{ saving ? "Saving…" : "Save Rule" }}
        </button>
        <RouterLink
          to="/rules"
          class="text-body text-muted-foreground hover:text-foreground transition-colors"
        >
          Cancel
        </RouterLink>
        <button
          v-if="!isNew"
          type="button"
          class="ml-auto text-body text-destructive hover:opacity-80 transition-opacity"
          @click="handleDelete"
        >
          Delete
        </button>
      </div>
    </form>
  </PageHeader>
</template>

<script setup lang="ts">
import { ref, computed, watch } from "vue";
import { IconAdd, IconClose } from '@/lib/icons';
import { useConfirm } from "@/composables/useConfirm";
import { useRoute, useRouter } from "vue-router";
import { useRule, useCreateRule, useUpdateRule, useDeleteRule } from "@/composables/useRules";
import RuleSheet from "@/components/rules/RuleSheet.vue";
import { RULE_CATEGORIES } from "@/types/rule.types";
import type { TrackerDef, TrackerLevel, DmButton, AbilityCode } from "@/types/rule.types";
import PageHeader from "@/components/common/PageHeader.vue";
import LoadingSpinner from "@/components/common/LoadingSpinner.vue";
import RichTextEditor from "@/components/common/RichTextEditor.vue";
import TagInput from "@/components/common/TagInput.vue";
import AppButton from "@/components/common/AppButton.vue";
import SegmentedControl from "@/components/common/SegmentedControl.vue";

const SAVE_ABILITIES = [
  { value: "STR", label: "STR" },
  { value: "DEX", label: "DEX" },
  { value: "CON", label: "CON" },
  { value: "INT", label: "INT" },
  { value: "WIS", label: "WIS" },
  { value: "CHA", label: "CHA" },
] as const;

const LEVEL_COLORS = [
  { value: "green",  label: "Green"  },
  { value: "yellow", label: "Yellow" },
  { value: "orange", label: "Orange" },
  { value: "red",    label: "Red"    },
  { value: "blue",   label: "Blue"   },
  { value: "purple", label: "Purple" },
] as const;

const route  = useRoute();
const router = useRouter();
const isNew  = computed(() => route.name === "rule-new");
const isEditing = computed(() => route.query.edit === "true");
const id     = computed(() => (isNew.value ? "" : (route.params.id as string)));

function onCancel() {
  const q = { ...route.query };
  delete q.edit;
  router.push({ query: q });
}

const { data: rule, isLoading: ruleLoading } = useRule(id);
const isLoading = computed(() => !isNew.value && ruleLoading.value);

const createRule = useCreateRule();
const updateRule = useUpdateRule();
const deleteRule = useDeleteRule();
const { confirm } = useConfirm();
const saving = ref(false);

const form = ref({
  title: "",
  category: "" as string,
  content: null as string | null,
  isPlayerVisible: false,
});
const tags = ref<string[]>([]);
const tracker = ref<TrackerDef | null>(null);

watch(rule, (r) => {
  if (!r) return;
  form.value.title           = r.title;
  form.value.category        = r.category ?? "";
  form.value.content         = r.content ? JSON.stringify(r.content) : null;
  form.value.isPlayerVisible = r.is_player_visible ?? false;
  tags.value                 = [...r.tags];
  tracker.value              = r.tracker ? JSON.parse(JSON.stringify(r.tracker)) : null;
}, { immediate: true });

// ── Tracker builder helpers ──────────────────────────────────────────────────

function addTracker() {
  tracker.value = {
    label: "",
    type: "level",
    min: 0,
    max: 4,
    levels: [],
    dmButtons: [],
  };
}

function removeTracker() {
  tracker.value = null;
}

function onTypeChange() {
  if (!tracker.value) return;
  // Clear levels when switching away from "level" type; they're irrelevant for "points".
  if (tracker.value.type === "points") {
    tracker.value.levels = undefined;
  } else {
    tracker.value.levels = tracker.value.levels ?? [];
  }
}

const ABILITY_CODES = new Set(["STR", "DEX", "CON", "INT", "WIS", "CHA"]);

function parseLevelValue(raw: string): number | AbilityCode {
  const upper = raw.trim().toUpperCase();
  if (ABILITY_CODES.has(upper)) return upper as AbilityCode;
  const n = Number(raw);
  return isNaN(n) ? 0 : n;
}

function addLevel() {
  if (!tracker.value) return;
  tracker.value.levels ??= [];
  const numericVals = tracker.value.levels
    .map((l) => l.value)
    .filter((v): v is number => typeof v === "number");
  const nextVal = numericVals.length ? Math.max(...numericVals) + 1 : tracker.value.min;
  tracker.value.levels.push({ value: nextVal, label: "", color: undefined, effects: [] });
}

function removeLevel(idx: number) {
  tracker.value?.levels?.splice(idx, 1);
}

function addEffect(lvl: TrackerLevel) {
  lvl.effects ??= [];
  lvl.effects.push({ type: "note", label: "" });
}

function removeEffect(lvl: TrackerLevel, idx: number) {
  lvl.effects?.splice(idx, 1);
}

function addButton() {
  if (!tracker.value) return;
  tracker.value.dmButtons ??= [];
  tracker.value.dmButtons.push({ label: "", mode: "delta", delta: 1 } satisfies DmButton);
}

function removeButton(idx: number) {
  tracker.value?.dmButtons?.splice(idx, 1);
}

// ── Save / Delete ────────────────────────────────────────────────────────────

async function handleSave() {
  saving.value = true;
  try {
    const payload = {
      title:             form.value.title,
      category:          form.value.category || null,
      content:           form.value.content ? JSON.parse(form.value.content) : null,
      is_player_visible: form.value.isPlayerVisible,
      tags:              tags.value,
      tracker:           tracker.value,
    };
    if (isNew.value) {
      await createRule.mutateAsync(payload);
    } else {
      await updateRule.mutateAsync({ id: id.value, update: payload });
    }
    router.push("/rules");
  } finally {
    saving.value = false;
  }
}

async function handleDelete() {
  if (!await confirm(`Delete "${rule.value?.title}"? This cannot be undone.`)) return;
  await deleteRule.mutateAsync(id.value);
  router.push("/rules");
}
</script>
