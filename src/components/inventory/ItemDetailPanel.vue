<template>
  <Teleport to="body">
    <Transition name="fade">
      <div
        v-if="inv"
        class="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4"
        @click.self="$emit('close')"
      >
        <div class="bg-card rounded-xl border border-border w-full max-w-md overflow-hidden shadow-2xl flex flex-col max-h-[90vh]">
          <!-- Header -->
          <div class="flex items-center justify-between px-4 py-3 border-b border-border shrink-0">
            <h2 class="font-cinzel text-base font-semibold text-foreground truncate pr-2">{{ inv.name }}</h2>
            <div class="flex items-center gap-2 shrink-0">
              <button
                v-if="inv.location === 'equipped'"
                class="font-cinzel text-[10px] tracking-wider text-destructive hover:opacity-70 transition-opacity"
                @click="emit('unequip')"
              >Unequip</button>
              <button class="text-muted-foreground hover:text-foreground" @click="$emit('close')">
                <IconClose class="h-5 w-5" />
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
        <ItemStatBlock :item="vaultItem" :is-identified="localIdentified" />

        <!-- Quantity (always shown) -->
        <div class="rounded-lg border border-border bg-card/50 p-3 flex items-center justify-between gap-3">
          <span class="font-cinzel text-xs font-semibold text-muted-foreground tracking-wider uppercase">Quantity</span>
          <div class="flex items-center gap-2">
            <button
              class="h-7 w-7 rounded-md border border-border flex items-center justify-center hover:bg-muted transition-colors disabled:opacity-40"
              :disabled="inv.quantity <= 1"
              @click="adjustQty(-1)"
            ><IconMinus class="h-3.5 w-3.5" /></button>
            <span class="font-cinzel text-base font-bold text-foreground min-w-8 text-center">{{ inv.quantity }}</span>
            <button
              class="h-7 w-7 rounded-md border border-border flex items-center justify-center hover:bg-muted transition-colors"
              @click="adjustQty(1)"
            ><IconAdd class="h-3.5 w-3.5" /></button>
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

        <!-- Spells (shown when item has associated spells and is identified) -->
        <div v-if="itemSpells?.length && localIdentified" class="rounded-lg border border-border bg-card/50 p-3 flex flex-col gap-2">
          <p class="font-cinzel text-[10px] font-semibold text-muted-foreground tracking-wider uppercase">Spells</p>
          <div class="divide-y divide-border">
            <div
              v-for="spell in itemSpells"
              :key="spell.id"
              class="flex items-center gap-2 py-2 first:pt-0 last:pb-0"
            >
              <!-- School colour dot -->
              <div class="h-2 w-2 shrink-0 rounded-full" :style="{ backgroundColor: SCHOOL_COLORS[spell.school] }" />
              <!-- Name + level -->
              <div class="flex-1 min-w-0">
                <span class="font-fell text-sm text-foreground">{{ spell.name }}</span>
                <span class="font-cinzel text-[10px] text-muted-foreground ml-1.5">{{ spell.level === 0 ? 'Cantrip' : `Lvl ${spell.level}` }}</span>
              </div>
              <!-- Cast button -->
              <button
                type="button"
                class="shrink-0 flex items-center gap-1 px-2 py-0.5 rounded font-cinzel text-[10px] font-semibold tracking-wider transition-colors border"
                :class="canCastSpell ? 'bg-primary/10 border-primary/30 text-primary hover:bg-primary/20' : 'bg-muted/30 border-border/50 text-muted-foreground/40 cursor-not-allowed'"
                :disabled="!canCastSpell || isCasting"
                :title="castButtonTitle"
                @click="castFromItem(spell)"
              >
                <IconWand class="h-3 w-3" />
                Cast
              </button>
            </div>
          </div>
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

        <!-- Bundle contents (packs only) -->
        <div
          v-if="vaultItem?.bundle_items?.length"
          class="rounded-lg border border-border bg-card/50 p-3 flex flex-col gap-2"
        >
          <p class="font-cinzel text-[10px] font-semibold text-muted-foreground tracking-wider uppercase">Contents</p>
          <ul class="space-y-0.5">
            <li
              v-for="(entry, i) in vaultItem.bundle_items"
              :key="i"
              class="font-fell text-sm text-foreground flex items-baseline gap-1.5"
            >
              <span class="text-muted-foreground text-xs shrink-0">×{{ entry.quantity ?? 1 }}</span>
              {{ entry.name }}
            </li>
          </ul>
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
              <IconReveal v-if="inv.curse_revealed" class="h-3 w-3" />
              <IconHide v-else class="h-3 w-3" />
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
            <IconShop class="h-3.5 w-3.5" />
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
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup lang="ts">
import { computed, ref, reactive, watch } from "vue";
import { IconAdd, IconClose, IconHide, IconMinus, IconReveal, IconShop, IconWand } from '@/lib/icons';
import { useQuery } from "@tanstack/vue-query";
import { COINS, type CoinKey, parseCoinText } from "@/lib/currency";
import FocalImage from "@/components/common/FocalImage.vue";
import RichTextViewer from "@/components/common/RichTextViewer.vue";
import ItemStatBlock from "@/components/inventory/ItemStatBlock.vue";
import { useUpdateInventoryItem } from "@/composables/usePartyInventory";
import { useCampaignMessages } from "@/composables/useCampaignMessages";
import { usePromptedRoll } from "@/composables/usePromptedRoll";
import { supabase } from "@/lib/supabase";
import { parseExpression, parsedToCounts } from "@/lib/dice";
import { rollParsed } from "@/lib/roller";
import { SCHOOL_COLORS } from "@/types/spell.types";
import type { Spell } from "@/types/spell.types";
import { RARITY_BADGE_COLORS } from "@/types/item.types";
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
  consume: [id: string]; // scroll fully used up — parent should remove the inventory row
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

// ── Item spells ───────────────────────────────────────────────────────────────

const { data: itemSpells } = useQuery({
  queryKey: computed(() => ["itemSpells", props.vaultItem?.spell_ids ?? []]),
  queryFn: async () => {
    const ids = props.vaultItem?.spell_ids ?? [];
    if (!ids.length) return [] as Spell[];
    const { data, error } = await supabase
      .from("spells")
      .select("*")
      .in("id", ids)
      .order("level")
      .order("name");
    if (error) throw error;
    return data as Spell[];
  },
  enabled: computed(() => (props.vaultItem?.spell_ids?.length ?? 0) > 0 && localIdentified.value),
});

const { sendFlavorMessage, sendRoll } = useCampaignMessages();
const { promptRoll } = usePromptedRoll();

const isScrollType = computed(() => props.vaultItem?.item_type === "scroll");

/** Cast is possible when there is a carrier and enough charges / uses remaining. */
const canCastSpell = computed(() => {
  if (!props.inv?.carried_by) return false;
  if (isScrollType.value) return props.inv.quantity > 0;
  if (props.vaultItem?.charges) return localCharges.value > 0;
  return true; // free cast (ring cantrip, etc.)
});

const castButtonTitle = computed(() => {
  if (!props.inv?.carried_by) return "No carrier assigned";
  if (isScrollType.value && props.inv.quantity <= 0) return "Scroll consumed";
  if (props.vaultItem?.charges && localCharges.value <= 0) return "No charges remaining";
  if (isScrollType.value) return "Cast and consume scroll";
  if (props.vaultItem?.charges) return `Cast — spend 1 charge (${localCharges.value} remaining)`;
  return "Cast (free use)";
});

const isCasting = ref(false);

async function castFromItem(spell: Spell) {
  if (!props.inv || !canCastSpell.value || isCasting.value) return;
  isCasting.value = true;
  try {
    // Flavor message
    await sendFlavorMessage(`casts ${spell.name} from ${props.inv.name}`, "spell");

    // Auto-roll damage
    if (spell.damage_rolls?.length) {
      for (const dmg of spell.damage_rolls) {
        const parsed = parseExpression(dmg.dice);
        if (!parsed) continue;
        const typeLabel = dmg.type ? ` ${dmg.type}` : "";
        const label = `${spell.name} — ${dmg.dice}${typeLabel} damage`;
        const counts = parsedToCounts(parsed.terms);
        if (Object.keys(counts).length === 0) {
          const { total, breakdown } = rollParsed(parsed);
          void sendRoll({ total, label, modifier: parsed.modifier, breakdown, isCrit: false, isFumble: false, isDamage: true });
        } else {
          await promptRoll({ counts, modifier: parsed.modifier, label, isDamage: true });
        }
      }
    }

    // Auto-roll healing
    if (spell.healing_dice) {
      const parsed = parseExpression(spell.healing_dice);
      if (parsed) {
        const label = `${spell.name} — ${spell.healing_dice} healing`;
        const counts = parsedToCounts(parsed.terms);
        if (Object.keys(counts).length === 0) {
          const { total, breakdown } = rollParsed(parsed);
          void sendRoll({ total, label, modifier: parsed.modifier, breakdown, isCrit: false, isFumble: false, isDamage: false });
        } else {
          await promptRoll({ counts, modifier: parsed.modifier, label, isDamage: false });
        }
      }
    }

    // Consume: scroll = remove/decrement qty; charged item = spend 1 charge
    if (isScrollType.value) {
      if (props.inv.quantity <= 1) {
        emit("consume", props.inv.id); // parent removes the row
      } else {
        await updateInventoryItem({ id: props.inv.id, update: { quantity: props.inv.quantity - 1 } });
      }
    } else if (props.vaultItem?.charges) {
      const next = Math.max(0, localCharges.value - 1);
      localCharges.value = next; // optimistic
      await updateInventoryItem({ id: props.inv.id, update: { current_charges: next } });
    }
  } finally {
    isCasting.value = false;
  }
}

defineExpose({ openSell });
</script>

<style scoped>
.fade-enter-active, .fade-leave-active { transition: opacity 0.2s ease; }
.fade-enter-from, .fade-leave-to { opacity: 0; }
</style>
