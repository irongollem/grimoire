<template>
  <div class="flex flex-col gap-2">
    <div data-testid="location-loot-form" class="flex flex-col gap-2 rounded-md border border-dashed border-border bg-background px-3 py-2">
      <SegmentedControl v-model="kind" :options="KIND_OPTIONS" size="xs" block />

      <template v-if="kind === 'item'">
        <EntityCombobox v-model="itemId" :options="itemOptions" placeholder="Find an Item Vault item…" />
        <div class="grid grid-cols-2 gap-2 sm:grid-cols-[7rem_1fr]">
          <label class="text-caption text-muted-foreground">Quantity <AppInput v-model.number="quantity" type="number" min="1" /></label>
          <label class="text-caption text-muted-foreground">Table label <AppInput v-model="label" placeholder="Optional label" /></label>
        </div>
      </template>

      <template v-else-if="kind === 'currency'">
        <AppInput v-model="label" placeholder="Currency label (optional)" />
        <div class="grid grid-cols-5 gap-2">
          <label v-for="coin in coins" :key="coin" class="text-caption uppercase text-muted-foreground">{{ coin }}<AppInput v-model.number="currency[coin]" type="number" min="0" /></label>
        </div>
      </template>

      <template v-else>
        <EntityCombobox v-model="lootTableId" :options="lootTableOptions" placeholder="Pick a loot table…" />
        <AppButton label="Roll" size="xs" variant="tinted" :icon="IconDiceRoll" :disabled="!lootTableId" @click="rollChest" />

        <div v-if="rolledAtoms.length || rolledUnresolved.length" class="flex flex-col gap-1 rounded-md border border-border bg-muted/40 p-2">
          <p v-for="atom in rolledAtoms" :key="atom.atom_id" class="text-caption text-foreground truncate">
            <template v-if="atom.type === 'item'">· {{ atom.item_name }}</template>
            <template v-else>💰 {{ formatCoinParts(atom.pp ?? 0, atom.gp ?? 0, atom.ep ?? 0, atom.sp ?? 0, atom.cp ?? 0).join(', ') || '0 GP' }}</template>
          </p>
          <p v-for="u in rolledUnresolved" :key="u.entry_id" class="text-caption-sm text-muted-foreground italic">
            ⚠ {{ u.wanted }}: {{ unresolvedReasonLabel(u.reason) }}
          </p>
          <AppButton variant="ghost" size="inline-xs" label="↻ re-roll" class="self-start italic" @click="rollChest" />
        </div>

        <div class="grid grid-cols-2 gap-2">
          <label class="text-caption text-muted-foreground">Claims (dice or fixed) <AppInput v-model="claimsDice" placeholder="1d4, 2…" /></label>
          <div class="flex flex-col gap-1">
            <span class="text-caption text-muted-foreground">Chest art (optional)</span>
            <div v-if="chestImageUrl" class="flex items-center gap-2">
              <FocalImage :src="chestImageUrl" alt="Chest" format="square" class="h-8 w-8 shrink-0 rounded border border-border" />
              <AppButton variant="ghost" size="icon-xs" :icon="IconClose" tooltip="Remove chest art" @click="chestImageUrl = null" />
            </div>
            <input v-else type="file" accept="image/*" class="text-caption text-muted-foreground" @change="onChestFileChange" />
            <p v-if="uploadingChestImage" class="text-caption-sm text-muted-foreground italic">Uploading…</p>
          </div>
        </div>
      </template>

      <div class="flex justify-end">
        <AppButton label="Prepare" size="sm" :disabled="!canAdd" :loading="adding" @click="add" />
      </div>
    </div>
    <p v-if="error" role="alert" class="text-caption text-destructive">{{ error }}</p>
  </div>
</template>

<script setup lang="ts">
/**
 * The "prepare loot" form of a room (#830): an item, currency, or a loot
 * chest rolled from a table and held until the DM drops it. Split from
 * `LocationLootPanel` so the loot tables, the item index and the stored item
 * refs it reads are fetched when the DM opens the form, not whenever a place
 * is selected (#972, story 11); the held list beside it needs only the loot
 * rows. See the panel for how a drop flips the room's `looted` fact.
 */
import { computed, reactive, ref, watch } from "vue";
import { useCreateLootPlacement } from "@/composables/quests/useQuestFlow";
import { useLootPool } from "@/composables/dungeon-features/useLootPool";
import { itemRefColumns } from "@/lib/itemRef";
import { useLootChestAtoms } from "@/composables/dungeon-features/useLootChestAtoms";
import { useLootTables } from "@/composables/dungeon-features/useLootTables";
import { useImageUpload } from "@/composables/useImageUpload";
import {
  rollLootTable,
  unresolvedReasonLabel,
  type RolledLootEntry,
  type RolledUnresolvedEntry,
} from "@/lib/dungeon-features/lootTableRoll";
import { parseExpression, rollExpression } from "@/lib/dice/dice";
import { formatCoinParts } from "@/rules/currency";
import { IconClose, IconDiceRoll } from "@/lib/icons";
import AppButton from "@/components/common/AppButton.vue";
import AppInput from "@/components/common/AppInput.vue";
import EntityCombobox from "@/components/common/EntityCombobox.vue";
import SegmentedControl from "@/components/common/SegmentedControl.vue";
import type { SegmentedOption } from "@/components/common/SegmentedControl.vue";
import FocalImage from "@/components/common/FocalImage.vue";
import type { LootPlacementKind } from "@/types/quest.types";

const { locationId, campaignId, lootCount } = defineProps<{
  locationId: string;
  campaignId: string;
  /** How many entries the room already holds — the new one sorts after them. */
  lootCount: number;
}>();

const { data: lootTables } = useLootTables();
const createLoot = useCreateLootPlacement();

const KIND_OPTIONS: SegmentedOption<LootPlacementKind>[] = [
  { value: "item", label: "Item" },
  { value: "currency", label: "Currency" },
  { value: "loot_chest", label: "Chest" },
];

const kind = ref<LootPlacementKind>("item");
const itemId = ref("");
const label = ref("");
const quantity = ref(1);
const coins = ["pp", "gp", "ep", "sp", "cp"] as const;
const currency = reactive<Record<(typeof coins)[number], number>>({ pp: 0, gp: 0, ep: 0, sp: 0, cp: 0 });

// ── Loot-chest prep — roll now, hold the result, drop it later ──────────────
const lootTableId = ref("");
const rolledEntries = ref<RolledLootEntry[]>([]);
const claimsDice = ref("1");
const chestImageUrl = ref<string | null>(null);

const adding = ref(false);
const error = ref("");

const lootTableOptions = computed(() => (lootTables.value ?? []).map((table) => ({ id: table.id, name: table.name })));
const selectedLootTable = computed(() => (lootTables.value ?? []).find((table) => table.id === lootTableId.value) ?? null);
const { itemsById, itemOptions } = useLootPool(
  () => (selectedLootTable.value?.entries ?? []).flatMap((e) => (e.item_id ? [e.item_id] : [])),
);

const { atoms: rolledAtoms, isLoading: atomsLoading } = useLootChestAtoms(rolledEntries);
const rolledUnresolved = computed(() => rolledEntries.value.filter((entry): entry is RolledUnresolvedEntry => entry.type === "unresolved"));

/** A fixed integer or a dice expression, resolved to a concrete claim count.
 *  `null` means "doesn't parse yet" — kept distinct from 0, a legitimate
 *  (if useless) roll, so an empty/invalid field doesn't silently become a
 *  chest nobody can claim from. */
function resolveClaimsCount(raw: string): number | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const fixed = Number(trimmed);
  if (Number.isInteger(fixed) && fixed >= 0) return fixed;
  const parsed = parseExpression(trimmed);
  if (!parsed) return null;
  return Math.max(0, Math.floor(rollExpression(parsed)));
}
const claimsCount = computed(() => resolveClaimsCount(claimsDice.value));
const effectiveCap = computed<number | null>(() => {
  if (claimsCount.value === null) return null;
  return Math.min(claimsCount.value, rolledAtoms.value.length);
});

function rollChest() {
  if (!selectedLootTable.value) return;
  rolledEntries.value = rollLootTable(selectedLootTable.value, itemsById.value);
}

const uploadingChestImage = ref(false);
function onChestFileChange(fileEvent: Event) {
  const file = (fileEvent.target as HTMLInputElement).files?.[0];
  if (!file) return;
  uploadingChestImage.value = true;
  const upload = useImageUpload("loot-images");
  upload.upload(file).then((url) => {
    if (url) chestImageUrl.value = url;
    uploadingChestImage.value = false;
  });
}

const canAdd = computed(() => {
  if (kind.value === "item") return !!itemId.value && quantity.value > 0;
  if (kind.value === "currency") return coins.some((coin) => currency[coin] > 0);
  return !!selectedLootTable.value && !atomsLoading.value && rolledAtoms.value.length > 0 && !!effectiveCap.value;
});

function resetDraft() {
  itemId.value = ""; label.value = ""; quantity.value = 1;
  for (const coin of coins) currency[coin] = 0;
  lootTableId.value = ""; rolledEntries.value = []; claimsDice.value = "1"; chestImageUrl.value = null;
}
watch(kind, () => { resetDraft(); error.value = ""; });

async function add() {
  if (!canAdd.value) return;
  adding.value = true;
  error.value = "";
  try {
    if (kind.value === "loot_chest") {
      const table = selectedLootTable.value;
      const cap = effectiveCap.value;
      if (!table || !cap) return;
      await createLoot.mutateAsync({
        beat_id: null,
        quest_id: null,
        location_id: locationId,
        campaign_id: campaignId,
        kind: "loot_chest",
        item_id: null,
        library_item_id: null,
        quantity: 1,
        label: "",
        payload: {
          loot_table_id: table.id,
          loot_table_name: table.name,
          chest_image_url: chestImageUrl.value,
          rolled_atoms: rolledAtoms.value,
          claims_total: cap,
        },
        source_type: "loot_table",
        source_id: table.id,
        sort_order: lootCount,
      });
    } else {
      await createLoot.mutateAsync({
        beat_id: null,
        quest_id: null,
        location_id: locationId,
        campaign_id: campaignId,
        kind: kind.value,
        ...itemRefColumns(kind.value === "item" ? itemId.value : null),
        quantity: kind.value === "item" ? Math.max(1, Math.floor(quantity.value)) : 1,
        label: label.value.trim(),
        payload: kind.value === "currency" ? { ...currency } : {},
        source_type: "prepared",
        source_id: null,
        sort_order: lootCount,
      });
    }
    resetDraft();
  } catch (caught) { error.value = caught instanceof Error ? caught.message : "Could not prepare loot"; }
  finally { adding.value = false; }
}
</script>
