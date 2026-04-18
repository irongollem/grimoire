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
        <div class="flex items-center gap-2 shrink-0">
          <button
            v-if="inv.location === 'equipped'"
            class="font-cinzel text-[10px] tracking-wider text-destructive hover:opacity-70 transition-opacity"
            @click="emit('unequip')"
          >Unequip</button>
          <button class="text-muted-foreground hover:text-foreground" @click="$emit('close')">
            <X class="h-5 w-5" />
          </button>
        </div>
      </div>

      <!-- Body -->
      <div class="flex-1 overflow-y-auto p-5 space-y-4">

        <!-- Art: mundane art when unidentified (if present), else identified art -->
        <div
          v-if="displayImageUrl"
          class="w-full rounded-lg overflow-hidden"
          style="aspect-ratio: 2/3; max-height: 50vh"
        >
          <FocalImage
            :src="displayImageUrl!"
            :focal-point="displayImageFocalPoint"
            format="portrait"
            class="h-full"
          />
        </div>

        <!-- Identification status (DM only, magic items) -->
        <div
          v-if="canIdentify && inv && vaultItem && vaultItem.rarity !== 'mundane'"
          class="rounded-lg border p-3 flex items-center justify-between gap-3 transition-colors"
          :class="localIdentified
            ? 'border-border bg-card/50'
            : 'border-amber-500/30 bg-amber-500/5'"
        >
          <div class="flex flex-col gap-0.5">
            <span
              class="font-cinzel text-xs font-semibold tracking-wider uppercase"
              :class="localIdentified ? 'text-muted-foreground' : 'text-amber-500/80'"
            >{{ localIdentified ? 'Identified' : 'Unidentified' }}</span>
            <span class="font-fell text-xs text-muted-foreground italic">
              {{ localIdentified ? 'Players see the full description' : 'Players see only the mundane description' }}
            </span>
          </div>
          <button
            class="shrink-0 px-3 py-1 rounded-md font-cinzel text-[10px] tracking-wider border transition-colors cursor-pointer"
            :class="localIdentified
              ? 'border-border text-muted-foreground hover:border-amber-500/50 hover:text-amber-500 hover:bg-amber-500/5'
              : 'border-amber-500/50 text-amber-500 hover:bg-amber-500/10'"
            @click="toggleIdentified"
          >{{ localIdentified ? 'Unidentify' : 'Identify' }}</button>
        </div>

        <!-- Stat block: type / rarity / cost / weight -->
        <div
          class="rounded-lg border bg-card p-3 flex flex-col gap-1.5 font-stat text-[15px]"
          :style="vaultItem && localIdentified ? { borderColor: rarityColor + '66' } : {}"
        >
          <div v-if="displayItemTypeLabel" class="flex justify-between">
            <span class="text-muted-foreground">Type</span>
            <span class="font-bold">{{ displayItemTypeLabel }}</span>
          </div>
          <div v-if="vaultItem?.subtype && localIdentified" class="flex justify-between">
            <span class="text-muted-foreground">Subtype</span>
            <span>{{ vaultItem.subtype }}</span>
          </div>
          <div v-if="vaultItem" class="flex justify-between">
            <span class="text-muted-foreground">Rarity</span>
            <span
              class="font-bold"
              :style="localIdentified ? { color: RARITY_BADGE_COLORS[vaultItem.rarity] } : { color: RARITY_BADGE_COLORS['mundane'] }"
            >
              {{ localIdentified ? ITEM_RARITY_LABELS[vaultItem.rarity] : ITEM_RARITY_LABELS['mundane'] }}
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
          <!-- Armor class -->
          <div v-if="vaultItem?.armor_class" class="flex justify-between">
            <span class="text-muted-foreground">Armor Class</span>
            <span class="font-bold">{{ vaultItem.armor_class }}</span>
          </div>
          <!-- Weapon damage -->
          <template v-if="vaultItem?.damage_rolls?.length">
            <div v-for="(roll, i) in vaultItem.damage_rolls" :key="i" class="flex justify-between">
              <span class="text-muted-foreground">{{ i === 0 ? 'Damage' : 'Alt. Damage' }}</span>
              <span class="font-bold capitalize">{{ roll.dice }} {{ roll.type }}</span>
            </div>
          </template>
          <div v-if="vaultItem?.versatile_damage && localIdentified" class="flex justify-between">
            <span class="text-muted-foreground">Versatile</span>
            <span>{{ vaultItem.versatile_damage }} (two-handed)</span>
          </div>
          <div v-if="vaultItem?.weapon_range" class="flex justify-between">
            <span class="text-muted-foreground">Range</span>
            <span>{{ vaultItem.weapon_range }}</span>
          </div>
          <!-- Properties (physical only when unidentified) -->
          <div v-if="vaultItem?.properties?.length" class="flex justify-between gap-3">
            <span class="text-muted-foreground shrink-0">Properties</span>
            <span class="text-right capitalize">{{ vaultItem.properties.join(", ") }}</span>
          </div>
          <div v-if="vaultItem?.is_arcane_focus && localIdentified" class="flex justify-between">
            <span class="text-muted-foreground">Arcane Focus</span>
            <span>Yes</span>
          </div>
          <div v-if="vaultItem?.requires_attunement && localIdentified" class="flex justify-between gap-4">
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

        <!-- Charges (only shown when vault item has charges AND item is identified) -->
        <div v-if="vaultItem?.charges && localIdentified" class="rounded-lg border border-border bg-card/50 p-3 flex flex-col gap-3">
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

        <!-- Attunement (hidden until identified) -->
        <div v-if="vaultItem?.requires_attunement && localIdentified" class="rounded-lg border border-border bg-card/50 p-3 flex items-center justify-between gap-3">
          <div class="flex flex-col gap-0.5">
            <span class="font-cinzel text-xs font-semibold text-muted-foreground tracking-wider uppercase">Attunement</span>
            <span v-if="vaultItem.attunement_requirements" class="font-fell text-xs text-muted-foreground italic">{{ vaultItem.attunement_requirements }}</span>
          </div>
          <button
            class="shrink-0 px-3 py-1 rounded-md font-cinzel text-[10px] tracking-wider transition-colors cursor-pointer disabled:cursor-not-allowed"
            :class="localAttuned
              ? 'bg-primary/20 text-primary border border-primary/40 hover:bg-destructive/10 hover:text-destructive hover:border-destructive/40'
              : 'border border-border text-muted-foreground hover:text-foreground hover:bg-muted disabled:opacity-40'"
            :disabled="!localAttuned && attunedCount >= 3"
            :title="!localAttuned && attunedCount >= 3 ? 'Maximum 3 attuned items' : undefined"
            @click="toggleAttunement"
          >{{ localAttuned ? 'Attuned ✓' : attunedCount >= 3 ? 'Slots Full' : 'Attune' }}</button>
        </div>

        <!-- Notes -->
        <div v-if="inv.notes" class="rounded-lg border border-border bg-card/50 p-3">
          <p class="font-cinzel text-[10px] font-semibold text-muted-foreground tracking-wider uppercase mb-1">Notes</p>
          <p class="font-fell text-sm text-foreground">{{ inv.notes }}</p>
        </div>

        <!-- Description: mundane when unidentified, full when identified -->
        <div v-if="displayDescription" class="flex flex-col gap-1">
          <p class="font-cinzel text-xs font-semibold text-primary tracking-wider uppercase">Description</p>
          <RichTextViewer :content="displayDescription" />
        </div>

        <!-- Curse (DM sees it always with reveal toggle; players only see it when revealed) -->
        <div
          v-if="vaultItem?.curse_description && (canIdentify || inv?.curse_revealed)"
          class="rounded-lg border border-destructive/30 bg-destructive/5 p-3 flex flex-col gap-2"
        >
          <div class="flex items-center justify-between gap-2">
            <p class="font-cinzel text-xs font-semibold text-destructive tracking-wider uppercase">Curse</p>
            <button
              v-if="canIdentify && inv"
              type="button"
              :disabled="isTogglingCurse"
              class="inline-flex items-center gap-1.5 rounded px-2 py-1 font-cinzel text-[10px] font-semibold tracking-wider border transition-colors disabled:opacity-50"
              :class="inv.curse_revealed
                ? 'border-amber-500/50 text-amber-500 hover:bg-amber-500/10'
                : 'border-border text-muted-foreground hover:border-primary/50 hover:text-foreground'"
              @click="toggleCurseReveal"
            >
              <Eye v-if="inv.curse_revealed" class="h-3 w-3" />
              <EyeOff v-else class="h-3 w-3" />
              {{ inv.curse_revealed ? 'Revealed to players' : 'Hidden from players' }}
            </button>
          </div>
          <RichTextViewer :content="vaultItem.curse_description" />
        </div>

        <!-- Sell form -->
        <div class="border-t border-border pt-4">
          <button
            v-if="!sellOpen"
            class="flex items-center gap-1.5 font-cinzel text-[10px] tracking-wider text-muted-foreground hover:text-foreground transition-colors"
            @click="openSell"
          >
            <ShoppingBag class="h-3.5 w-3.5" />
            List for Sale
          </button>
          <div v-else class="space-y-2">
            <p class="font-cinzel text-[10px] text-amber-400/80 tracking-widest uppercase">List for Sale</p>
            <div class="grid grid-cols-5 gap-1">
              <div v-for="coin in COINS" :key="coin.key" class="flex flex-col items-center gap-0.5">
                <span class="font-cinzel text-[9px] font-bold" :class="coin.color">{{ coin.symbol }}</span>
                <input
                  v-model.number="sellPrice[coin.key]"
                  type="number" min="0"
                  class="w-full bg-muted/30 border border-border rounded px-1 py-0.5 font-cinzel text-xs text-foreground text-center focus:outline-none focus:ring-1 focus:ring-ring"
                />
              </div>
            </div>
            <div class="flex gap-2">
              <button
                :disabled="!sellHasPrice"
                class="flex-1 py-1 bg-amber-600/80 text-white rounded font-cinzel text-[10px] tracking-wider hover:opacity-90 transition-opacity disabled:opacity-40"
                @click="confirmSell"
              >Post to Chat</button>
              <button
                class="px-2 py-1 border border-border rounded font-cinzel text-[10px] text-muted-foreground hover:text-foreground transition-colors"
                @click="sellOpen = false"
              >Cancel</button>
            </div>
          </div>
        </div>

      </div>
    </aside>
  </Transition>
</template>

<script setup lang="ts">
import { computed, ref, reactive, watch } from "vue";
import { X, Plus, Minus, ShoppingBag, Eye, EyeOff } from "lucide-vue-next";
import { COINS, type CoinKey, parseCoinText } from "@/lib/currency";
import FocalImage from "@/components/common/FocalImage.vue";
import RichTextViewer from "@/components/common/RichTextViewer.vue";
import { useUpdateInventoryItem } from "@/composables/usePartyInventory";
import {
  ITEM_TYPE_LABELS,
  ITEM_RARITY_LABELS,
  RARITY_COLORS,
  RARITY_BADGE_COLORS,
  MAGIC_ONLY_ITEM_TYPES,
} from "@/types/item.types";
import type { PartyInventoryItem } from "@/types/inventory.types";
import type { Item } from "@/types/item.types";

const props = defineProps<{
  inv: PartyInventoryItem | null;
  vaultItem: Item | null;
  attunedCount: number;
  canIdentify?: boolean;
}>();

const emit = defineEmits<{
  close: [];
  unequip: [];
  sell: [pp: number, gp: number, ep: number, sp: number, cp: number];
}>();

const sellOpen  = ref(false);
const sellPrice = reactive<Record<CoinKey, number>>({ pp: 0, gp: 0, ep: 0, sp: 0, cp: 0 });
const sellHasPrice = computed(() => COINS.some(c => sellPrice[c.key] > 0));

function openSell() {
  const parsed = props.vaultItem?.cost ? parseCoinText(props.vaultItem.cost) : null;
  COINS.forEach(c => { sellPrice[c.key] = parsed?.[c.key] ?? 0; });
  sellOpen.value = true;
}

function confirmSell() {
  if (!sellHasPrice.value) return;
  emit('sell', sellPrice.pp, sellPrice.gp, sellPrice.ep, sellPrice.sp, sellPrice.cp);
  sellOpen.value = false;
}

// Reset sell form when panel closes
watch(() => props.inv, () => { sellOpen.value = false; });

const { mutateAsync: updateInventoryItem } = useUpdateInventoryItem();
const isUpdating = ref(false);

const isTogglingCurse = ref(false);
async function toggleCurseReveal() {
  if (!props.inv) return;
  isTogglingCurse.value = true;
  try {
    await updateInventoryItem({ id: props.inv.id, update: { curse_revealed: !props.inv.curse_revealed } });
  } finally {
    isTogglingCurse.value = false;
  }
}

const rarityColor = computed(() =>
  props.vaultItem ? (RARITY_COLORS[props.vaultItem.rarity] ?? "#888888") : "#888888"
);

const displayImageUrl = computed(() =>
  localIdentified.value
    ? props.vaultItem?.image_url
    : (props.vaultItem?.mundane_image_url || props.vaultItem?.image_url)
);

const displayImageFocalPoint = computed(() =>
  localIdentified.value
    ? props.vaultItem?.image_focal_point
    : (props.vaultItem?.mundane_image_focal_point || props.vaultItem?.image_focal_point)
);

const displayItemTypeLabel = computed(() => {
  if (!props.vaultItem) return !localIdentified.value ? ITEM_TYPE_LABELS['art_object'] : null;
  const shouldMask = !localIdentified.value && props.vaultItem.rarity !== 'mundane';
  if (shouldMask && props.vaultItem.item_type === 'potion') return ITEM_TYPE_LABELS['provision'];
  if (shouldMask && MAGIC_ONLY_ITEM_TYPES.has(props.vaultItem.item_type)) return ITEM_TYPE_LABELS['art_object'];
  return ITEM_TYPE_LABELS[props.vaultItem.item_type];
});

const displayDescription = computed(() =>
  localIdentified.value
    ? (props.vaultItem?.description ?? null)
    : (props.vaultItem?.mundane_description ?? null)
);

// Local optimistic charge count — avoids stale reads on rapid clicks before refetch
const localCharges = ref(0);
const localAttuned = ref(false);
const localIdentified = ref(true);

function syncCharges() {
  if (!props.vaultItem?.charges) { localCharges.value = 0; return; }
  localCharges.value = props.inv?.current_charges ?? props.vaultItem.charges;
}

// Sync when panel opens on a new item, or when the server value arrives after refetch
watch(() => [props.inv?.id, props.inv?.current_charges] as const, syncCharges, { immediate: true });
watch(() => [props.inv?.id, props.inv?.is_attuned] as const, () => {
  localAttuned.value = props.inv?.is_attuned ?? false;
}, { immediate: true });
watch(() => [props.inv?.id, props.inv?.is_identified] as const, () => {
  localIdentified.value = props.inv?.is_identified ?? true;
}, { immediate: true });

async function toggleIdentified() {
  if (!props.inv) return;
  localIdentified.value = !localIdentified.value;
  await updateInventoryItem({ id: props.inv.id, update: { is_identified: localIdentified.value } });
}

const currentCharges = computed(() => localCharges.value);

async function toggleAttunement() {
  if (!props.inv) return;
  localAttuned.value = !localAttuned.value;
  await updateInventoryItem({ id: props.inv.id, update: { is_attuned: localAttuned.value } });
}

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

defineExpose({ openSell });
</script>

<style scoped>
.fade-enter-active, .fade-leave-active { transition: opacity 0.2s ease; }
.fade-enter-from, .fade-leave-to { opacity: 0; }
.slide-right-enter-active, .slide-right-leave-active { transition: transform 0.25s ease; }
.slide-right-enter-from, .slide-right-leave-to { transform: translateX(100%); }
</style>
