<template>
  <PageHeader :title="isNew ? 'New Loot Table' : (table?.name ?? 'Loading…')">
    <template #actions>
      <!-- View mode -->
      <template v-if="!isNew && !isEditing">
        <PageHeaderAction
          type="button"
          :disabled="isDeleting"
          :label="isDeleting ? 'Deleting…' : 'Delete'"
          :icon="IconDelete"
          variant="destructive"
          @click="onDelete"
        />
        <PageHeaderAction
          type="button"
          label="Edit"
          :icon="IconEdit"
          variant="primary"
          @click="isEditing = true"
        />
      </template>
      <!-- Edit / new mode -->
      <template v-else>
        <button
          v-if="!isNew"
          type="button"
          class="font-cinzel text-xs text-muted-foreground hover:text-foreground transition-colors px-2"
          @click="isEditing = false"
        >Cancel</button>
        <PageHeaderAction
          type="button"
          :disabled="saving || !form.name.trim() || entriesError !== null"
          :title="entriesError ?? undefined"
          :label="saving ? 'Saving…' : isNew ? 'Create' : 'Save'"
          :mobile-label="saving ? 'Saving…' : isNew ? 'Create' : 'Save'"
          variant="primary"
          :hide-label-on-mobile="false"
          @click="onSave"
        />
      </template>
    </template>

    <div v-if="loading" class="flex justify-center py-16">
      <LoadingSpinner />
    </div>

    <div v-else class="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-6">
      <!-- ── Left: identity + entries ─────────────────────────────────────── -->
      <div class="flex flex-col gap-4">

        <!-- ── VIEW MODE ──────────────────────────────────────────────────── -->
        <template v-if="!isNew && !isEditing && table">
          <!-- Description -->
          <p v-if="table.description" class="font-fell text-sm text-muted-foreground italic">{{ table.description }}</p>

          <!-- CR tier chip -->
          <div class="flex items-center gap-2">
            <span class="font-cinzel text-[10px] font-semibold tracking-wider bg-muted/60 text-muted-foreground rounded px-2 py-0.5">
              {{ LOOT_CR_TIER_LABELS[table.cr_tier] }}
            </span>
            <span class="font-cinzel text-[10px] text-muted-foreground tracking-wider">{{ table.entries.length }} entries · {{ summaryDropPercent }}% expected hit rate</span>
          </div>

          <!-- Read-only entry list -->
          <div class="space-y-1.5">
            <h3 class="font-cinzel text-sm font-bold text-foreground">Entries</h3>
            <div v-if="!table.entries.length" class="rounded-md border border-dashed border-border px-4 py-6 text-center font-fell text-sm text-muted-foreground italic">
              No entries yet.
            </div>
            <div v-else class="flex flex-col gap-1.5">
              <div
                v-for="entry in table.entries"
                :key="entry.id"
                class="rounded-md border border-border bg-card px-3 py-2 flex items-center gap-3"
              >
                <!-- drop % badge -->
                <span class="shrink-0 font-cinzel text-[10px] font-semibold tracking-wider bg-primary/10 text-primary rounded px-2 py-0.5">{{ entry.drop_chance ?? 100 }}%</span>
                <template v-if="(entry.type ?? 'item') === 'item'">
                  <span class="font-fell text-sm text-foreground flex-1 truncate">
                    {{ itemsById.get(entry.item_id ?? '')?.name ?? entry.item_id ?? '—' }}
                  </span>
                  <span class="font-cinzel text-[10px] text-muted-foreground shrink-0">
                    {{ entry.dice ?? entry.fixed_qty ?? 1 }}×
                  </span>
                </template>
                <template v-else-if="entry.type === 'currency'">
                  <span class="font-fell text-sm text-foreground flex-1 truncate">
                    {{ entry.currency_label || 'Currency' }}
                  </span>
                  <span class="font-cinzel text-[10px] text-amber-400 shrink-0">
                    {{ formatCoinParts(entry.pp ?? 0, entry.gp ?? 0, entry.ep ?? 0, entry.sp ?? 0, entry.cp ?? 0).join(', ') || '—' }}
                  </span>
                </template>
                <template v-else>
                  <span class="font-fell text-sm text-foreground flex-1 truncate">
                    Random {{ entry.rarity ? ITEM_RARITY_LABELS[entry.rarity as keyof typeof ITEM_RARITY_LABELS] : '' }}{{ entry.item_type_filter ? ` ${ITEM_TYPE_LABELS[entry.item_type_filter as keyof typeof ITEM_TYPE_LABELS]}` : '' }}
                  </span>
                  <span class="font-cinzel text-[10px] text-muted-foreground shrink-0">
                    {{ entry.dice ?? entry.fixed_qty ?? 1 }}×
                  </span>
                </template>
              </div>
            </div>
          </div>

          <!-- Tags -->
          <div v-if="table.tags.length" class="flex flex-wrap gap-1">
            <span
              v-for="tag in table.tags"
              :key="tag"
              class="font-cinzel text-[10px] tracking-wider bg-muted/40 text-muted-foreground rounded px-2 py-0.5"
            >{{ tag }}</span>
          </div>

          <!-- Linked monsters -->
          <div v-if="table.monster_ids?.length" class="flex flex-col gap-1.5">
            <h3 class="font-cinzel text-[10px] font-semibold tracking-wider text-muted-foreground uppercase">Linked Monsters</h3>
            <div class="flex flex-wrap gap-1.5">
              <RouterLink
                v-for="mid in table.monster_ids"
                :key="mid"
                :to="`/monsters/${mid}`"
                class="inline-flex items-center gap-1 font-cinzel text-[10px] px-2 py-0.5 rounded bg-muted text-muted-foreground hover:text-foreground hover:bg-muted/70 transition-colors"
              >
                <IconMonster class="h-2.5 w-2.5 shrink-0" />{{ monstersById.get(mid)?.name ?? mid }}
              </RouterLink>
            </div>
          </div>

          <!-- DM notes -->
          <p v-if="table.notes" class="font-fell text-sm text-muted-foreground italic border-t border-border pt-3">{{ table.notes }}</p>
        </template>

        <!-- ── EDIT MODE ───────────────────────────────────────────────── -->
        <template v-else>
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
        <LootTableEntryEditor
          :entries="form.entries"
          :item-options="itemOptions"
          :entries-error="entriesError"
          :random-pool-sizes="randomPoolSizes"
          @add="addEntry"
          @remove="removeEntry"
        />

        <div class="space-y-1.5">
          <label class="font-cinzel text-[10px] font-semibold tracking-wider text-muted-foreground uppercase">Tags</label>
          <TagInput v-model="form.tags" />
        </div>

        <div class="space-y-1.5">
          <label class="font-cinzel text-[10px] font-semibold tracking-wider text-muted-foreground uppercase">Linked Monsters</label>
          <div v-if="form.monster_ids.length" class="flex flex-wrap gap-1.5">
            <span
              v-for="mid in form.monster_ids"
              :key="mid"
              class="inline-flex items-center gap-1 font-cinzel text-[10px] bg-muted/60 text-muted-foreground rounded px-2 py-0.5"
            >
              <IconMonster class="h-2.5 w-2.5 shrink-0" />{{ monstersById.get(mid)?.name ?? mid }}
              <button type="button" class="ml-0.5 hover:text-destructive transition-colors" @click="removeMonster(mid)">
                <IconClose class="h-2.5 w-2.5" />
              </button>
            </span>
          </div>
          <EntityCombobox
            model-value=""
            :options="availableMonsterOptions"
            placeholder="Link a monster…"
            @update:model-value="addMonster($event)"
          />
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
        </template><!-- end edit mode -->
      </div>

      <!-- ── Right: roll panel ────────────────────────────────────────────── -->
      <div class="self-start">
        <div class="rounded-lg border border-border bg-card p-4 flex flex-col gap-3">
          <h3 class="font-cinzel text-sm font-bold tracking-wider text-foreground">Roll loot</h3>
          <button
            type="button"
            :disabled="!form.entries.length || entriesError !== null"
            :title="entriesError ?? undefined"
            class="inline-flex items-center justify-center gap-1.5 rounded-md bg-primary px-4 py-2 font-cinzel text-xs font-semibold text-primary-foreground tracking-wider hover:opacity-90 transition-opacity disabled:opacity-50"
            @click="onRoll"
          >
            <IconDiceRoll class="size-3.5" />
            Roll
          </button>

          <div v-if="lastRoll" class="rounded-md border border-border bg-muted/40 p-3 flex flex-col gap-2">
            <span class="font-cinzel text-[10px] font-semibold tracking-wider text-muted-foreground uppercase">Drops</span>
            <ul v-if="lastRoll.length" class="flex flex-col gap-1.5">
              <li v-for="r in lastRoll" :key="r.entry_id" class="flex items-center gap-2">
                <template v-if="r.type === 'item'">
                  <span class="font-cinzel text-sm font-bold text-primary shrink-0 w-7 text-right">{{ r.qty }}×</span>
                  <span class="font-fell text-sm text-foreground truncate">{{ r.item_name }}</span>
                </template>
                <template v-else-if="r.type === 'currency'">
                  <span class="font-cinzel text-sm font-bold text-amber-400 shrink-0 w-7 text-right">💰</span>
                  <span class="font-fell text-sm text-foreground truncate">
                    {{ r.currency_label ? r.currency_label + ': ' : '' }}{{ formatCoinParts(r.pp, r.gp, r.ep, r.sp, r.cp).join(', ') || '0 GP' }}
                  </span>
                </template>
              </li>
            </ul>
            <p v-else class="font-fell text-xs text-muted-foreground italic">
              Empty — no entries hit. Better luck next room.
            </p>
          </div>

          <p class="font-fell text-[10px] text-muted-foreground italic">
            {{ form.entries.length }} entries · {{ summaryDropPercent }}% expected hit rate
          </p>

          <!-- Drop in chat -->
          <div v-if="!isNew" class="border-t border-border pt-3 flex flex-col gap-2">
            <button
              type="button"
              :disabled="!form.entries.length || entriesError !== null"
              :title="entriesError ?? 'Roll the table and post a chest in chat'"
              class="inline-flex items-center justify-center gap-1.5 rounded-md border border-primary/40 px-3 py-2 font-cinzel text-xs font-semibold text-primary hover:bg-primary/10 transition-colors disabled:opacity-50"
              @click="dropDialogOpen = true"
            >
              <IconPackageOpen class="size-3.5" />
              Drop chest in chat
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- ── Drop dialog ─────────────────────────────────────────────────────── -->
    <LootTableDropDialog
      :open="dropDialogOpen"
      :atoms="dropPreviewAtoms"
      :claims-dice="claimsDice"
      :chest-image-url="chestImageUrl"
      :effective-cap="effectiveCap"
      :dropping="dropping"
      @close="closeDropDialog"
      @drop="onDrop"
      @reroll="reroll"
      @update:claims-dice="claimsDice = $event"
      @update:chest-image-url="chestImageUrl = $event"
    />
  </PageHeader>
</template>

<script setup lang="ts">
import { ref, computed, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import { RouterLink } from "vue-router";
import { IconClose, IconDelete, IconDiceRoll, IconEdit, IconMonster, IconPackageOpen } from '@/lib/icons';
import { useConfirm } from "@/composables/useConfirm";
import {
  useLootTable,
  useCreateLootTable,
  useUpdateLootTable,
  useDeleteLootTable,
} from "@/composables/useLootTables";
import { useItems } from "@/composables/useItems";
import { useMonsters } from "@/composables/useMonsters";
import { useCampaignMessages } from "@/composables/useCampaignMessages";
import {
  LOOT_CR_TIERS,
  LOOT_CR_TIER_LABELS,
  validateEntries,
  type LootCrTier,
  type LootEntryType,
  type LootTableInsert,
} from "@/types/lootTable.types";
import {
  ITEM_TYPE_LABELS,
  ITEM_RARITY_LABELS,
} from "@/types/item.types";
import { formatCoinParts } from "@/lib/currency";
import type { LootChestAtom, LootChestMetadata } from "@/types/chat.types";
import { rollLootTable, type RolledLootEntry } from "@/lib/lootTableRoll";
import { parseExpression, rollExpression } from "@/lib/dice";
import PageHeader from "@/components/common/PageHeader.vue";
import PageHeaderAction from "@/components/common/PageHeaderAction.vue";
import LoadingSpinner from "@/components/common/LoadingSpinner.vue";
import EntityCombobox from "@/components/common/EntityCombobox.vue";
import TagInput from "@/components/common/TagInput.vue";
import LootTableEntryEditor from "@/components/dungeon-features/LootTableEntryEditor.vue";
import LootTableDropDialog from "@/components/dungeon-features/LootTableDropDialog.vue";

const route   = useRoute();
const router  = useRouter();
const { confirm } = useConfirm();

const id        = computed(() => (route.params.id as string | undefined) ?? "");
const isNew     = computed(() => route.name === "loot-table-new");
const isEditing = ref(false);

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
  monster_ids: [],
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
    monster_ids: [...(t.monster_ids ?? [])],
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

// ── Monsters ───────────────────────────────────────────────────────────────
const monstersQuery = useMonsters();
const monstersById = computed(() => {
  const m = new Map<string, NonNullable<typeof monstersQuery.data.value>[number]>();
  for (const mo of monstersQuery.data.value ?? []) m.set(mo.id, mo);
  return m;
});
const availableMonsterOptions = computed(() =>
  (monstersQuery.data.value ?? [])
    .filter((mo) => !form.value.monster_ids.includes(mo.id))
    .map((mo) => ({ id: mo.id, name: mo.name })),
);
function addMonster(monsterId: string) {
  if (!monsterId || form.value.monster_ids.includes(monsterId)) return;
  form.value.monster_ids = [...form.value.monster_ids, monsterId];
}
function removeMonster(monsterId: string) {
  form.value.monster_ids = form.value.monster_ids.filter((mid) => mid !== monsterId);
}

// ── Entries ────────────────────────────────────────────────────────────────
const entriesError = computed(() => validateEntries(form.value.entries));

const summaryDropPercent = computed(() => {
  if (!form.value.entries.length) return 0;
  const sum = form.value.entries.reduce((s, e) => s + (e.drop_chance ?? 0), 0);
  return Math.round(sum / form.value.entries.length);
});

const randomPoolSizes = computed(() => {
  const map = new Map<string, number>();
  for (const entry of form.value.entries) {
    if ((entry.type ?? "item") !== "random") continue;
    const count = [...itemsById.value.values()].filter(
      (it) =>
        it.rarity === entry.rarity &&
        (!entry.item_type_filter || it.item_type === entry.item_type_filter),
    ).length;
    map.set(entry.id, count);
  }
  return map;
});

function addEntry(type: LootEntryType) {
  const base = { id: crypto.randomUUID(), type, drop_chance: 100, notes: null };
  if (type === "item") {
    form.value.entries.push({ ...base, item_id: "", dice: null, fixed_qty: 1 });
  } else if (type === "currency") {
    form.value.entries.push({ ...base, currency_label: null, pp: 0, gp: 0, ep: 0, sp: 0, cp: 0 });
  } else {
    form.value.entries.push({ ...base, rarity: "common", item_type_filter: null, dice: null, fixed_qty: 1 });
  }
}

function removeEntry(idx: number) {
  form.value.entries.splice(idx, 1);
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
      monster_ids: form.value.monster_ids,
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
      router.push("/dungeon-craft?tab=loot-tables");
    } else {
      await updateTable({ id: id.value, update: { ...form.value } });
      isEditing.value = false;
    }
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

// ── Drop-in-chat dialog ─────────────────────────────────────────────────────
const dropDialogOpen    = ref(false);
const claimsDice        = ref("1");
const claimsRolled      = ref<number | null>(1);
const chestImageUrl     = ref<string | null>(null);
const dropping          = ref(false);

function rollClaims() {
  const raw = claimsDice.value.trim();
  if (!raw) { claimsRolled.value = null; return; }
  const n = Number(raw);
  if (Number.isInteger(n) && n >= 0) { claimsRolled.value = n; return; }
  const parsed = parseExpression(raw);
  if (!parsed) { claimsRolled.value = null; return; }
  claimsRolled.value = Math.max(0, Math.floor(rollExpression(parsed)));
}

const dropPreview = ref<RolledLootEntry[]>([]);
watch(dropDialogOpen, (open) => {
  if (open) reroll();
});

watch(claimsDice, rollClaims);

function reroll() {
  const transient = {
    id: id.value, user_id: "", campaign_id: form.value.campaign_id,
    name: form.value.name, description: form.value.description,
    cr_tier: form.value.cr_tier, entries: form.value.entries,
    tags: form.value.tags, notes: form.value.notes,
    monster_ids: form.value.monster_ids,
    created_at: "", updated_at: "",
  };
  dropPreview.value = rollLootTable(transient, itemsById.value);
  rollClaims();
}

const dropPreviewAtoms = computed<LootChestAtom[]>(() => {
  const atoms: LootChestAtom[] = [];
  for (const r of dropPreview.value) {
    if (r.type === "item") {
      const item = itemsById.value.get(r.item_id);
      for (let i = 0; i < r.qty; i++) {
        atoms.push({
          atom_id:        crypto.randomUUID(),
          type:           "item",
          item_id:        r.item_id,
          item_name:      r.item_name,
          item_image_url: r.item_image_url ?? null,
          item_rarity:    item?.rarity ?? null,
        });
      }
    } else {
      atoms.push({
        atom_id:        crypto.randomUUID(),
        type:           "currency",
        currency_label: r.currency_label ?? null,
        pp: r.pp, gp: r.gp, ep: r.ep, sp: r.sp, cp: r.cp,
      });
    }
  }
  return atoms;
});

const effectiveCap = computed<number | null>(() => {
  if (claimsRolled.value === null) return null;
  return Math.min(claimsRolled.value, dropPreviewAtoms.value.length);
});

function closeDropDialog() {
  dropDialogOpen.value = false;
  dropping.value = false;
}

const { sendLootChest } = useCampaignMessages();

async function onDrop() {
  const cap = effectiveCap.value;
  if (!cap) return;

  const metadata: LootChestMetadata = {
    loot_table_id:   id.value || null,
    loot_table_name: form.value.name || "Loot",
    chest_image_url: chestImageUrl.value,
    rolled_atoms:    dropPreviewAtoms.value,
    claims:          [],
    claims_total:    cap,
  };

  dropping.value = true;
  try {
    await sendLootChest(metadata);
    closeDropDialog();
  } finally {
    dropping.value = false;
  }
}
</script>
