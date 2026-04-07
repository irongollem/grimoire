<template>
  <Transition name="fade">
    <div
      v-if="inv"
      class="fixed inset-0 bg-black/60 z-40"
      @click="$emit('close')"
    />
  </Transition>

  <Transition name="slide-right">
    <aside
      v-if="inv"
      class="fixed right-0 top-0 bottom-0 w-full max-w-sm bg-card border-l border-border z-50 flex flex-col"
    >
      <!-- Header -->
      <div class="flex items-center justify-between px-5 py-4 border-b border-border shrink-0">
        <h2 class="font-cinzel text-base font-semibold text-foreground truncate pr-2">{{ inv.name }}</h2>
        <button class="text-muted-foreground hover:text-foreground shrink-0" @click="$emit('close')">
          <X class="h-5 w-5" />
        </button>
      </div>

      <!-- Body -->
      <div class="flex-1 overflow-y-auto p-5 space-y-4">

        <!-- Art -->
        <div v-if="vaultItem?.image_url" class="w-full rounded-lg overflow-hidden" style="aspect-ratio: 2/3; max-height: 50vh">
          <FocalImage
            :src="vaultItem.image_url"
            :focal-point="vaultItem.image_focal_point"
            format="portrait"
            class="h-full"
          />
        </div>

        <!-- Stat block: type / rarity / cost / weight -->
        <div
          class="rounded-lg border bg-card p-3 flex flex-col gap-1.5 font-stat text-[15px]"
          :style="vaultItem ? { borderColor: rarityColor + '66' } : {}"
        >
          <div v-if="vaultItem" class="flex justify-between">
            <span class="text-muted-foreground">Type</span>
            <span class="font-bold">{{ ITEM_TYPE_LABELS[vaultItem.item_type] }}</span>
          </div>
          <div v-if="vaultItem?.subtype" class="flex justify-between">
            <span class="text-muted-foreground">Subtype</span>
            <span>{{ vaultItem.subtype }}</span>
          </div>
          <div v-if="vaultItem" class="flex justify-between">
            <span class="text-muted-foreground">Rarity</span>
            <span class="font-bold" :style="{ color: RARITY_BADGE_COLORS[vaultItem.rarity] }">
              {{ ITEM_RARITY_LABELS[vaultItem.rarity] }}
            </span>
          </div>
          <div v-if="vaultItem?.weight" class="flex justify-between">
            <span class="text-muted-foreground">Weight</span>
            <span>{{ vaultItem.weight }}</span>
          </div>
          <div v-if="vaultItem?.cost" class="flex justify-between">
            <span class="text-muted-foreground">Cost</span>
            <span>{{ vaultItem.cost }}</span>
          </div>
          <div v-if="vaultItem?.is_arcane_focus" class="flex justify-between">
            <span class="text-muted-foreground">Arcane Focus</span>
            <span>Yes</span>
          </div>
          <div v-if="vaultItem?.requires_attunement" class="flex justify-between gap-4">
            <span class="text-muted-foreground shrink-0">Attunement</span>
            <span class="text-right">{{ vaultItem.attunement_requirements || "Required" }}</span>
          </div>
        </div>

        <!-- Quantity (always shown) -->
        <div class="rounded-lg border border-border bg-card/50 p-3 flex items-center justify-between gap-3">
          <span class="font-cinzel text-xs font-semibold text-muted-foreground tracking-wider uppercase">Quantity</span>
          <div class="flex items-center gap-2">
            <button
              class="h-7 w-7 rounded-md border border-border flex items-center justify-center hover:bg-muted transition-colors disabled:opacity-40"
              :disabled="inv.quantity <= 1"
              @click="adjustQty(-1)"
            ><Minus class="h-3.5 w-3.5" /></button>
            <span class="font-cinzel text-base font-bold text-foreground min-w-8 text-center">{{ inv.quantity }}</span>
            <button
              class="h-7 w-7 rounded-md border border-border flex items-center justify-center hover:bg-muted transition-colors"
              @click="adjustQty(1)"
            ><Plus class="h-3.5 w-3.5" /></button>
          </div>
        </div>

        <!-- Charges (only shown when vault item has charges) -->
        <div v-if="vaultItem?.charges" class="rounded-lg border border-border bg-card/50 p-3 flex flex-col gap-3">
          <div class="flex items-center justify-between">
            <span class="font-cinzel text-xs font-semibold text-muted-foreground tracking-wider uppercase">Charges</span>
            <span class="font-cinzel text-sm font-bold text-foreground">
              {{ currentCharges }} / {{ vaultItem.charges }}
            </span>
          </div>

          <!-- Charge pips -->
          <div class="flex flex-wrap gap-1.5">
            <div
              v-for="n in vaultItem.charges"
              :key="n"
              class="h-3 w-3 rounded-full border transition-colors"
              :class="n <= currentCharges ? 'bg-primary border-primary' : 'bg-muted border-border'"
            />
          </div>

          <div class="flex gap-2">
            <button
              class="flex-1 py-1.5 rounded-md border border-border font-cinzel text-xs font-semibold text-muted-foreground hover:text-foreground hover:bg-muted transition-colors disabled:opacity-40"
              :disabled="currentCharges <= 0 || isUpdating"
              @click="spendCharge"
            >Spend Charge</button>
            <button
              v-if="vaultItem.recharge"
              class="flex-1 py-1.5 rounded-md bg-primary text-primary-foreground font-cinzel text-xs font-semibold hover:opacity-90 transition-opacity disabled:opacity-40"
              :disabled="currentCharges >= vaultItem.charges || isUpdating"
              @click="recharge"
            >Recharge</button>
          </div>

          <p v-if="vaultItem.recharge" class="font-fell text-xs text-muted-foreground italic">
            {{ vaultItem.recharge }}
          </p>
        </div>

        <!-- Notes -->
        <div v-if="inv.notes" class="rounded-lg border border-border bg-card/50 p-3">
          <p class="font-cinzel text-[10px] font-semibold text-muted-foreground tracking-wider uppercase mb-1">Notes</p>
          <p class="font-fell text-sm text-foreground">{{ inv.notes }}</p>
        </div>

        <!-- Description -->
        <div v-if="vaultItem?.description" class="flex flex-col gap-1">
          <p class="font-cinzel text-xs font-semibold text-primary tracking-wider uppercase">Description</p>
          <RichTextViewer :content="vaultItem.description" />
        </div>

        <!-- Curse (only visible to players once revealed by the DM) -->
        <div
          v-if="vaultItem?.curse_revealed && vaultItem.curse_description"
          class="rounded-lg border border-destructive/30 bg-destructive/5 p-3 flex flex-col gap-2"
        >
          <p class="font-cinzel text-xs font-semibold text-destructive tracking-wider uppercase">Curse</p>
          <RichTextViewer :content="vaultItem.curse_description" />
        </div>

      </div>
    </aside>
  </Transition>
</template>

<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { X, Plus, Minus } from "lucide-vue-next";
import FocalImage from "@/components/common/FocalImage.vue";
import RichTextViewer from "@/components/common/RichTextViewer.vue";
import { useUpdateInventoryItem } from "@/composables/usePartyInventory";
import {
  ITEM_TYPE_LABELS,
  ITEM_RARITY_LABELS,
  RARITY_COLORS,
  RARITY_BADGE_COLORS,
} from "@/types/item.types";
import type { PartyInventoryItem } from "@/types/inventory.types";
import type { Item } from "@/types/item.types";

const props = defineProps<{
  inv: PartyInventoryItem | null;
  vaultItem: Item | null;
}>();

defineEmits<{ close: [] }>();

const { mutateAsync: updateInventoryItem } = useUpdateInventoryItem();
const isUpdating = ref(false);

const rarityColor = computed(() =>
  props.vaultItem ? (RARITY_COLORS[props.vaultItem.rarity] ?? "#888888") : "#888888"
);

// Local optimistic charge count — avoids stale reads on rapid clicks before refetch
const localCharges = ref(0);

function syncCharges() {
  if (!props.vaultItem?.charges) { localCharges.value = 0; return; }
  localCharges.value = props.inv?.current_charges ?? props.vaultItem.charges;
}

// Sync when panel opens on a new item, or when the server value arrives after refetch
watch(() => [props.inv?.id, props.inv?.current_charges] as const, syncCharges, { immediate: true });

const currentCharges = computed(() => localCharges.value);

async function adjustQty(delta: number) {
  if (!props.inv) return;
  const next = Math.max(1, props.inv.quantity + delta);
  await updateInventoryItem({ id: props.inv.id, update: { quantity: next } });
}

async function spendCharge() {
  if (!props.inv || !props.vaultItem?.charges) return;
  isUpdating.value = true;
  try {
    const next = Math.max(0, localCharges.value - 1);
    localCharges.value = next; // optimistic update — renders immediately
    await updateInventoryItem({ id: props.inv.id, update: { current_charges: next } });
  } finally {
    isUpdating.value = false;
  }
}

async function recharge() {
  if (!props.inv || !props.vaultItem?.charges) return;
  isUpdating.value = true;
  try {
    localCharges.value = props.vaultItem.charges; // optimistic update
    await updateInventoryItem({ id: props.inv.id, update: { current_charges: props.vaultItem.charges } });
  } finally {
    isUpdating.value = false;
  }
}
</script>

<style scoped>
.fade-enter-active, .fade-leave-active { transition: opacity 0.2s ease; }
.fade-enter-from, .fade-leave-to { opacity: 0; }
.slide-right-enter-active, .slide-right-leave-active { transition: transform 0.25s ease; }
.slide-right-enter-from, .slide-right-leave-to { transform: translateX(100%); }
</style>
