<template>
  <div class="flex flex-col gap-3">
    <div class="flex items-center justify-between">
      <span class="text-label-lg font-semibold text-muted-foreground">Inventory</span>
    </div>

    <!-- Item list -->
    <div v-if="items?.length" class="flex flex-col gap-1.5">
      <div
        v-for="si in items"
        :key="si.id"
        class="flex flex-col rounded-md border border-border bg-card overflow-hidden"
      >
        <!-- Main row -->
        <div class="flex items-center gap-2 px-3 py-2">
          <!-- Visibility toggle -->
          <button
            type="button"
            :title="si.visible ? 'Visible (click to hide)' : 'Under the counter (click to show)'"
            class="shrink-0 text-muted-foreground hover:text-foreground transition-colors"
            @click="toggleVisible(si)"
          >
            <IconReveal v-if="si.visible" class="h-3.5 w-3.5" />
            <IconHide v-else class="h-3.5 w-3.5 opacity-40" />
          </button>

          <!-- Item name + type (tap to preview) -->
          <button
            type="button"
            class="flex-1 min-w-0 text-left hover:opacity-80 transition-opacity"
            @click="selected = si"
          >
            <span class="font-cinzel text-xs font-semibold text-foreground truncate block">{{ si.item.name }}</span>
            <span class="font-fell text-2xs text-muted-foreground italic">
              {{ ITEM_TYPE_LABELS[si.item.item_type] }}
              <span v-if="!si.visible" class="text-amber-500/70"> · under the counter</span>
            </span>
          </button>

          <!-- Price -->
          <div class="flex items-center gap-1 shrink-0">
            <input
              :value="si.price_override ?? si.item.cost ?? ''"
              type="text"
              placeholder="Price…"
              :title="rarityPriceHint(si.item.rarity)"
              class="w-20 bg-background border border-border rounded px-2 py-0.5 font-fell text-xs text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-ring text-right"
              @blur="onPriceBlur(si, $event)"
              @keydown.enter="($event.target as HTMLInputElement).blur()"
            />
          </div>

          <!-- Post to chat -->
          <button
            type="button"
            :title="offeringId === si.id ? 'Cancel offer' : 'Post vendor offer to chat'"
            class="shrink-0 transition-colors"
            :class="offeringId === si.id ? 'text-emerald-400' : 'text-muted-foreground hover:text-emerald-400'"
            @click="toggleOffer(si)"
          >
            <IconShop class="h-3.5 w-3.5" />
          </button>

          <!-- Remove -->
          <button
            type="button"
            class="shrink-0 text-muted-foreground hover:text-destructive transition-colors"
            title="Remove from store"
            @click="remove(si.id)"
          >
            <IconClose class="h-3.5 w-3.5" />
          </button>
        </div>

        <!-- Inline offer form -->
        <div v-if="offeringId === si.id" class="border-t border-border/60 bg-muted/20 px-3 py-2 space-y-2">
          <p class="font-cinzel text-[0.5625rem] text-emerald-400/80 tracking-widest uppercase">Vendor Offer</p>
          <input
            v-model="offerDesc"
            type="text"
            placeholder="Description shown in chat…"
            class="w-full bg-muted/30 border border-border rounded px-2 py-1 font-fell text-sm text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:ring-1 focus:ring-ring"
          />
          <!-- Coin price inputs -->
          <div class="grid grid-cols-5 gap-1">
            <div v-for="coin in COINS" :key="coin.key" class="flex flex-col items-center gap-0.5">
              <span class="font-cinzel text-[0.5625rem] font-bold" :class="coin.color">{{ coin.symbol }}</span>
              <input
                v-model.number="offerPrice[coin.key]"
                type="number" min="0"
                class="w-full bg-muted/30 border border-border rounded px-1 py-0.5 font-cinzel text-xs text-foreground text-center focus:outline-none focus:ring-1 focus:ring-ring"
              />
            </div>
          </div>
          <div class="flex gap-2">
            <button
              type="button"
              :disabled="!offerDesc.trim() || !offerHasPrice"
              class="flex-1 py-1 bg-emerald-600 text-white rounded text-label hover:opacity-90 transition-opacity disabled:opacity-40"
              @click="postOffer(si)"
            >Post to Chat</button>
            <button
              type="button"
              class="px-2 py-1 border border-border rounded font-cinzel text-2xs text-muted-foreground hover:text-foreground transition-colors"
              @click="offeringId = null"
            >Cancel</button>
          </div>
        </div>
      </div>
    </div>

    <p v-else class="font-fell text-xs text-muted-foreground italic">No items yet.</p>

    <!-- Manual add (search) -->
    <div class="relative">
      <div class="flex items-center gap-2 rounded-md border border-dashed border-border bg-background px-3 py-2">
        <IconAdd class="h-3.5 w-3.5 text-muted-foreground shrink-0" />
        <input
          v-model="search"
          type="text"
          placeholder="Add item to inventory…"
          class="flex-1 bg-transparent font-fell text-xs text-foreground placeholder:text-muted-foreground focus:outline-none"
          @focus="dropdownOpen = true"
          @input="dropdownOpen = true"
          @blur="onSearchBlur"
          @keydown.escape="dropdownOpen = false"
        />
      </div>
      <div
        v-if="dropdownOpen && searchResults.length"
        class="absolute left-0 right-0 top-full mt-1 z-50 rounded-md border border-border bg-popover shadow-lg overflow-hidden max-h-48 overflow-y-auto"
      >
        <button
          v-for="item in searchResults"
          :key="item.id"
          type="button"
          class="w-full flex items-center gap-2 px-3 py-1.5 text-left hover:bg-muted transition-colors"
          @mousedown.prevent="addItem(item)"
        >
          <span class="font-cinzel text-xs font-semibold text-foreground truncate flex-1">{{ item.name }}</span>
          <span class="font-fell text-2xs text-muted-foreground shrink-0">{{ ITEM_TYPE_LABELS[item.item_type] }}</span>
          <span v-if="item.cost" class="font-fell text-2xs text-muted-foreground/70 shrink-0">{{ item.cost }}</span>
        </button>
      </div>
    </div>

    <!-- Quick fill -->
    <div class="flex items-center gap-1.5 flex-wrap">
      <input
        v-model.number="fillCount"
        type="number"
        min="1"
        max="20"
        class="w-10 bg-muted border border-border rounded px-1.5 py-1 font-fell text-xs text-foreground text-center focus:outline-none focus:ring-1 focus:ring-ring"
      />
      <span class="font-fell text-xs text-muted-foreground">×</span>
      <select
        v-model="fillRarity"
        class="bg-muted border border-border rounded px-2 py-1 font-fell text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
      >
        <option v-for="r in ITEM_RARITIES" :key="r" :value="r">{{ ITEM_RARITY_LABELS[r] }}</option>
      </select>
      <select
        v-model="fillType"
        class="bg-muted border border-border rounded px-2 py-1 font-fell text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
      >
        <option value="">any type</option>
        <option v-for="t in ITEM_TYPES" :key="t" :value="t">{{ ITEM_TYPE_LABELS[t] }}</option>
      </select>
      <button
        type="button"
        :disabled="fillPoolSize === 0 || isFilling"
        class="inline-flex items-center gap-1 rounded-md bg-primary px-2.5 py-1 font-cinzel text-[0.6875rem] font-semibold text-primary-foreground hover:opacity-90 transition-opacity disabled:opacity-40"
        @click="quickFill"
      >
        <IconShuffle class="size-3" />
        {{ isFilling ? "Filling…" : "Fill" }}
      </button>
      <span class="font-fell text-2xs text-muted-foreground italic">
        {{ fillPoolSize }} available
      </span>
    </div>
  </div>

  <!-- Item detail modal -->
  <Teleport to="body">
    <div
      v-if="selected"
      class="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm p-0 sm:p-4"
      @click.self="selected = null"
      @keydown.escape="selected = null"
    >
      <div class="w-full sm:max-w-2xl bg-card border border-border rounded-t-2xl sm:rounded-xl shadow-xl flex flex-col max-h-[90vh] overflow-hidden">
        <div class="flex items-center gap-3 px-4 py-3 border-b border-border shrink-0">
          <h2 class="font-cinzel text-sm font-semibold text-foreground flex-1 truncate">
            {{ selected.item.name }}
          </h2>
          <span class="font-fell text-xs text-muted-foreground shrink-0">
            {{ selected.price_override ?? selected.item.cost ?? '—' }}
          </span>
          <button
            type="button"
            class="text-muted-foreground hover:text-foreground transition-colors ml-1 shrink-0"
            @click="selected = null"
          >
            <IconClose class="h-4 w-4" />
          </button>
        </div>
        <div class="flex-1 overflow-y-auto px-4 py-4">
          <ItemSheet :item="selected.item" :price-override="selected.price_override" />
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { ref, computed, reactive } from "vue";
import { IconAdd, IconClose, IconHide, IconReveal, IconShop, IconShuffle } from '@/lib/icons';
import ItemSheet from "@/components/items/ItemSheet.vue";
import { useItems } from "@/composables/useItems";
import {
  useStoreItems,
  useAddStoreItem,
  useAddStoreItems,
  useUpdateStoreItem,
  useRemoveStoreItem,
} from "@/composables/useStoreItems";
import type { StoreItem } from "@/composables/useStoreItems";
import type { Item } from "@/types/item.types";
import { ITEM_TYPE_LABELS, ITEM_RARITIES, ITEM_RARITY_LABELS, ITEM_TYPES, RARITY_PRICE_HINTS } from "@/types/item.types";
import { useCampaignMessages } from "@/composables/useCampaignMessages";
import { COINS, type CoinKey, parseCoinText } from "@/lib/currency";

const props = defineProps<{ locationId: string; ownerNpcName?: string | null }>();

const locationIdRef = computed(() => props.locationId);

const { data: items } = useStoreItems(locationIdRef);
const { data: allItems } = useItems();
const { mutate: add } = useAddStoreItem();
const { mutate: addMany, isPending: isFilling } = useAddStoreItems();
const { mutate: update } = useUpdateStoreItem(locationIdRef);
const { mutate: removeItem } = useRemoveStoreItem(locationIdRef);
const { sendVendorOffer } = useCampaignMessages();

// ── Add item search ─────────────────────────────────────────────────────────────
const search = ref("");
const dropdownOpen = ref(false);

const existingItemIds = computed(() => new Set((items.value ?? []).map((si) => si.item_id)));

const searchResults = computed(() => {
  const q = search.value.toLowerCase().trim();
  return (allItems.value ?? [])
    .filter((i) => !existingItemIds.value.has(i.id) && (q === "" || i.name.toLowerCase().includes(q)))
    .slice(0, 10);
});

function addItem(item: Item) {
  search.value = "";
  dropdownOpen.value = false;
  add({ location_id: props.locationId, item_id: item.id });
}

function onSearchBlur() {
  setTimeout(() => { dropdownOpen.value = false; }, 150);
}

// ── Toggle visibility ───────────────────────────────────────────────────────────
function toggleVisible(si: StoreItem) {
  update({ id: si.id, update: { visible: !si.visible } });
}

// ── Price override ──────────────────────────────────────────────────────────────
function onPriceBlur(si: StoreItem, e: FocusEvent) {
  const val = (e.target as HTMLInputElement).value.trim() || null;
  const effective = val === si.item.cost ? null : val;
  if (effective !== si.price_override) {
    update({ id: si.id, update: { price_override: effective } });
  }
}

// ── Remove ──────────────────────────────────────────────────────────────────────
function remove(id: string) {
  removeItem(id);
}

function rarityPriceHint(rarity: string | null | undefined): string {
  return RARITY_PRICE_HINTS[(rarity ?? "") as keyof typeof RARITY_PRICE_HINTS] ?? "";
}

// ── Quick fill ──────────────────────────────────────────────────────────────────
const fillCount  = ref(3);
const fillRarity = ref("uncommon");
const fillType   = ref("");

const fillPool = computed(() =>
  (allItems.value ?? []).filter(
    (i) =>
      !existingItemIds.value.has(i.id) &&
      i.rarity === fillRarity.value &&
      (fillType.value === "" || i.item_type === fillType.value),
  ),
);
const fillPoolSize = computed(() => fillPool.value.length);

function quickFill() {
  const pool = [...fillPool.value];
  // Fisher-Yates shuffle then take fillCount
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  // The input's max attribute doesn't stop typed values — clamp to 1..20.
  const count = Math.min(Math.max(1, Math.floor(fillCount.value || 1)), 20);
  const picks = pool.slice(0, count);
  if (picks.length === 0) return;
  addMany(picks.map((item) => ({ location_id: props.locationId, item_id: item.id })));
}

// ── Vendor offer form ───────────────────────────────────────────────────────────

const selected = ref<StoreItem | null>(null);

const offeringId  = ref<string | null>(null);
const offerDesc   = ref("");
const offerPrice  = reactive<Record<CoinKey, number>>({ pp: 0, gp: 0, ep: 0, sp: 0, cp: 0 });
const offerHasPrice = computed(() => COINS.some(c => offerPrice[c.key] > 0));

function toggleOffer(si: StoreItem) {
  if (offeringId.value === si.id) {
    offeringId.value = null;
    return;
  }
  offeringId.value = si.id;
  offerDesc.value = si.item.name;
  const priceText = si.price_override ?? si.item.cost ?? "";
  const parsed = parseCoinText(priceText);
  COINS.forEach(c => { offerPrice[c.key] = parsed[c.key]; });
}

async function postOffer(si: StoreItem) {
  if (!offerDesc.value.trim() || !offerHasPrice.value) return;
  await sendVendorOffer(
    offerDesc.value.trim(),
    si.item.name,
    si.item_id,
    offerPrice.pp, offerPrice.gp, offerPrice.ep, offerPrice.sp, offerPrice.cp,
    props.ownerNpcName ?? undefined,
  );
  offeringId.value = null;
}
</script>
