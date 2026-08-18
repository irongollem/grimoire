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
        <AppInput
          v-model="form.title"
          tone="card"
          size="body"
          placeholder="e.g. Corruption Track, Icy Weather Rules…"
          required
        />
      </div>

      <!-- Category + Tags row -->
      <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div class="space-y-1.5">
          <label class="text-label-lg font-semibold text-muted-foreground">CATEGORY</label>
          <AppSelect v-model="form.category" size="body" block>
            <option value="">None</option>
            <option v-for="cat in RULE_CATEGORIES" :key="cat" :value="cat">{{ cat }}</option>
          </AppSelect>
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
          <AppButton
            v-else
            variant="ghost"
            size="inline-xs"
            label="Remove"
            class="text-caption hover:text-destructive"
            @click="removeTracker"
          />
        </div>

        <!-- Tracker form (when active) -->
        <div v-if="tracker" class="border-t border-border px-4 py-4 space-y-5">

          <!-- Label + Type -->
          <div class="grid grid-cols-2 gap-3">
            <div class="space-y-1.5">
              <label class="text-eyebrow font-semibold text-muted-foreground">TRACK LABEL</label>
              <AppInput
                v-model="tracker.label"
                tone="default"
                size="body"
                placeholder="Corruption, Hunger, Sanity…"
              />
            </div>
            <div class="space-y-1.5">
              <label class="text-label font-semibold text-muted-foreground">TYPE</label>
              <AppSelect
                v-model="tracker.type"
                size="body"
                block
                class="bg-background"
                @change="onTypeChange"
              >
                <option value="level">Level — named states (Chilled → Frozen → Hypothermic)</option>
                <option value="points">Points — numeric pool (0–20 Sanity)</option>
              </AppSelect>
            </div>
          </div>

          <!-- Min / Max -->
          <div class="grid grid-cols-2 gap-3">
            <div class="space-y-1.5">
              <label class="text-eyebrow font-semibold text-muted-foreground">MIN VALUE</label>
              <AppInput v-model.number="tracker.min" type="number" tone="default" size="body" />
            </div>
            <div class="space-y-1.5">
              <label class="text-label font-semibold text-muted-foreground">MAX VALUE</label>
              <AppInput v-model.number="tracker.max" type="number" tone="default" size="body" />
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
                <AppInput
                  v-model="lvl.label"
                  tone="muted"
                  size="body"
                  :block="false"
                  class="flex-1"
                  placeholder="Level name"
                />
                <AppSelect
                  :model-value="lvl.color ?? null"
                  size="sm"
                  class="bg-muted w-24"
                  @update:model-value="(v) => (lvl.color = v ?? undefined)"
                >
                  <option :value="null">no color</option>
                  <option v-for="c in LEVEL_COLORS" :key="c.value" :value="c.value">{{ c.label }}</option>
                </AppSelect>
                <AppButton
                  variant="ghost"
                  size="icon-xs"
                  class="shrink-0 hover:text-destructive"
                  :icon="IconClose"
                  @click="removeLevel(li)"
                />
              </div>

              <!-- Effects on this level -->
              <div class="pl-14 space-y-1">
                <div
                  v-for="(fx, fi) in (lvl.effects ?? [])"
                  :key="fi"
                  class="flex items-center gap-1.5"
                >
                  <AppSelect v-model="fx.type" size="xs" class="bg-muted">
                    <option value="note">Note</option>
                    <option value="speed">Speed penalty</option>
                    <option value="disadvantage_checks">Disadv. ability checks</option>
                    <option value="disadvantage_saves">Disadv. saving throws</option>
                    <option value="exhaustion">Exhaustion level</option>
                    <option value="save">Saving throw</option>
                  </AppSelect>
                  <AppInput
                    v-if="fx.type === 'speed'"
                    :model-value="fx.value ?? null"
                    type="number"
                    size="xs"
                    tone="muted"
                    :block="false"
                    class="w-16 text-right"
                    placeholder="−10"
                    @update:model-value="(v) => (fx.value = numOrUndef(v))"
                  />
                  <AppInput
                    v-if="fx.type === 'exhaustion'"
                    :model-value="fx.value ?? null"
                    type="number"
                    size="xs"
                    tone="muted"
                    align="center"
                    :block="false"
                    class="w-14"
                    min="1"
                    max="6"
                    placeholder="1"
                    @update:model-value="(v) => (fx.value = numOrUndef(v))"
                  />
                  <AppInput
                    v-if="fx.type === 'disadvantage_checks' || fx.type === 'disadvantage_saves'"
                    :model-value="fx.scope ?? null"
                    type="text"
                    size="xs"
                    tone="muted"
                    :block="false"
                    class="w-36"
                    placeholder="STR,DEX (blank = all)"
                    @update:model-value="(v) => (fx.scope = strOrUndef(v))"
                  />
                  <!-- Save type: ability + DC formula -->
                  <template v-if="fx.type === 'save'">
                    <AppSelect
                      :model-value="fx.ability ?? null"
                      size="xs"
                      class="bg-muted w-16"
                      @update:model-value="(v) => (fx.ability = v ?? undefined)"
                    >
                      <option :value="null">Ability</option>
                      <option v-for="ab in SAVE_ABILITIES" :key="ab.value" :value="ab.value">{{ ab.label }}</option>
                    </AppSelect>
                    <span class="font-cinzel text-2xs text-muted-foreground shrink-0">DC</span>
                    <AppInput
                      :model-value="fx.dcBase ?? null"
                      type="number"
                      size="xs"
                      tone="muted"
                      align="center"
                      :block="false"
                      class="w-14"
                      min="1"
                      placeholder="10"
                      title="Base DC value"
                      @update:model-value="(v) => (fx.dcBase = numOrUndef(v))"
                    />
                    <label class="flex items-center gap-1 shrink-0 cursor-pointer" title="Add current tracker value to DC">
                      <input type="checkbox" v-model="fx.dcAddTracker" class="rounded" />
                      <span class="font-cinzel text-2xs text-muted-foreground">+VAL</span>
                    </label>
                  </template>
                  <AppInput
                    v-if="fx.type !== 'save'"
                    v-model="fx.label"
                    type="text"
                    size="xs"
                    tone="muted"
                    :block="false"
                    class="flex-1"
                    placeholder="Shown on player sheet"
                  />
                  <AppButton
                    variant="ghost"
                    size="icon-xs"
                    class="shrink-0 hover:text-destructive"
                    :icon="IconClose"
                    @click="removeEffect(lvl, fi)"
                  />
                </div>
                <AppButton
                  variant="ghost"
                  size="inline-xs"
                  label="+ add effect"
                  class="text-caption-sm italic"
                  @click="addEffect(lvl)"
                />
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
              <AppInput
                v-model="btn.label"
                type="text"
                tone="default"
                size="body"
                :block="false"
                class="flex-1 min-w-0"
                placeholder="Add Corruption"
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
              <AppInput
                v-if="!btn.mode || btn.mode === 'delta'"
                v-model.number="btn.delta"
                type="number"
                tone="default"
                size="body"
                :block="false"
                class="w-16 shrink-0 text-right"
                placeholder="+1"
              />
              <AppInput
                v-else
                :model-value="btn.setValue ?? null"
                type="number"
                tone="default"
                size="body"
                :block="false"
                class="w-16 shrink-0 text-right"
                placeholder="0"
                @update:model-value="(v) => (btn.setValue = numOrUndef(v))"
              />
              <!-- Player visibility toggle -->
              <label
                class="flex items-center gap-1 shrink-0 cursor-pointer"
                title="Also show this button to players in their portal"
              >
                <input type="checkbox" v-model="btn.playerVisible" class="rounded" />
                <span class="font-cinzel text-2xs text-muted-foreground">Players</span>
              </label>
              <AppButton
                variant="ghost"
                size="icon-xs"
                class="shrink-0 hover:text-destructive"
                :icon="IconClose"
                @click="removeButton(bi)"
              />
            </div>
          </div>

        </div>
      </div>

      <!-- Actions -->
      <div class="flex items-center gap-3 pt-2">
        <AppButton
          type="submit"
          variant="primary"
          size="md"
          :disabled="saving"
          :label="saving ? 'Saving…' : 'Save Rule'"
        />
        <RouterLink
          to="/rules"
          class="text-body text-muted-foreground hover:text-foreground transition-colors"
        >
          Cancel
        </RouterLink>
        <AppButton
          v-if="!isNew"
          variant="ghost"
          size="inline"
          label="Delete"
          class="ml-auto text-body text-destructive hover:text-destructive/70"
          @click="handleDelete"
        />
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
import AppInput from "@/components/common/AppInput.vue";
import AppSelect from "@/components/common/AppSelect.vue";
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

// AppInput's model is fixed to `string | number | null` (no `undefined`), while
// several tracker-effect fields are optional. These bridge AppInput's "no value"
// sentinel (`null`, or `""` when the .number modifier isn't in play) back to the
// `undefined` the domain types actually use.
function numOrUndef(v: string | number | null): number | undefined {
  if (v === null || v === "") return undefined;
  return Number(v);
}

function strOrUndef(v: string | number | null): string | undefined {
  if (v === null || v === "") return undefined;
  return String(v);
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
