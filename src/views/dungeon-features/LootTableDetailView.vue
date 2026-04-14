<template>
  <PageHeader :title="isNew ? 'New Loot Table' : (table?.name ?? 'Loading…')">
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
        :disabled="saving || !form.name.trim() || entriesError !== null"
        :title="entriesError ?? undefined"
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
      <!-- ── Left: identity + entries ─────────────────────────────────────── -->
      <div class="flex flex-col gap-4">
        <div class="grid grid-cols-1 md:grid-cols-[1fr_180px] gap-3">
          <div class="space-y-1.5">
            <label class="font-cinzel text-[10px] font-semibold tracking-wider text-muted-foreground uppercase">Name</label>
            <input
              v-model="form.name"
              required
              placeholder="Bandit Camp Loot"
              class="w-full bg-card border border-border rounded-md px-3 py-2 font-cinzel text-lg font-bold text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
            />
          </div>
          <div class="space-y-1.5">
            <label class="font-cinzel text-[10px] font-semibold tracking-wider text-muted-foreground uppercase">CR Tier</label>
            <select
              v-model="form.cr_tier"
              class="w-full bg-card border border-border rounded-md px-3 py-2 font-fell text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
            >
              <option v-for="t in LOOT_CR_TIERS" :key="t" :value="t">{{ LOOT_CR_TIER_LABELS[t] }}</option>
            </select>
          </div>
        </div>

        <div class="space-y-1.5">
          <label class="font-cinzel text-[10px] font-semibold tracking-wider text-muted-foreground uppercase">Description</label>
          <textarea
            v-model="form.description"
            rows="2"
            placeholder="When + where this hoard appears"
            class="w-full bg-card border border-border rounded-md px-3 py-2 font-fell text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring resize-y"
          />
        </div>

        <!-- Entries -->
        <div class="space-y-2">
          <div class="flex items-center justify-between">
            <h2 class="font-cinzel text-sm font-bold text-foreground">Items ({{ form.entries.length }})</h2>
            <button
              type="button"
              class="inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-2.5 py-1.5 font-cinzel text-[11px] font-semibold text-muted-foreground hover:text-foreground hover:border-primary/50 transition-colors"
              @click="addEntry"
            >
              <Plus class="size-3.5" />
              Add item
            </button>
          </div>

          <p v-if="entriesError" class="font-fell text-xs text-destructive italic">
            {{ entriesError }}
          </p>

          <div v-if="!form.entries.length" class="rounded-md border border-dashed border-border px-4 py-8 text-center font-fell text-sm text-muted-foreground italic">
            No items yet. Add an entry per item — each gets its own drop chance and quantity.
          </div>

          <div v-else class="flex flex-col gap-2">
            <div
              v-for="(entry, idx) in form.entries"
              :key="entry.id"
              class="grid grid-cols-[1fr_90px_120px_auto] gap-2 items-start rounded-md border border-border bg-card p-2"
            >
              <!-- Item picker -->
              <EntityCombobox
                :model-value="entry.item_id ?? ''"
                :options="itemOptions"
                placeholder="Pick an item from the Vault…"
                @update:model-value="entry.item_id = $event"
              />

              <!-- Drop chance % -->
              <div class="flex items-center gap-1">
                <input
                  v-model.number="entry.drop_chance"
                  type="number"
                  min="1"
                  max="100"
                  class="w-14 bg-muted border border-border rounded px-1.5 py-1 font-fell text-sm text-foreground text-right focus:outline-none focus:ring-1 focus:ring-ring"
                />
                <span class="font-fell text-xs text-muted-foreground">%</span>
              </div>

              <!-- Quantity (dice or fixed) -->
              <input
                :value="entry.dice ?? ''"
                placeholder="2d4 or 3"
                class="w-full bg-muted border border-border rounded px-2 py-1 font-fell text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                title="Dice expression (3d6, 1d4+1) or empty for the fixed quantity below"
                @input="(e) => onQuantityInput(entry, (e.target as HTMLInputElement).value)"
              />

              <button
                type="button"
                class="text-muted-foreground hover:text-destructive transition-colors p-1"
                title="Remove entry"
                @click="removeEntry(idx)"
              >
                <Trash2 class="size-3.5" />
              </button>

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

        <div class="space-y-1.5">
          <label class="font-cinzel text-[10px] font-semibold tracking-wider text-muted-foreground uppercase">Tags</label>
          <TagInput v-model="form.tags" />
        </div>

        <div class="space-y-1.5">
          <label class="font-cinzel text-[10px] font-semibold tracking-wider text-muted-foreground uppercase">DM Notes</label>
          <textarea
            v-model="form.notes"
            rows="3"
            placeholder="When to roll, special rules"
            class="w-full bg-card border border-border rounded-md px-3 py-2 font-fell text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring resize-y"
          />
        </div>
      </div>

      <!-- ── Right: roll panel ────────────────────────────────────────────── -->
      <div class="lg:sticky lg:top-4 self-start">
        <div class="rounded-lg border border-border bg-card p-4 flex flex-col gap-3">
          <h3 class="font-cinzel text-sm font-bold tracking-wider text-foreground">Roll loot</h3>
          <button
            type="button"
            :disabled="!form.entries.length || entriesError !== null"
            :title="entriesError ?? undefined"
            class="inline-flex items-center justify-center gap-1.5 rounded-md bg-primary px-4 py-2 font-cinzel text-xs font-semibold text-primary-foreground tracking-wider hover:opacity-90 transition-opacity disabled:opacity-50"
            @click="onRoll"
          >
            <Dices class="size-3.5" />
            Roll
          </button>

          <div v-if="lastRoll" class="rounded-md border border-border bg-muted/40 p-3 flex flex-col gap-2">
            <span class="font-cinzel text-[10px] font-semibold tracking-wider text-muted-foreground uppercase">Drops</span>
            <ul v-if="lastRoll.length" class="flex flex-col gap-1.5">
              <li
                v-for="r in lastRoll"
                :key="r.entry_id + '-' + r.qty"
                class="flex items-center gap-2"
              >
                <span class="font-cinzel text-sm font-bold text-primary shrink-0 w-7 text-right">{{ r.qty }}×</span>
                <span class="font-fell text-sm text-foreground truncate">{{ r.item_name }}</span>
              </li>
            </ul>
            <p v-else class="font-fell text-xs text-muted-foreground italic">
              Empty — no entries hit. Better luck next room.
            </p>
          </div>

          <p class="font-fell text-[10px] text-muted-foreground italic">
            {{ form.entries.length }} entries · {{ summaryDropPercent }}% expected hit rate
          </p>
        </div>
      </div>
    </div>
  </PageHeader>
</template>

<script setup lang="ts">
import { ref, computed, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import { Plus, Trash2, Dices } from "lucide-vue-next";
import { useConfirm } from "@/composables/useConfirm";
import {
  useLootTable,
  useCreateLootTable,
  useUpdateLootTable,
  useDeleteLootTable,
} from "@/composables/useLootTables";
import { useItems } from "@/composables/useItems";
import {
  LOOT_CR_TIERS,
  LOOT_CR_TIER_LABELS,
  validateEntries,
  type LootCrTier,
  type LootEntry,
  type LootTableInsert,
} from "@/types/lootTable.types";
import { rollLootTable, type RolledLootEntry } from "@/lib/lootTableRoll";
import PageHeader from "@/components/common/PageHeader.vue";
import LoadingSpinner from "@/components/common/LoadingSpinner.vue";
import EntityCombobox from "@/components/common/EntityCombobox.vue";
import TagInput from "@/components/common/TagInput.vue";

const route   = useRoute();
const router  = useRouter();
const { confirm } = useConfirm();

const id    = computed(() => (route.params.id as string | undefined) ?? "");
const isNew = computed(() => route.name === "loot-table-new");

const tableQuery = useLootTable(id);
const table     = computed(() => tableQuery.data.value ?? null);
const loading   = computed(() => !isNew.value && tableQuery.isLoading.value);

// ── Form state ─────────────────────────────────────────────────────────────
const form = ref<LootTableInsert>({
  campaign_id: null,
  name: "",
  description: null,
  cr_tier: "any" as LootCrTier,
  entries: [],
  tags: [],
  notes: null,
});

watch(table, (t) => {
  if (!t) return;
  form.value = {
    campaign_id: t.campaign_id,
    name:        t.name,
    description: t.description,
    cr_tier:     t.cr_tier,
    entries:     t.entries.map((e) => ({ ...e })),
    tags:        [...t.tags],
    notes:       t.notes,
  };
}, { immediate: true });

// ── Items (Vault) ──────────────────────────────────────────────────────────
const itemsQuery = useItems();
const itemsById = computed(() => {
  const m = new Map<string, NonNullable<typeof itemsQuery.data.value>[number]>();
  for (const it of itemsQuery.data.value ?? []) m.set(it.id, it);
  return m;
});
const itemOptions = computed(() =>
  (itemsQuery.data.value ?? []).map((it) => ({ id: it.id, name: it.name })),
);

// ── Entries ────────────────────────────────────────────────────────────────
const entriesError = computed(() => validateEntries(form.value.entries));

const summaryDropPercent = computed(() => {
  if (!form.value.entries.length) return 0;
  const sum = form.value.entries.reduce((s, e) => s + (e.drop_chance ?? 0), 0);
  return Math.round(sum / form.value.entries.length);
});

function addEntry() {
  const e: LootEntry = {
    id: crypto.randomUUID(),
    item_id: "",
    drop_chance: 100,
    dice: null,
    fixed_qty: 1,
    notes: null,
  };
  form.value.entries.push(e);
}

function removeEntry(idx: number) {
  form.value.entries.splice(idx, 1);
}

function onQuantityInput(entry: LootEntry, raw: string) {
  const trimmed = raw.trim();
  if (!trimmed) {
    entry.dice = null;
    return;
  }
  // Pure integer input → record as fixed_qty (faster + clearer than 1d1+N).
  const n = Number(trimmed);
  if (Number.isInteger(n) && n >= 0 && /^\d+$/.test(trimmed)) {
    entry.fixed_qty = n;
    entry.dice = null;
  } else {
    entry.dice = trimmed;
  }
}

// ── Roll panel ─────────────────────────────────────────────────────────────
const lastRoll = ref<RolledLootEntry[] | null>(null);
function onRoll() {
  lastRoll.value = rollLootTable(
    {
      id: id.value,
      user_id: "",
      campaign_id: form.value.campaign_id,
      name: form.value.name,
      description: form.value.description,
      cr_tier: form.value.cr_tier,
      entries: form.value.entries,
      tags: form.value.tags,
      notes: form.value.notes,
      created_at: "",
      updated_at: "",
    },
    itemsById.value,
  );
}

// ── Save / Delete ──────────────────────────────────────────────────────────
const { mutateAsync: createTable } = useCreateLootTable();
const { mutateAsync: updateTable } = useUpdateLootTable();
const { mutateAsync: removeTable } = useDeleteLootTable();
const saving = ref(false);
const isDeleting = ref(false);

async function onSave() {
  if (!form.value.name.trim() || entriesError.value) return;
  saving.value = true;
  try {
    if (isNew.value) {
      await createTable({ ...form.value });
    } else {
      await updateTable({ id: id.value, update: { ...form.value } });
    }
    router.push("/dungeon-craft?tab=loot-tables");
  } finally {
    saving.value = false;
  }
}

async function onDelete() {
  if (!await confirm(`Delete "${form.value.name}"? This cannot be undone.`)) return;
  isDeleting.value = true;
  try {
    router.push("/dungeon-craft?tab=loot-tables");
    await removeTable(id.value);
  } finally {
    isDeleting.value = false;
  }
}
</script>
