<template>
  <div>
    <!-- Action bar -->
    <div class="flex items-center justify-between gap-2 mb-4">
      <h2 class="text-heading font-bold text-foreground">
        {{ isNew ? "New Roll Table" : table?.name || form.name || "Loading…" }}
      </h2>
      <div class="flex items-center gap-2">
        <!-- View mode actions -->
        <template v-if="!isNew && !editMode">
          <button
            type="button"
            :disabled="isDeleting"
            class="px-3 py-1.5 text-label-lg font-semibold text-destructive border border-destructive/40 rounded-md hover:bg-destructive/10 transition-colors disabled:opacity-50"
            @click="onDelete"
          >{{ isDeleting ? "Deleting…" : "Delete" }}</button>
          <button
            type="button"
            class="inline-flex items-center gap-1.5 rounded-md bg-primary px-4 py-2 text-label-lg font-semibold text-primary-foreground hover:opacity-90 transition-opacity"
            @click="editMode = true"
          >
            <IconEdit class="size-3.5" />
            Edit
          </button>
        </template>
        <!-- Edit mode actions -->
        <template v-else-if="!isNew">
          <button
            type="button"
            class="font-cinzel text-xs text-muted-foreground hover:text-foreground transition-colors"
            @click="editMode = false"
          >
            Cancel
          </button>
          <button
            type="button"
            :disabled="saving || !form.name.trim() || rangeError !== null"
            :title="rangeError ?? undefined"
            class="inline-flex items-center gap-1.5 rounded-md bg-primary px-4 py-2 text-label-lg font-semibold text-primary-foreground hover:opacity-90 transition-opacity disabled:opacity-50"
            @click="onSave"
          >
            {{ saving ? "Saving…" : "Save" }}
          </button>
        </template>
        <!-- New table: just Save/Create -->
        <template v-else>
          <button
            type="button"
            :disabled="saving || !form.name.trim() || rangeError !== null"
            :title="rangeError ?? undefined"
            class="inline-flex items-center gap-1.5 rounded-md bg-primary px-4 py-2 text-label-lg font-semibold text-primary-foreground hover:opacity-90 transition-opacity disabled:opacity-50"
            @click="onSave"
          >
            {{ saving ? "Saving…" : "Create" }}
          </button>
        </template>
      </div>
    </div>

    <div v-if="loading" class="flex justify-center py-16">
      <LoadingSpinner />
    </div>

    <div v-else class="grid grid-cols-1 lg:grid-cols-[1fr_20rem] gap-6">
      <!-- ── Left column ─────────────────────────────────────────────────────── -->
      <div class="flex flex-col gap-4">

        <!-- ── VIEW MODE ──────────────────────────────────────────────────── -->
        <template v-if="!isNew && !editMode && table">
          <!-- Description -->
          <p v-if="table.description" class="text-body text-muted-foreground italic">{{ table.description }}</p>

          <!-- Entry list (read-only) -->
          <div class="space-y-2">
            <div class="flex items-center justify-between">
              <h3 class="font-cinzel text-sm font-bold text-foreground">Entries ({{ table.entries.length }})</h3>
              <span class="text-label text-muted-foreground">{{ table.dice }}</span>
            </div>

            <div v-if="!table.entries.length" class="rounded-md border border-dashed border-border px-4 py-8 text-center text-body text-muted-foreground italic">
              No entries yet.
            </div>

            <div v-else class="flex flex-col gap-1.5">
              <div
                v-for="entry in table.entries"
                :key="entry.id"
                class="flex items-start gap-3 rounded-md border border-border bg-card px-3 py-2"
              >
                <!-- Range badge -->
                <span class="shrink-0 font-cinzel text-xs font-bold text-primary/80 bg-primary/10 rounded px-2 py-0.5 min-w-12 text-center">
                  {{ entry.min === entry.max ? entry.min : `${entry.min}–${entry.max}` }}
                </span>
                <div class="flex-1 min-w-0 flex flex-col gap-1">
                  <span class="text-body text-foreground">{{ entry.label || '—' }}</span>
                  <RouterLink
                    v-if="entry.encounter_id"
                    :to="`/encounters/${entry.encounter_id}`"
                    class="inline-flex items-center gap-1 font-cinzel text-xs font-semibold text-primary hover:underline self-start"
                  >
                    Open encounter →
                  </RouterLink>
                  <p v-if="entry.notes" class="text-caption text-muted-foreground italic">{{ entry.notes }}</p>
                </div>
              </div>
            </div>
          </div>

          <!-- Tags -->
          <div v-if="table.tags.length" class="flex flex-wrap gap-1">
            <span
              v-for="tag in table.tags"
              :key="tag"
              class="text-label bg-muted/40 text-muted-foreground rounded px-2 py-0.5"
            >{{ tag }}</span>
          </div>

          <!-- DM Notes -->
          <p v-if="table.notes" class="text-body text-muted-foreground italic border-t border-border pt-3">{{ table.notes }}</p>
        </template>

        <!-- ── EDIT MODE ───────────────────────────────────────────────── -->
        <template v-else>
          <div class="grid grid-cols-1 md:grid-cols-[1fr_8.75rem] gap-3">
            <div class="space-y-1.5">
              <label class="text-eyebrow font-semibold text-muted-foreground">Name</label>
              <input
                v-model="form.name"
                required
                placeholder="Forest Road — Daytime"
                class="w-full bg-card border border-border rounded-md px-3 py-2 text-heading font-bold text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
              />
            </div>
            <div class="space-y-1.5">
              <label class="text-eyebrow font-semibold text-muted-foreground">Die</label>
              <select
                v-model="form.dice"
                class="w-full bg-card border border-border rounded-md px-3 py-2 text-body text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                @change="onDieChange"
              >
                <option v-for="d in ROLL_TABLE_DICE" :key="d" :value="d">{{ d }}</option>
              </select>
            </div>
          </div>

          <div class="space-y-1.5">
            <label class="text-eyebrow font-semibold text-muted-foreground">Description</label>
            <textarea
              v-model="form.description"
              rows="2"
              placeholder="When + where to use this table"
              class="w-full bg-card border border-border rounded-md px-3 py-2 text-body text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring resize-y"
            />
          </div>

          <!-- Entries -->
          <div class="space-y-2">
            <div class="flex items-center justify-between">
              <h2 class="font-cinzel text-sm font-bold text-foreground">Entries ({{ form.entries.length }})</h2>
              <button
                type="button"
                class="inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-2.5 py-1.5 font-cinzel text-xs font-semibold text-muted-foreground hover:text-foreground hover:border-primary/50 transition-colors"
                @click="addEntry"
              >
                <IconAdd class="size-3.5" />
                Add row
              </button>
            </div>

            <p v-if="rangeError" class="text-caption text-destructive italic">{{ rangeError }}</p>

            <div v-if="!form.entries.length" class="rounded-md border border-dashed border-border px-4 py-8 text-center text-body text-muted-foreground italic">
              No entries yet. Add some rows then assign roll ranges.
            </div>

            <div v-else class="flex flex-col gap-2">
              <div
                v-for="(entry, idx) in form.entries"
                :key="entry.id"
                class="grid grid-cols-[5rem_1fr_auto] gap-2 items-start rounded-md border border-border bg-card p-2"
              >
                <div class="flex items-center gap-1">
                  <input
                    v-model.number="entry.min"
                    type="number"
                    :min="1"
                    :max="dieMax"
                    class="w-9 bg-muted border border-border rounded px-1 py-1 text-caption text-foreground text-center focus:outline-none focus:ring-1 focus:ring-ring"
                  />
                  <span class="text-caption text-muted-foreground">–</span>
                  <input
                    v-model.number="entry.max"
                    type="number"
                    :min="entry.min"
                    :max="dieMax"
                    class="w-9 bg-muted border border-border rounded px-1 py-1 text-caption text-foreground text-center focus:outline-none focus:ring-1 focus:ring-ring"
                  />
                </div>
                <div class="flex flex-col gap-1.5 min-w-0">
                  <input
                    v-model="entry.label"
                    placeholder="What happens?"
                    class="w-full bg-muted border border-border rounded px-2 py-1 text-body text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                  />
                  <EntityCombobox
                    :model-value="entry.encounter_id ?? ''"
                    :options="encounterOptions"
                    placeholder="Link encounter…"
                    @update:model-value="entry.encounter_id = $event || null"
                  />
                </div>
                <button
                  type="button"
                  class="text-muted-foreground hover:text-destructive transition-colors p-1 mt-0.5"
                  title="Remove entry"
                  @click="removeEntry(idx)"
                >
                  <IconDelete class="size-3.5" />
                </button>
                <textarea
                  v-if="entry.notes !== null && entry.notes !== undefined"
                  v-model="entry.notes"
                  rows="1"
                  placeholder="Notes (optional)"
                  class="col-span-3 w-full bg-muted border border-border rounded px-2 py-1 text-caption text-muted-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring resize-y"
                />
                <button
                  v-else
                  type="button"
                  class="col-span-3 text-left text-caption-sm text-muted-foreground hover:text-foreground italic"
                  @click="entry.notes = ''"
                >
                  + add note
                </button>
              </div>
            </div>
          </div>

          <div class="space-y-1.5">
            <label class="text-eyebrow font-semibold text-muted-foreground">Tags</label>
            <TagInput v-model="form.tags" />
          </div>

          <div class="space-y-1.5">
            <label class="text-eyebrow font-semibold text-muted-foreground">DM Notes</label>
            <textarea
              v-model="form.notes"
              rows="3"
              placeholder="When to roll, suggested cadence, special rules"
              class="w-full bg-card border border-border rounded-md px-3 py-2 text-body text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring resize-y"
            />
          </div>
        </template>
      </div>

      <!-- ── Right: roll panel ────────────────────────────────────────────── -->
      <div class="self-start">
        <div class="rounded-lg border border-border bg-card p-4 flex flex-col gap-3">
          <h3 class="font-cinzel text-sm font-bold tracking-wider text-foreground">Roll {{ form.dice }}</h3>
          <button
            type="button"
            :disabled="!rollableEntries.length || rangeError !== null"
            :title="rangeError ?? undefined"
            class="inline-flex items-center justify-center gap-1.5 rounded-md bg-primary px-4 py-2 text-label-lg font-semibold text-primary-foreground hover:opacity-90 transition-opacity disabled:opacity-50"
            @click="onRoll"
          >
            <IconDiceRoll class="size-3.5" />
            Roll
          </button>

          <div v-if="lastRoll" class="rounded-md border border-border bg-muted/40 p-3 flex flex-col gap-1.5">
            <div class="flex items-center justify-between">
              <span class="text-eyebrow font-semibold text-muted-foreground">Result</span>
              <span class="text-title font-bold text-primary">{{ lastRoll.rolled }}</span>
            </div>
            <template v-if="lastRoll.entry">
              <div class="font-cinzel text-sm text-foreground font-bold">{{ lastRoll.entry.label }}</div>
              <RouterLink
                v-if="lastRoll.entry.encounter_id"
                :to="`/encounters/${lastRoll.entry.encounter_id}`"
                class="inline-flex items-center gap-1 font-cinzel text-xs font-semibold text-primary hover:underline"
              >
                Open encounter →
              </RouterLink>
              <p v-if="lastRoll.entry.notes" class="text-caption text-muted-foreground italic mt-1">{{ lastRoll.entry.notes }}</p>
            </template>
            <p v-else class="text-caption text-muted-foreground italic">No entry covers this result.</p>
          </div>

          <p class="text-caption-sm text-muted-foreground italic">
            {{ rollableEntries.length }} entries · die range 1–{{ dieMax }}
          </p>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch } from "vue";
import { useRoute, useRouter, RouterLink } from "vue-router";
import { IconAdd, IconDelete, IconDiceRoll, IconEdit } from '@/lib/icons';
import { useConfirm } from "@/composables/useConfirm";
import {
  useRollTable,
  useCreateRollTable,
  useUpdateRollTable,
  useDeleteRollTable,
} from "@/composables/useRollTables";
import { useEncounters } from "@/composables/useEncounters";
import {
  ROLL_TABLE_DICE,
  ROLL_TABLE_DIE_MAX,
  validateEntryRanges,
  type RollTableDie,
  type RollTableEntry,
  type RollTableInsert,
} from "@/types/rollTable.types";
import { rollOnTable, type RollTableRollResult } from "@/lib/rollTableRoll";
import LoadingSpinner from "@/components/common/LoadingSpinner.vue";
import EntityCombobox from "@/components/common/EntityCombobox.vue";
import TagInput from "@/components/common/TagInput.vue";

const props = defineProps<{
  /** ID of an existing table to edit. Omit for new-table mode. */
  inlineId?: string;
  /** True when creating a new table inline. */
  inlineNew?: boolean;
}>();
const emit = defineEmits<{ done: [] }>();

const route   = useRoute();
const router  = useRouter();
const { confirm } = useConfirm();

// Support both inline (prop-driven) and standalone (route-driven) modes.
const id    = computed(() =>
  props.inlineId ?? (route.params.id as string | undefined) ?? "",
);
const isNew = computed(() =>
  props.inlineNew ?? route.name === "roll-table-new",
);

// View vs edit mode — existing tables start in view mode.
const editMode = ref(isNew.value);
watch(isNew, (n) => { if (n) editMode.value = true; });
// When a different table is opened inline, reset to view mode.
watch(() => props.inlineId, () => { editMode.value = false; });

// Detail query — disabled when creating
const tableQuery = useRollTable(id);
const table      = computed(() => tableQuery.data.value ?? null);
const loading    = computed(() => !isNew.value && tableQuery.isLoading.value);

// ── Form state ─────────────────────────────────────────────────────────────
const form = ref<RollTableInsert>({
  campaign_id: null,
  name: "",
  description: null,
  dice: "1d8" as RollTableDie,
  entries: [],
  tags: [],
  notes: null,
});

// Hydrate from server when the row loads (existing table view)
watch(table, (t) => {
  if (!t) return;
  form.value = {
    campaign_id: t.campaign_id,
    name:        t.name,
    description: t.description,
    dice:        t.dice,
    entries:     t.entries.map((e) => ({ ...e })),
    tags:        [...t.tags],
    notes:       t.notes,
  };
}, { immediate: true });

// ── Encounter picker options ───────────────────────────────────────────────
const { data: encounters } = useEncounters();
const encounterOptions = computed(() =>
  (encounters.value ?? []).map((e) => ({ id: e.id, name: e.name })),
);

// ── Die / entries ──────────────────────────────────────────────────────────
const dieMax     = computed(() => ROLL_TABLE_DIE_MAX[form.value.dice]);
const rangeError = computed(() => validateEntryRanges(form.value.entries, form.value.dice));

// Entries used for the roll panel: use saved table data in view mode (more reliable than form).
const rollableEntries = computed(() =>
  (!isNew.value && !editMode.value && table.value) ? table.value.entries : form.value.entries,
);

function addEntry() {
  const lastMax = form.value.entries.reduce((max, e) => Math.max(max, e.max), 0);
  const start   = Math.min(dieMax.value, lastMax + 1);
  const e: RollTableEntry = {
    id: crypto.randomUUID(),
    min: start,
    max: start,
    label: "",
    encounter_id: null,
    notes: null,
  };
  form.value.entries.push(e);
}

function removeEntry(idx: number) {
  form.value.entries.splice(idx, 1);
}

function onDieChange() {
  const max = dieMax.value;
  for (const e of form.value.entries) {
    e.min = Math.min(e.min, max);
    e.max = Math.min(e.max, max);
    if (e.max < e.min) e.max = e.min;
  }
  form.value.entries.sort((a, b) => a.min - b.min);
  for (let i = 1; i < form.value.entries.length; i++) {
    const prev = form.value.entries[i - 1];
    const curr = form.value.entries[i];
    if (curr.min <= prev.max) {
      curr.min = Math.min(prev.max + 1, max);
      curr.max = Math.max(curr.min, Math.min(curr.max, max));
    }
  }
  form.value.entries = form.value.entries.filter(e => e.min <= max);
}

// ── Roll panel ─────────────────────────────────────────────────────────────
const lastRoll = ref<RollTableRollResult | null>(null);
function onRoll() {
  const entries = rollableEntries.value;
  lastRoll.value = rollOnTable({
    id: id.value,
    user_id: "",
    campaign_id: form.value.campaign_id,
    name: form.value.name,
    description: form.value.description,
    dice: form.value.dice,
    entries,
    tags: form.value.tags,
    notes: form.value.notes,
    created_at: "",
    updated_at: "",
  });
}

// ── Save / Delete ──────────────────────────────────────────────────────────
const { mutateAsync: createTable } = useCreateRollTable();
const { mutateAsync: updateTable } = useUpdateRollTable();
const { mutateAsync: removeTable } = useDeleteRollTable();
const saving     = ref(false);
const isDeleting = ref(false);

const isInline = computed(() => props.inlineId !== undefined || props.inlineNew === true);

function navigateBack() {
  if (isInline.value) {
    emit("done");
  } else {
    router.push("/dungeon-craft?tab=roll-tables");
  }
}

async function onSave() {
  if (!form.value.name.trim() || rangeError.value) return;
  saving.value = true;
  try {
    if (isNew.value) {
      await createTable({ ...form.value });
    } else {
      await updateTable({ id: id.value, update: { ...form.value } });
    }
    editMode.value = false;
    if (isNew.value) navigateBack();
  } finally {
    saving.value = false;
  }
}

async function onDelete() {
  if (!await confirm(`Delete "${form.value.name}"? This cannot be undone.`)) return;
  isDeleting.value = true;
  try {
    navigateBack();
    await removeTable(id.value);
  } finally {
    isDeleting.value = false;
  }
}
</script>
