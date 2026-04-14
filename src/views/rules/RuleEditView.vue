<template>
  <PageHeader
    :title="isNew ? 'New Rule' : (rule?.title || 'Loading…')"
    description="Custom rule, system, or table"
  >
    <div v-if="isLoading" class="flex justify-center py-16">
      <LoadingSpinner />
    </div>

    <form v-else class="max-w-3xl space-y-5" @submit.prevent="handleSave">
      <!-- Title -->
      <div class="space-y-1.5">
        <label class="font-cinzel text-xs font-semibold tracking-wider text-muted-foreground">TITLE</label>
        <input
          v-model="form.title"
          type="text"
          placeholder="e.g. Corruption Track, Icy Weather Rules…"
          required
          class="w-full bg-card border border-border rounded-md px-3 py-2 font-fell text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
        />
      </div>

      <!-- Category + Tags row -->
      <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div class="space-y-1.5">
          <label class="font-cinzel text-xs font-semibold tracking-wider text-muted-foreground">CATEGORY</label>
          <select
            v-model="form.category"
            class="w-full bg-card border border-border rounded-md px-3 py-2 font-fell text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
          >
            <option value="">None</option>
            <option v-for="cat in RULE_CATEGORIES" :key="cat" :value="cat">{{ cat }}</option>
          </select>
        </div>

        <div class="space-y-1.5">
          <label class="font-cinzel text-xs font-semibold tracking-wider text-muted-foreground">TAGS</label>
          <TagInput v-model="tags" />
        </div>
      </div>

      <!-- Player visibility -->
      <label class="flex items-center gap-2 cursor-pointer select-none">
        <input type="checkbox" v-model="form.isPlayerVisible" class="rounded" />
        <span class="font-cinzel text-xs font-semibold text-muted-foreground tracking-wider">VISIBLE TO PLAYERS</span>
        <span class="font-fell text-xs text-muted-foreground italic">— players can read this rule in their portal</span>
      </label>

      <!-- Rich text content -->
      <div class="space-y-1.5">
        <label class="font-cinzel text-xs font-semibold tracking-wider text-muted-foreground">CONTENT</label>
        <RichTextEditor v-model="form.content" placeholder="Write your rule, table, or system here…" />
      </div>

      <!-- ── Tracker (optional bolt-on) ──────────────────────────────────────── -->
      <div class="rounded-lg border border-border bg-card">
        <!-- Header row -->
        <div class="flex items-center justify-between px-4 py-3">
          <div>
            <span class="font-cinzel text-xs font-semibold tracking-wider text-muted-foreground">TRACKER</span>
            <p class="font-fell text-[11px] text-muted-foreground italic mt-0.5">
              Attach a per-player track (like Corruption, Hunger, Sanity) with named levels and DM controls.
            </p>
          </div>
          <button
            v-if="!tracker"
            type="button"
            class="inline-flex items-center gap-1 rounded-md border border-dashed border-border px-2.5 py-1 font-cinzel text-[11px] text-muted-foreground hover:text-foreground hover:border-primary/50 transition-colors"
            @click="addTracker"
          >
            <Plus class="size-3" /> Add Tracker
          </button>
          <button
            v-else
            type="button"
            class="font-fell text-xs text-muted-foreground hover:text-destructive transition-colors"
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
              <label class="font-cinzel text-[10px] font-semibold tracking-wider text-muted-foreground">TRACK LABEL</label>
              <input
                v-model="tracker.label"
                type="text"
                placeholder="Corruption, Hunger, Sanity…"
                class="w-full bg-background border border-border rounded px-2.5 py-1.5 font-fell text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
              />
            </div>
            <div class="space-y-1.5">
              <label class="font-cinzel text-[10px] font-semibold tracking-wider text-muted-foreground">TYPE</label>
              <select
                v-model="tracker.type"
                class="w-full bg-background border border-border rounded px-2.5 py-1.5 font-fell text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
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
              <label class="font-cinzel text-[10px] font-semibold tracking-wider text-muted-foreground">MIN VALUE</label>
              <input
                v-model.number="tracker.min"
                type="number"
                class="w-full bg-background border border-border rounded px-2.5 py-1.5 font-fell text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
              />
            </div>
            <div class="space-y-1.5">
              <label class="font-cinzel text-[10px] font-semibold tracking-wider text-muted-foreground">MAX VALUE</label>
              <input
                v-model.number="tracker.max"
                type="number"
                class="w-full bg-background border border-border rounded px-2.5 py-1.5 font-fell text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
              />
            </div>
          </div>

          <!-- ── Levels (type = "level") ──────────────────────────────────── -->
          <div v-if="tracker.type === 'level'" class="space-y-2">
            <div class="flex items-center justify-between">
              <label class="font-cinzel text-[10px] font-semibold tracking-wider text-muted-foreground">LEVELS</label>
              <button
                type="button"
                class="inline-flex items-center gap-1 font-cinzel text-[10px] text-muted-foreground hover:text-foreground transition-colors"
                @click="addLevel"
              >
                <Plus class="size-3" /> Add Level
              </button>
            </div>

            <div
              v-if="!tracker.levels?.length"
              class="font-fell text-xs text-muted-foreground italic"
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
                  <span class="font-cinzel text-[9px] text-muted-foreground">VAL</span>
                  <input
                    v-model.number="lvl.value"
                    type="number"
                    class="w-12 bg-muted border border-border rounded px-1.5 py-1 font-cinzel text-xs text-foreground text-center focus:outline-none focus:ring-1 focus:ring-ring"
                  />
                </div>
                <input
                  v-model="lvl.label"
                  type="text"
                  placeholder="Level name"
                  class="flex-1 bg-muted border border-border rounded px-2.5 py-1.5 font-fell text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                />
                <select
                  v-model="lvl.color"
                  class="w-24 bg-muted border border-border rounded px-2 py-1.5 font-fell text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                >
                  <option value="">no color</option>
                  <option v-for="c in LEVEL_COLORS" :key="c.value" :value="c.value">{{ c.label }}</option>
                </select>
                <button
                  type="button"
                  class="shrink-0 text-muted-foreground hover:text-destructive transition-colors p-1"
                  @click="removeLevel(li)"
                >
                  <X class="size-3.5" />
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
                    class="bg-muted border border-border rounded px-1.5 py-0.5 font-fell text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                  >
                    <option value="note">Note</option>
                    <option value="speed">Speed penalty</option>
                    <option value="disadvantage_checks">Disadv. ability checks</option>
                    <option value="disadvantage_saves">Disadv. saving throws</option>
                    <option value="exhaustion">Exhaustion level</option>
                  </select>
                  <input
                    v-if="fx.type === 'speed'"
                    v-model.number="fx.value"
                    type="number"
                    placeholder="−10"
                    class="w-16 bg-muted border border-border rounded px-1.5 py-0.5 font-fell text-xs text-foreground text-right focus:outline-none focus:ring-1 focus:ring-ring"
                  />
                  <input
                    v-if="fx.type === 'exhaustion'"
                    v-model.number="fx.value"
                    type="number"
                    min="1"
                    max="6"
                    placeholder="1"
                    class="w-14 bg-muted border border-border rounded px-1.5 py-0.5 font-fell text-xs text-foreground text-center focus:outline-none focus:ring-1 focus:ring-ring"
                  />
                  <input
                    v-if="fx.type === 'disadvantage_checks' || fx.type === 'disadvantage_saves'"
                    v-model="fx.scope"
                    type="text"
                    placeholder="STR,DEX (blank = all)"
                    class="w-36 bg-muted border border-border rounded px-1.5 py-0.5 font-fell text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                  />
                  <input
                    v-model="fx.label"
                    type="text"
                    placeholder="Shown on player sheet"
                    class="flex-1 bg-muted border border-border rounded px-1.5 py-0.5 font-fell text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                  />
                  <button
                    type="button"
                    class="shrink-0 text-muted-foreground hover:text-destructive transition-colors"
                    @click="removeEffect(lvl, fi)"
                  >
                    <X class="size-3" />
                  </button>
                </div>
                <button
                  type="button"
                  class="font-fell text-[10px] text-muted-foreground hover:text-foreground italic transition-colors"
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
              <label class="font-cinzel text-[10px] font-semibold tracking-wider text-muted-foreground">DM BUTTONS</label>
              <button
                type="button"
                class="inline-flex items-center gap-1 font-cinzel text-[10px] text-muted-foreground hover:text-foreground transition-colors"
                @click="addButton"
              >
                <Plus class="size-3" /> Add Button
              </button>
            </div>
            <p class="font-fell text-[11px] text-muted-foreground italic">
              Manual controls shown in the DM's party panel (e.g. "Add Corruption +1", "Cleanse −1").
            </p>

            <div
              v-if="!tracker.dmButtons?.length"
              class="font-fell text-xs text-muted-foreground italic"
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
                class="flex-1 bg-background border border-border rounded px-2.5 py-1.5 font-fell text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
              />
              <div class="flex items-center gap-1 shrink-0">
                <span class="font-cinzel text-[10px] text-muted-foreground">Δ</span>
                <input
                  v-model.number="btn.delta"
                  type="number"
                  placeholder="+1"
                  class="w-16 bg-background border border-border rounded px-2 py-1.5 font-fell text-sm text-foreground text-right focus:outline-none focus:ring-1 focus:ring-ring"
                />
              </div>
              <button
                type="button"
                class="shrink-0 text-muted-foreground hover:text-destructive transition-colors p-1"
                @click="removeButton(bi)"
              >
                <X class="size-3.5" />
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
          class="inline-flex items-center gap-1.5 rounded-md bg-primary px-4 py-2 font-cinzel text-xs font-semibold text-primary-foreground tracking-wider hover:opacity-90 transition-opacity disabled:opacity-50"
        >
          {{ saving ? "Saving…" : "Save Rule" }}
        </button>
        <RouterLink
          to="/rules"
          class="font-fell text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          Cancel
        </RouterLink>
        <button
          v-if="!isNew"
          type="button"
          class="ml-auto font-fell text-sm text-destructive hover:opacity-80 transition-opacity"
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
import { Plus, X } from "lucide-vue-next";
import { useConfirm } from "@/composables/useConfirm";
import { useRoute, useRouter } from "vue-router";
import { useRule, useCreateRule, useUpdateRule, useDeleteRule } from "@/composables/useRules";
import { RULE_CATEGORIES } from "@/types/rule.types";
import type { TrackerDef, TrackerLevel, DmButton } from "@/types/rule.types";
import PageHeader from "@/components/common/PageHeader.vue";
import LoadingSpinner from "@/components/common/LoadingSpinner.vue";
import RichTextEditor from "@/components/common/RichTextEditor.vue";
import TagInput from "@/components/common/TagInput.vue";

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
const id     = computed(() => (isNew.value ? "" : (route.params.id as string)));

const { data: rule, isLoading: ruleLoading } = useRule(id.value);
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

function addLevel() {
  if (!tracker.value) return;
  tracker.value.levels ??= [];
  const nextVal = tracker.value.levels.length
    ? Math.max(...tracker.value.levels.map((l) => l.value)) + 1
    : tracker.value.min;
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
  tracker.value.dmButtons.push({ label: "", delta: 1 } satisfies DmButton);
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
