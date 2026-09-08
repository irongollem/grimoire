<template>
  <!-- ── Roll panel ────────────────────────────────────────────────────────── -->
  <div class="self-start">
    <div class="rounded-lg border border-border bg-card p-4 flex flex-col gap-3">
      <h3 class="font-cinzel text-sm font-bold tracking-wider text-foreground">Roll loot</h3>
      <AppButton
        variant="primary"
        size="md"
        :disabled="!table.entries.length || entriesError !== null"
        :tooltip="entriesError ?? undefined"
        :icon="IconDiceRoll"
        label="Roll"
        @click="onRoll"
      />

      <div v-if="lastRoll" class="rounded-md border border-border bg-muted/40 p-3 flex flex-col gap-2">
        <span class="text-eyebrow font-semibold text-muted-foreground">Drops</span>
        <ul v-if="lastRoll.length" class="flex flex-col gap-1.5">
          <li v-for="r in lastRoll" :key="r.entry_id" class="flex items-center gap-2">
            <template v-if="r.type === 'item'">
              <span class="font-cinzel text-sm font-bold text-primary shrink-0 w-7 text-right">{{ r.qty }}×</span>
              <span class="text-body text-foreground truncate">{{ r.item_name }}</span>
            </template>
            <template v-else-if="r.type === 'currency'">
              <span class="font-cinzel text-sm font-bold text-amber-400 shrink-0 w-7 text-right">💰</span>
              <span class="text-body text-foreground truncate">
                {{ r.currency_label ? r.currency_label + ': ' : '' }}{{ formatCoinParts(r.pp, r.gp, r.ep, r.sp, r.cp).join(', ') || '0 GP' }}
              </span>
            </template>
            <template v-else-if="r.type === 'unresolved'">
              <span class="font-cinzel text-sm font-bold text-amber-500 shrink-0 w-7 text-right" title="This entry hit but produced no loot">⚠</span>
              <span class="text-body text-muted-foreground truncate italic">
                {{ r.wanted }} — {{ unresolvedReasonLabel(r.reason) }}
              </span>
            </template>
          </li>
        </ul>
        <p v-else class="text-caption text-muted-foreground italic">
          Empty — no entries hit. Better luck next room.
        </p>
      </div>

      <p class="text-caption-sm text-muted-foreground italic">
        {{ table.entries.length }} entries · {{ summaryDropPercent }}% expected hit rate
      </p>

      <!-- Drop in chat -->
      <div v-if="!isNew" class="border-t border-border pt-3 flex flex-col gap-2">
        <AppButton
          variant="tinted"
          tone="primary"
          emphasis="outline"
          size="md"
          :disabled="!table.entries.length || entriesError !== null"
          :tooltip="entriesError ?? 'Roll the table and post a chest in chat'"
          :icon="IconPackageOpen"
          label="Drop chest in chat"
          @click="dropDialogOpen = true"
        />
      </div>
    </div>
  </div>

  <!-- ── Drop dialog ─────────────────────────────────────────────────────────── -->
  <LootTableDropDialog
    :open="dropDialogOpen"
    :atoms="dropPreviewAtoms"
    :unresolved="dropPreviewUnresolved"
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
</template>

<script setup lang="ts">
/**
 * Owns the loot table's roll/drop interaction: rolling the table for a
 * preview, and posting a claimable chest into campaign chat. Lifted out of
 * LootTableDetailView (#803) — this is the most self-contained of the view's
 * three concerns (view mode, edit mode, roll/drop), with its own state and no
 * dependency on the view/edit toggle.
 *
 * `table` is the loot table as it would be persisted right now (including
 * unsaved edits) — the single source both `onRoll` and `reroll` roll against,
 * replacing what used to be two hand-built transient objects in the parent.
 */
import { ref, computed, watch } from "vue";
import { IconDiceRoll, IconPackageOpen } from "@/lib/icons";
import { formatCoinParts } from "@/rules/currency";
import {
  rollLootTable,
  unresolvedReasonLabel,
  type RolledLootEntry,
  type RolledUnresolvedEntry,
} from "@/lib/dungeon-features/lootTableRoll";
import { parseExpression, rollExpression } from "@/lib/dice/dice";
import { useCampaignMessages } from "@/composables/campaign/useCampaignMessages";
import type { LootTable } from "@/types/lootTable.types";
import type { Item } from "@/types/item.types";
import type { LootChestAtom, LootChestMetadata } from "@/types/chat.types";
import AppButton from "@/components/common/AppButton.vue";
import LootTableDropDialog from "./LootTableDropDialog.vue";

const { table, itemsById, entriesError, isNew, summaryDropPercent } = defineProps<{
  /** The table as it would be saved right now — id may be "" for a new,
   *  not-yet-created table (the "Drop chest in chat" affordance is hidden via
   *  `isNew` in that case, so rolling against an empty id never surfaces). */
  table: LootTable;
  itemsById: Map<string, Item>;
  entriesError: string | null;
  isNew: boolean;
  summaryDropPercent: number;
}>();

// ── Roll panel ─────────────────────────────────────────────────────────────
const lastRoll = ref<RolledLootEntry[] | null>(null);
function onRoll() {
  lastRoll.value = rollLootTable(table, itemsById);
}

// ── Drop-in-chat dialog ─────────────────────────────────────────────────────
const dropDialogOpen = ref(false);
const claimsDice     = ref("1");
const claimsRolled   = ref<number | null>(1);
const chestImageUrl  = ref<string | null>(null);
const dropping       = ref(false);

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
  dropPreview.value = rollLootTable(table, itemsById);
  rollClaims();
}

const dropPreviewAtoms = computed<LootChestAtom[]>(() => {
  const atoms: LootChestAtom[] = [];
  for (const r of dropPreview.value) {
    if (r.type === "item") {
      const item = itemsById.get(r.item_id);
      for (let i = 0; i < r.qty; i++) {
        atoms.push({
          atom_id:        crypto.randomUUID(),
          type:           "item",
          item_id:        r.item_id,
          item_name:      r.item_name,
          item_image_url: r.item_image_url ?? null,
          item_rarity:    item?.rarity ?? null,
          item_is_container: item?.tags.includes("container") ?? false,
        });
      }
    } else if (r.type === "currency") {
      atoms.push({
        atom_id:        crypto.randomUUID(),
        type:           "currency",
        currency_label: r.currency_label ?? null,
        pp: r.pp, gp: r.gp, ep: r.ep, sp: r.sp, cp: r.cp,
      });
    }
    // "unresolved" entries hit but produced no loot — surfaced separately (below),
    // never turned into a claimable atom.
  }
  return atoms;
});

// Entries that hit but resolved to nothing — shown to the DM so they know the
// chest under-delivers before dropping it (issue #487). Not persisted to the
// player-facing chest.
const dropPreviewUnresolved = computed<RolledUnresolvedEntry[]>(() =>
  dropPreview.value.filter((r): r is RolledUnresolvedEntry => r.type === "unresolved"),
);

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
    loot_table_id:   table.id || null,
    loot_table_name: table.name || "Loot",
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
