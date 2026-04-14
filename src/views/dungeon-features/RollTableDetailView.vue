<template>
  <PageHeader :title="isNew ? 'New Roll Table' : (table?.name ?? 'Loading…')">
    <template #actions>
      <button
        v-if="!isNew"
        type="button"
        :disabled="isDeleting"
        class="font-fell text-sm text-destructive hover:opacity-70 transition-opacity disabled:opacity-50"
        @click="onDelete"
      >
        Delete
      </button>
      <button
        type="button"
        :disabled="saving || !form.name.trim() || rangeError !== null"
        :title="rangeError ?? undefined"
        class="inline-flex items-center gap-1.5 rounded-md bg-primary px-4 py-2 font-cinzel text-xs font-semibold text-primary-foreground tracking-wider hover:opacity-90 transition-opacity disabled:opacity-50"
        @click="onSave"
      >
        {{ saving ? "Saving…" : isNew ? "Create" : "Save" }}
      </button>
    </template>

    <div v-if="loading" class="flex justify-center py-16">
      <LoadingSpinner />
    </div>

    <div v-else class="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-6">
      <!-- ── Left: name, dice, entries ────────────────────────────────────── -->
      <div class="flex flex-col gap-4">
        <div class="grid grid-cols-1 md:grid-cols-[1fr_140px] gap-3">
          <div class="space-y-1.5">
            <label class="font-cinzel text-[10px] font-semibold tracking-wider text-muted-foreground uppercase">Name</label>
            <input
              v-model="form.name"
              required
              placeholder="Forest Road — Daytime"
              class="w-full bg-card border border-border rounded-md px-3 py-2 font-cinzel text-lg font-bold text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
            />
          </div>
          <div class="space-y-1.5">
            <label class="font-cinzel text-[10px] font-semibold tracking-wider text-muted-foreground uppercase">Die</label>
            <select
              v-model="form.dice"
              class="w-full bg-card border border-border rounded-md px-3 py-2 font-fell text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
              @change="onDieChange"
            >
              <option v-for="d in ROLL_TABLE_DICE" :key="d" :value="d">{{ d }}</option>
            </select>
          </div>
        </div>

        <div class="space-y-1.5">
          <label class="font-cinzel text-[10px] font-semibold tracking-wider text-muted-foreground uppercase">Description</label>
          <textarea
            v-model="form.description"
            rows="2"
            placeholder="When + where to use this table"
            class="w-full bg-card border border-border rounded-md px-3 py-2 font-fell text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring resize-y"
          />
        </div>

        <!-- Entries -->
        <div class="space-y-2">
          <div class="flex items-center justify-between">
            <h2 class="font-cinzel text-sm font-bold text-foreground">Entries ({{ form.entries.length }})</h2>
            <button
              type="button"
              class="inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-2.5 py-1.5 font-cinzel text-[11px] font-semibold text-muted-foreground hover:text-foreground hover:border-primary/50 transition-colors"
              @click="addEntry"
            >
              <Plus class="size-3.5" />
              Add row
            </button>
          </div>

          <p v-if="rangeError" class="font-fell text-xs text-destructive italic">
            {{ rangeError }}
          </p>

          <div v-if="!form.entries.length" class="rounded-md border border-dashed border-border px-4 py-8 text-center font-fell text-sm text-muted-foreground italic">
            No entries yet. Add some rows then assign roll ranges.
          </div>

          <div v-else class="flex flex-col gap-2">
            <div
              v-for="(entry, idx) in form.entries"
              :key="entry.id"
              class="grid grid-cols-[80px_1fr_140px_auto] gap-2 items-start rounded-md border border-border bg-card p-2"
            >
              <!-- Range -->
              <div class="flex items-center gap-1">
                <input
                  v-model.number="entry.min"
                  type="number"
                  :min="1"
                  :max="dieMax"
                  class="w-9 bg-muted border border-border rounded px-1 py-1 font-fell text-xs text-foreground text-center focus:outline-none focus:ring-1 focus:ring-ring"
                />
                <span class="font-fell text-xs text-muted-foreground">–</span>
                <input
                  v-model.number="entry.max"
                  type="number"
                  :min="entry.min"
                  :max="dieMax"
                  class="w-9 bg-muted border border-border rounded px-1 py-1 font-fell text-xs text-foreground text-center focus:outline-none focus:ring-1 focus:ring-ring"
                />
              </div>

              <!-- Label + encounter picker -->
              <div class="flex flex-col gap-1.5 min-w-0">
                <input
                  v-model="entry.label"
                  placeholder="What happens?"
                  class="w-full bg-muted border border-border rounded px-2 py-1 font-fell text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                />
                <EntityCombobox
                  :model-value="entry.encounter_id ?? ''"
                  :options="encounterOptions"
                  placeholder="Link encounter…"
                  @update:model-value="entry.encounter_id = $event || null"
                />
              </div>

              <!-- Count -->
              <input
                :value="entry.count ?? ''"
                placeholder="Count (1d4, 2…)"
                class="w-full bg-muted border border-border rounded px-2 py-1 font-fell text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                @input="(e) => (entry.count = (e.target as HTMLInputElement).value || null)"
              />

              <!-- Actions -->
              <div class="flex items-center gap-1">
                <button
                  type="button"
                  class="text-muted-foreground hover:text-destructive transition-colors p-1"
                  title="Remove entry"
                  @click="removeEntry(idx)"
                >
                  <Trash2 class="size-3.5" />
                </button>
              </div>

              <!-- Notes (full row, collapsible) -->
              <textarea
                v-if="entry.notes !== null && entry.notes !== undefined"
                v-model="entry.notes"
                rows="1"
                placeholder="Notes (optional)"
                class="col-span-4 w-full bg-muted border border-border rounded px-2 py-1 font-fell text-xs text-muted-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring resize-y"
              />
              <button
                v-else
                type="button"
                class="col-span-4 text-left font-fell text-[10px] text-muted-foreground hover:text-foreground italic"
                @click="entry.notes = ''"
              >
                + add note
              </button>
            </div>
          </div>
        </div>

        <!-- Tags + table notes -->
        <div class="space-y-1.5">
          <label class="font-cinzel text-[10px] font-semibold tracking-wider text-muted-foreground uppercase">Tags</label>
          <TagInput v-model="form.tags" />
        </div>

        <div class="space-y-1.5">
          <label class="font-cinzel text-[10px] font-semibold tracking-wider text-muted-foreground uppercase">DM Notes</label>
          <textarea
            v-model="form.notes"
            rows="3"
            placeholder="When to roll, suggested cadence, special rules"
            class="w-full bg-card border border-border rounded-md px-3 py-2 font-fell text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring resize-y"
          />
        </div>
      </div>

      <!-- ── Right: roll panel ────────────────────────────────────────────── -->
      <div class="lg:sticky lg:top-4 self-start">
        <div class="rounded-lg border border-border bg-card p-4 flex flex-col gap-3">
          <h3 class="font-cinzel text-sm font-bold tracking-wider text-foreground">Roll {{ form.dice }}</h3>
          <button
            type="button"
            :disabled="!form.entries.length || rangeError !== null"
            :title="rangeError ?? undefined"
            class="inline-flex items-center justify-center gap-1.5 rounded-md bg-primary px-4 py-2 font-cinzel text-xs font-semibold text-primary-foreground tracking-wider hover:opacity-90 transition-opacity disabled:opacity-50"
            @click="onRoll"
          >
            <Dices class="size-3.5" />
            Roll
          </button>

          <div v-if="lastRoll" class="rounded-md border border-border bg-muted/40 p-3 flex flex-col gap-1.5">
            <div class="flex items-center justify-between">
              <span class="font-cinzel text-[10px] font-semibold tracking-wider text-muted-foreground uppercase">Result</span>
              <span class="font-cinzel text-2xl font-bold text-primary">{{ lastRoll.rolled }}</span>
            </div>
            <template v-if="lastRoll.entry">
              <div class="font-cinzel text-sm text-foreground font-bold">{{ lastRoll.entry.label }}</div>
              <div v-if="lastRoll.entry.count" class="font-fell text-xs text-muted-foreground">Count: {{ lastRoll.entry.count }}</div>
              <RouterLink
                v-if="lastRoll.entry.encounter_id"
                :to="`/encounters/${lastRoll.entry.encounter_id}`"
                class="inline-flex items-center gap-1 font-cinzel text-[11px] font-semibold text-primary hover:underline"
              >
                Open encounter →
              </RouterLink>
              <p v-if="lastRoll.entry.notes" class="font-fell text-xs text-muted-foreground italic mt-1">
                {{ lastRoll.entry.notes }}
              </p>
            </template>
            <p v-else class="font-fell text-xs text-muted-foreground italic">
              No entry covers this result. Sparse table — keep moving.
            </p>
          </div>

          <p class="font-fell text-[10px] text-muted-foreground italic">
            {{ form.entries.length }} entries · die range 1–{{ dieMax }}
          </p>
        </div>
      </div>
    </div>
  </PageHeader>
</template>

<script setup lang="ts">
import { ref, computed, watch } from "vue";
import { useRoute, useRouter, RouterLink } from "vue-router";
import { Plus, Trash2, Dices } from "lucide-vue-next";
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
import PageHeader from "@/components/common/PageHeader.vue";
import LoadingSpinner from "@/components/common/LoadingSpinner.vue";
import EntityCombobox from "@/components/common/EntityCombobox.vue";
import TagInput from "@/components/common/TagInput.vue";

const route   = useRoute();
const router  = useRouter();
const { confirm } = useConfirm();

const id      = computed(() => (route.params.id as string | undefined) ?? "");
const isNew   = computed(() => route.name === "roll-table-new");

// Detail query — disabled when creating
const tableQuery = useRollTable(id);
const table     = computed(() => tableQuery.data.value ?? null);
const loading   = computed(() => !isNew.value && tableQuery.isLoading.value);

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
const dieMax = computed(() => ROLL_TABLE_DIE_MAX[form.value.dice]);
const rangeError = computed(() => validateEntryRanges(form.value.entries, form.value.dice));

function addEntry() {
  // Sensible default: append at next free face after the highest current max,
  // or 1 if the list is empty.
  const lastMax = form.value.entries.reduce((max, e) => Math.max(max, e.max), 0);
  const start = Math.min(dieMax.value, lastMax + 1);
  const e: RollTableEntry = {
    id: crypto.randomUUID(),
    min: start,
    max: start,
    label: "",
    encounter_id: null,
    count: null,
    notes: null,
  };
  form.value.entries.push(e);
}

function removeEntry(idx: number) {
  form.value.entries.splice(idx, 1);
}

function onDieChange() {
  // Clamp any out-of-range entries to the new die's max so a downsize doesn't
  // silently leave entries that can never roll.
  for (const e of form.value.entries) {
    if (e.min > dieMax.value) e.min = dieMax.value;
    if (e.max > dieMax.value) e.max = dieMax.value;
    if (e.max < e.min) e.max = e.min;
  }
}

// ── Roll panel ─────────────────────────────────────────────────────────────
const lastRoll = ref<RollTableRollResult | null>(null);
function onRoll() {
  // Build a transient table from current form state so the user can roll
  // before saving.
  lastRoll.value = rollOnTable({
    id: id.value,
    user_id: "",
    campaign_id: form.value.campaign_id,
    name: form.value.name,
    description: form.value.description,
    dice: form.value.dice,
    entries: form.value.entries,
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
const saving = ref(false);
const isDeleting = ref(false);

async function onSave() {
  if (!form.value.name.trim() || rangeError.value) return;
  saving.value = true;
  try {
    if (isNew.value) {
      await createTable({ ...form.value });
    } else {
      await updateTable({ id: id.value, update: { ...form.value } });
    }
    router.push("/dungeon-craft?tab=roll-tables");
  } finally {
    saving.value = false;
  }
}

async function onDelete() {
  if (!await confirm(`Delete "${form.value.name}"? This cannot be undone.`)) return;
  isDeleting.value = true;
  try {
    router.push("/dungeon-craft?tab=roll-tables");
    await removeTable(id.value);
  } finally {
    isDeleting.value = false;
  }
}
</script>
