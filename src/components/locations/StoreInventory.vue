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
          <AppButton
            variant="ghost"
            size="icon-xs"
            class="shrink-0"
            :tooltip="si.visible ? 'Visible (click to hide)' : 'Under the counter (click to show)'"
            @click="toggleVisible(si)"
          >
            <template #icon>
              <IconReveal v-if="si.visible" class="h-3.5 w-3.5" />
              <IconHide v-else class="h-3.5 w-3.5 opacity-40" />
            </template>
          </AppButton>

          <!-- Item name + type (tap to preview) -->
          <button
            type="button"
            class="flex-1 min-w-0 text-left hover:opacity-80 transition-opacity"
            @click="selected = si"
          >
            <span class="font-cinzel text-xs font-semibold text-foreground truncate block">{{ si.item.name }}</span>
            <span class="text-caption-sm text-muted-foreground italic">
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
              class="w-20 bg-background border border-border rounded px-2 py-0.5 text-caption text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-ring text-right"
              @blur="onPriceBlur(si, $event)"
              @keydown.enter="($event.target as HTMLInputElement).blur()"
            />
          </div>

          <!-- Post to chat -->
          <AppButton
            variant="ghost"
            tone="success"
            :active="offeringId === si.id"
            size="icon-xs"
            class="shrink-0"
            :tooltip="offeringId === si.id ? 'Cancel offer' : 'Post vendor offer to chat'"
            :icon="IconShop"
            @click="toggleOffer(si)"
          />

          <!-- Remove -->
          <AppButton
            variant="ghost"
            tone="danger"
            size="icon-xs"
            class="shrink-0"
            tooltip="Remove from store"
            :icon="IconClose"
            @click="remove(si.id)"
          />
        </div>

        <!-- Inline offer form -->
        <div v-if="offeringId === si.id" class="border-t border-border/60 bg-muted/20 px-3 py-2 space-y-2">
          <p class="font-cinzel text-2xs text-emerald-400/80 tracking-widest uppercase">Vendor Offer</p>
          <AppInput
            v-model="offerDesc"
            type="text"
            tone="muted"
            size="body"
            placeholder="Description shown in chat…"
          />
          <!-- Coin price inputs -->
          <div class="grid grid-cols-5 gap-1">
            <div v-for="coin in COINS" :key="coin.key" class="flex flex-col items-center gap-0.5">
              <span class="font-cinzel text-2xs font-bold" :class="coin.color">{{ coin.symbol }}</span>
              <AppInput
                v-model.number="offerPrice[coin.key]"
                type="number" min="0"
                tone="muted"
                size="xs"
                align="center"
              />
            </div>
          </div>
          <div class="flex gap-2">
            <AppButton
              variant="tinted"
              tone="success"
              emphasis="solid"
              size="xs"
              class="flex-1"
              :disabled="!offerDesc.trim() || !offerHasPrice"
              label="Post to Chat"
              @click="postOffer(si)"
            />
            <AppButton
              variant="subtle"
              size="xs"
              label="Cancel"
              @click="offeringId = null"
            />
          </div>
        </div>
      </div>
    </div>

    <p v-else class="text-caption text-muted-foreground italic">No items yet.</p>

    <!-- Manual add (search) -->
    <div class="relative">
      <div class="flex items-center gap-2 rounded-md border border-dashed border-border bg-background px-3 py-2">
        <IconAdd class="h-3.5 w-3.5 text-muted-foreground shrink-0" />
        <AppInput
          v-model="search"
          type="text"
          tone="bare"
          size="xs"
          :block="false"
          placeholder="Add item to inventory…"
          class="flex-1 px-0 text-caption"
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
        <AppButton
          v-for="item in searchResults"
          :key="item.id"
          variant="menu"
          size="body"
          block
          @mousedown.prevent="addItem(item)"
        >
          <span class="font-cinzel text-xs font-semibold text-foreground truncate flex-1">{{ item.name }}</span>
          <span class="text-caption-sm text-muted-foreground shrink-0">{{ ITEM_TYPE_LABELS[item.item_type] }}</span>
          <span v-if="item.cost" class="text-caption-sm text-muted-foreground/70 shrink-0">{{ item.cost }}</span>
        </AppButton>
      </div>
    </div>

    <!-- Quick fill -->
    <div class="flex items-center gap-1.5 flex-wrap">
      <AppInput
        v-model.number="fillCount"
        type="number"
        min="1"
        max="20"
        tone="muted"
        size="xs"
        align="center"
        :block="false"
        class="w-10"
      />
      <span class="text-caption text-muted-foreground">×</span>
      <AppSelect v-model="fillRarity" size="sm" tone="filled">
        <option v-for="r in ITEM_RARITIES" :key="r" :value="r">{{ ITEM_RARITY_LABELS[r] }}</option>
      </AppSelect>
      <AppSelect v-model="fillType" size="sm" tone="filled">
        <option value="">any type</option>
        <option v-for="t in ITEM_TYPES" :key="t" :value="t">{{ ITEM_TYPE_LABELS[t] }}</option>
      </AppSelect>
      <AppButton
        variant="primary"
        size="sm"
        :disabled="fillPoolSize === 0 || isFilling"
        :icon="IconShuffle"
        :label="isFilling ? 'Filling…' : 'Fill'"
        @click="quickFill"
      />
      <span class="text-caption-sm text-muted-foreground italic">
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
          <span class="text-caption text-muted-foreground shrink-0">
            {{ selected.price_override ?? selected.item.cost ?? '—' }}
          </span>
          <AppButton
            variant="ghost"
            size="icon-xs"
            class="ml-1 shrink-0"
            :icon="IconClose"
            icon-size="md"
            @click="selected = null"
          />
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
import AppButton from "@/components/common/AppButton.vue";
import AppInput from "@/components/common/AppInput.vue";
import AppSelect from "@/components/common/AppSelect.vue";
import ItemSheet from "@/components/items/ItemSheet.vue";
import { useItems, useEnsureOwnedItem } from "@/composables/useItems";
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
import { COINS, type CoinKey, parseCoinText } from "@/rules/currency";

const props = defineProps<{ locationId: string; ownerNpcName?: string | null }>();

const locationIdRef = computed(() => props.locationId);

const { data: items } = useStoreItems(locationIdRef);
const { data: allItems } = useItems();
const { ensureOwnedItem } = useEnsureOwnedItem();
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

async function addItem(item: Item) {
  search.value = "";
  dropdownOpen.value = false;
  const owned = await ensureOwnedItem(item);
  add({ location_id: props.locationId, item_id: owned.id });
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

async function quickFill() {
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
  // Srd rows in the pool must become user-owned rows before the FK insert —
  // clone each (idempotent, so repeat picks of the same srd item just resolve
  // to the same owned row) before handing the batch to addMany.
  const owned = await Promise.all(picks.map((item) => ensureOwnedItem(item)));
  addMany(owned.map((item) => ({ location_id: props.locationId, item_id: item.id })));
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
