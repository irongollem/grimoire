<template>
  <!--
    Mobile-only (<md) item (Vault) edit screen. Rendered by ItemDetail when
    useMediaQuery("(max-width: 767px)") is true; the desktop two-column grid
    form is shown otherwise (byte-identical to before).

    The reactive `form` lives in ItemDetail and is passed down here by reference,
    so this layer owns layout + interaction only — the single source of truth for
    form state stays in ItemDetail. `form` is a reactive proxy whose properties
    are get/set bindings over ItemDetail's existing refs, so v-model here mutates
    those refs directly (same single-source pattern as NpcEditMobile /
    MonsterEditMobile). Action buttons emit back to ItemDetail's handlers.

    Items have no SRD read-only mode (imported items are still editable / cloned
    via the existing Clone action), so there is no fieldset[disabled] banner —
    matching ItemDetail's desktop behaviour.

    Layout top → bottom:
      1. sticky app bar (Cancel · title · overflow ⋮ sheet)
      2. stacked section cards (portrait / identity / physical / weapon / armor /
         magic / charges / bundle / tags / description / mundane / dm notes /
         curse / scope / source)
      3. fixed bottom save bar (Cancel · Save/Create)
  -->
  <div class="flex min-h-dvh flex-col bg-background md:hidden">
    <!-- ── 1. App bar ─────────────────────────────────────────────────────── -->
    <header
      class="sticky top-0 z-20 flex items-center gap-2 border-b border-border bg-background/95 px-2 py-2 pt-[calc(env(safe-area-inset-top)+0.5rem)] backdrop-blur"
    >
      <button
        type="button"
        class="shrink-0 rounded-md px-2 py-2 font-fell text-sm text-muted-foreground active:text-foreground"
        @click="emit('cancel')"
      >
        Cancel
      </button>
      <h1 class="min-w-0 flex-1 truncate text-center font-cinzel text-base font-bold text-foreground">
        {{ title }}
      </h1>
      <button
        v-if="!isNew"
        type="button"
        class="flex size-10 shrink-0 items-center justify-center rounded-full text-muted-foreground active:bg-muted"
        aria-label="More actions"
        @click="showMenu = true"
      >
        <!-- vertical ellipsis -->
        <svg class="size-5" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
          <circle cx="12" cy="5" r="1.6" />
          <circle cx="12" cy="12" r="1.6" />
          <circle cx="12" cy="19" r="1.6" />
        </svg>
      </button>
      <span v-else class="size-10 shrink-0" aria-hidden="true" />
    </header>

    <!-- ── 2. Scroll body ─────────────────────────────────────────────────── -->
    <main class="flex-1 space-y-3 overflow-y-auto p-3 pb-28">
      <p v-if="saveError" class="font-fell text-sm text-destructive">{{ saveError }}</p>

      <!-- Portrait card (tabbed: Identified / Mundane, via EntityImageBlock) -->
      <section class="overflow-hidden rounded-xl border border-border bg-card">
        <EntityImageBlock
          bucket="item-images"
          show-focal-point
          :model-value="form.artTab === 'identified' ? (form.imageUrl || null) : (form.mundaneImageUrl || null)"
          :focal-point="form.artTab === 'identified' ? form.imageFocalPoint : form.mundaneImageFocalPoint"
          :variants="ART_VARIANTS"
          :active-variant-id="form.artTab"
          @update:model-value="form.artTab === 'identified' ? (form.imageUrl = $event || '') : (form.mundaneImageUrl = $event || '')"
          @update:focal-point="form.artTab === 'identified' ? (form.imageFocalPoint = $event) : (form.mundaneImageFocalPoint = $event)"
          @update:active-variant-id="form.artTab = $event as 'identified' | 'mundane'"
        />
      </section>

      <!-- Identity card (name + type/subtype/rarity — fixed enums use native selects) -->
      <section class="space-y-2.5 rounded-xl border border-border bg-card p-4">
        <h3 class="font-cinzel text-base font-bold text-foreground">Identity</h3>
        <label class="block">
          <span class="field-label">Name</span>
          <input v-model="form.name" class="field-input w-full" placeholder="Item name…" />
        </label>
        <label class="block">
          <span class="field-label">Type</span>
          <select v-model="form.itemType" class="field-input w-full">
            <option v-for="t in ITEM_TYPES" :key="t" :value="t">{{ ITEM_TYPE_LABELS[t] }}</option>
          </select>
        </label>
        <template v-if="!isArtObject">
          <label class="block">
            <span class="field-label">Subtype</span>
            <input v-model="form.subtype" class="field-input w-full" placeholder="e.g. longsword, chain mail…" />
          </label>
          <label class="block">
            <span class="field-label">Rarity</span>
            <select v-model="form.rarity" class="field-input w-full" :style="{ borderColor: rarityColor + '66' }">
              <option v-for="r in ITEM_RARITIES" :key="r" :value="r">{{ ITEM_RARITY_LABELS[r] }}</option>
            </select>
          </label>
        </template>
      </section>

      <!-- Physical: Weight + Cost -->
      <section class="space-y-2.5 rounded-xl border border-border bg-card p-4">
        <h3 class="font-cinzel text-base font-bold text-foreground">Physical</h3>
        <label class="block">
          <span class="field-label">Weight</span>
          <WeightInput v-model="form.weight" />
        </label>
        <label class="block">
          <span class="field-label">Cost</span>
          <input v-model="form.cost" class="field-input w-full" placeholder="e.g. 50 gp" />
          <span v-if="rarityPriceHint" class="mt-1 block font-fell text-xs italic text-muted-foreground/60">{{ rarityPriceHint }}</span>
        </label>
      </section>

      <!-- Weapon stats -->
      <section v-if="isWeapon && !isArtObject" class="space-y-2.5 rounded-xl border border-border bg-card p-4">
        <h3 class="font-cinzel text-base font-bold text-foreground">Weapon</h3>
        <ItemWeaponBlock
          :damage-rolls="form.damageRolls"
          :properties="form.properties"
          :versatile-damage="form.versatileDamage"
          :weapon-range="form.weaponRange"
          @update:damage-rolls="form.damageRolls = $event"
          @update:properties="form.properties = $event"
          @update:versatile-damage="form.versatileDamage = $event"
          @update:weapon-range="form.weaponRange = $event"
        />
      </section>

      <!-- Armor stats -->
      <section v-if="isArmor && !isArtObject" class="space-y-2.5 rounded-xl border border-border bg-card p-4">
        <h3 class="font-cinzel text-base font-bold text-foreground">Armor</h3>
        <ItemArmorBlock
          :armor-class="form.armorClass"
          @update:armor-class="form.armorClass = $event"
        />
      </section>

      <!-- Magic properties (attunement) -->
      <section v-if="isMagic && !isArtObject" class="space-y-2.5 rounded-xl border border-border bg-card p-4">
        <h3 class="font-cinzel text-base font-bold text-foreground">Magic Properties</h3>
        <label class="flex cursor-pointer items-center gap-2">
          <input v-model="form.requiresAttunement" type="checkbox" class="size-4 rounded border-border accent-primary" />
          <span class="font-fell text-sm text-foreground">Requires attunement</span>
        </label>
        <input
          v-if="form.requiresAttunement"
          v-model="form.attunementRequirements"
          class="field-input w-full"
          placeholder="by whom? (optional, e.g. by a spellcaster)"
        />
      </section>

      <!-- Charges / Quantity -->
      <section v-if="!isArtObject" class="space-y-2.5 rounded-xl border border-border bg-card p-4">
        <h3 class="font-cinzel text-base font-bold text-foreground">
          {{ form.itemType === "ammunition" ? "Quantity" : "Charges" }}
        </h3>
        <label class="block">
          <span class="field-label">{{ form.itemType === "ammunition" ? "Count" : "Max Charges" }}</span>
          <input v-model.number="form.charges" type="number" min="0" class="field-input w-full" placeholder="e.g. 20" />
        </label>
        <div v-if="isMagic && form.itemType !== 'ammunition'" class="flex flex-col gap-1">
          <span class="field-label">Recharge</span>
          <DiceExprInput
            :model-value="form.rechargeRoll"
            placeholder="1d6+4"
            @update:model-value="form.rechargeRoll = $event"
          />
          <input
            v-model="form.rechargeWhen"
            class="field-input w-full"
            placeholder="dawn / short rest / long rest"
          />
        </div>
        <label class="flex cursor-pointer items-center gap-2">
          <input v-model="form.isArcaneFocus" type="checkbox" class="size-4 rounded border-border accent-primary" />
          <span class="font-fell text-sm text-foreground">Arcane focus</span>
        </label>
        <label class="flex cursor-pointer items-center gap-2">
          <input v-model="form.isContainer" type="checkbox" class="size-4 rounded border-border accent-primary" />
          <span class="font-fell text-sm text-foreground">Container</span>
        </label>
      </section>

      <!-- Bundle contents (packs only) -->
      <section v-if="isPack" class="space-y-2.5 rounded-xl border border-border bg-card p-4">
        <h3 class="font-cinzel text-base font-bold text-foreground">Bundle Contents</h3>
        <div class="flex flex-col gap-1.5">
          <div v-for="(entry, idx) in form.bundleItems" :key="idx" class="flex items-center gap-2">
            <input
              v-model.number="entry.quantity"
              type="number"
              min="1"
              class="field-input w-14 text-center"
            />
            <span class="flex-1 font-fell text-sm text-foreground">{{ entry.name }}</span>
            <button
              type="button"
              class="text-muted-foreground transition-colors active:text-destructive"
              @click="removeBundleItem(idx)"
            ><IconClose class="size-3.5" /></button>
          </div>
        </div>
        <div class="flex gap-2">
          <input
            v-model="bundleItemInput"
            class="field-input flex-1"
            placeholder="Item name…"
            @keydown.enter.prevent="addBundleItem"
          />
          <button
            type="button"
            class="rounded-md border border-border px-3 py-1.5 font-cinzel text-xs font-semibold text-muted-foreground active:bg-muted"
            @click="addBundleItem"
          >Add</button>
        </div>
      </section>

      <!-- Tags card -->
      <section class="space-y-2.5 rounded-xl border border-border bg-card p-4">
        <h3 class="font-cinzel text-base font-bold text-foreground">Tags</h3>
        <TagInput v-model="form.tags" />
      </section>

      <!-- Description card -->
      <section class="space-y-2.5 rounded-xl border border-border bg-card p-4">
        <h3 class="font-cinzel text-base font-bold text-foreground">Description</h3>
        <RichTextEditor
          v-model="form.description"
          placeholder="Describe this item's properties, lore, and any special effects…"
          min-height="160px"
        />
      </section>

      <!-- Mundane description (pre-identification) -->
      <section v-if="isMagic && !isArtObject" class="space-y-2.5 rounded-xl border border-border bg-card p-4">
        <h3 class="font-cinzel text-base font-bold text-foreground">Mundane Description</h3>
        <RichTextEditor
          v-model="form.mundaneDescription"
          placeholder="What does this item appear to be before it's identified?…"
          min-height="120px"
        />
      </section>

      <!-- DM notes -->
      <section class="space-y-2.5 rounded-xl border border-border bg-card p-4">
        <h3 class="font-cinzel text-base font-bold text-foreground">DM Notes</h3>
        <RichTextEditor
          v-model="form.dmNotes"
          placeholder="GM-side notes, foreshadowing, structural beats this item serves…"
          min-height="100px"
        />
      </section>

      <!-- Curse -->
      <section v-if="isMagic && !isArtObject" class="space-y-2.5 rounded-xl border border-border bg-card p-4">
        <div class="flex items-center justify-between gap-2">
          <h3 class="font-cinzel text-base font-bold text-foreground">Curse</h3>
          <label class="flex cursor-pointer items-center gap-2">
            <input v-model="form.isCursed" type="checkbox" class="size-4 rounded border-border accent-primary" />
            <span class="font-fell text-sm text-foreground">Cursed</span>
          </label>
        </div>
        <RichTextEditor
          v-if="form.isCursed"
          v-model="form.curseDescription"
          placeholder="Describe the curse effect, trigger, and how it can be removed…"
          min-height="120px"
        />
      </section>

      <!-- Scope -->
      <section class="space-y-2.5 rounded-xl border border-border bg-card p-4">
        <h3 class="font-cinzel text-base font-bold text-foreground">Scope</h3>
        <div class="flex gap-2">
          <button
            type="button"
            class="flex-1 rounded-md border py-2 font-cinzel text-xs tracking-wide transition-colors"
            :class="form.campaignId === null
              ? 'border-primary/60 bg-primary/15 text-primary'
              : 'border-border text-muted-foreground'"
            @click="form.campaignId = null"
          >General</button>
          <button
            type="button"
            :disabled="!activeCampaignId && !form.campaignId"
            class="flex-1 rounded-md border py-2 font-cinzel text-xs tracking-wide transition-colors disabled:opacity-40"
            :class="form.campaignId !== null
              ? 'border-primary/60 bg-primary/15 text-primary'
              : 'border-border text-muted-foreground'"
            @click="form.campaignId = form.campaignId ?? activeCampaignId"
          >Campaign{{ scopeCampaignName ? ` — ${scopeCampaignName}` : '' }}</button>
        </div>
      </section>

      <!-- Source -->
      <section class="space-y-2.5 rounded-xl border border-border bg-card p-4">
        <h3 class="font-cinzel text-base font-bold text-foreground">Source</h3>
        <div
          v-if="item?.source_url || item?.source_title"
          class="rounded-md border border-border bg-muted/30 px-3 py-2 font-fell text-sm italic text-muted-foreground"
        >
          <a
            v-if="item.source_url"
            :href="item.source_url"
            target="_blank"
            rel="noopener noreferrer"
            class="transition-colors hover:text-foreground hover:underline"
          >{{ itemSourceLabel(form.source, item.source_title) }}</a>
          <span v-else>{{ itemSourceLabel(form.source, item.source_title) }}</span>
        </div>
        <input
          v-else
          v-model="form.source"
          class="field-input w-full"
          placeholder="e.g. Homebrew, DMG, XGtE…"
        />
      </section>
    </main>

    <!-- ── 3. Fixed bottom save bar ───────────────────────────────────────── -->
    <footer
      class="fixed inset-x-0 bottom-0 z-20 flex gap-3 border-t border-border bg-background/95 px-3 pt-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] backdrop-blur"
    >
      <button
        type="button"
        class="min-h-11 shrink-0 basis-28 rounded-lg border border-border px-4 font-cinzel text-sm font-bold tracking-wider text-muted-foreground active:bg-muted"
        @click="emit('cancel')"
      >
        Cancel
      </button>
      <button
        type="button"
        class="min-h-11 flex-1 rounded-lg bg-primary px-4 font-cinzel text-sm font-bold tracking-wider text-primary-foreground active:opacity-90 disabled:opacity-50"
        :disabled="isSaving || !form.name.trim()"
        @click="emit('save')"
      >
        {{ isSaving ? "Saving…" : isNew ? "Create" : "Save Changes" }}
      </button>
    </footer>
  </div>

  <!-- Overflow ⋮ sheet (existing items) — secondary actions -->
  <MobileSheet v-model:open="showMenu" title="Actions">
    <div class="flex flex-col gap-1 pb-2">
      <button
        type="button"
        class="flex w-full items-center gap-3 rounded-lg px-3 py-3 text-left font-fell text-sm text-foreground active:bg-muted/50 disabled:opacity-50"
        :disabled="isSendingToScriptorium"
        @click="runAction('scriptorium')"
      >
        <IconScrollText class="size-4 shrink-0 text-muted-foreground" />
        {{ isSendingToScriptorium ? "Sending…" : "Send to Scriptorium" }}
      </button>
      <button
        type="button"
        class="flex w-full items-center gap-3 rounded-lg px-3 py-3 text-left font-fell text-sm text-foreground active:bg-muted/50 disabled:opacity-50"
        :disabled="isCloning"
        @click="runAction('clone')"
      >
        <IconCopy class="size-4 shrink-0 text-muted-foreground" />
        {{ isCloning ? "Cloning…" : "Clone" }}
      </button>
      <button
        type="button"
        class="flex w-full items-center gap-3 rounded-lg px-3 py-3 text-left font-fell text-sm text-destructive active:bg-destructive/10 disabled:opacity-50"
        :disabled="isDeleting"
        @click="runAction('delete')"
      >
        <IconDelete class="size-4 shrink-0" /> {{ isDeleting ? "Deleting…" : "Delete item" }}
      </button>
    </div>
  </MobileSheet>
</template>

<script setup lang="ts">
import { computed, ref } from "vue";
import EntityImageBlock from "@/components/common/EntityImageBlock.vue";
import TagInput from "@/components/common/TagInput.vue";
import RichTextEditor from "@/components/common/RichTextEditor.vue";
import WeightInput from "@/components/common/WeightInput.vue";
import DiceExprInput from "@/components/common/DiceExprInput.vue";
import MobileSheet from "@/components/common/MobileSheet.vue";
import ItemWeaponBlock from "@/components/items/ItemWeaponBlock.vue";
import ItemArmorBlock from "@/components/items/ItemArmorBlock.vue";
import { IconClose, IconCopy, IconDelete, IconScrollText } from "@/lib/icons";
import {
  ITEM_TYPES,
  ITEM_TYPE_LABELS,
  ITEM_RARITIES,
  ITEM_RARITY_LABELS,
  RARITY_COLORS,
  RARITY_PRICE_HINTS,
  isWeaponType,
  isArmorType,
  itemSourceLabel,
} from "@/types/item.types";
import type { Item, ItemType, ItemRarity } from "@/types/item.types";
import type { DamageRoll } from "@/lib/dice";

// The reactive shape ItemDetail's `form` proxy exposes. Each property is a
// get/set binding over ItemDetail's existing refs, so mutating these here keeps
// ItemDetail the single source of truth.
interface ItemEditForm {
  name: string;
  itemType: ItemType;
  subtype: string;
  rarity: ItemRarity;
  weight: number | null;
  cost: string;
  imageUrl: string;
  imageFocalPoint: { x: number; y: number } | null;
  mundaneImageUrl: string;
  mundaneImageFocalPoint: { x: number; y: number } | null;
  artTab: "identified" | "mundane";
  tags: string[];
  damageRolls: DamageRoll[];
  properties: string[];
  weaponRange: string;
  versatileDamage: string;
  armorClass: string;
  requiresAttunement: boolean;
  attunementRequirements: string;
  charges: number | null;
  rechargeRoll: string | null;
  rechargeWhen: string;
  isArcaneFocus: boolean;
  isContainer: boolean;
  bundleItems: Array<{ name: string; quantity: number }>;
  description: string;
  mundaneDescription: string;
  dmNotes: string;
  isCursed: boolean;
  curseDescription: string;
  campaignId: string | null;
  source: string;
}

const {
  form,
  item = null,
  isNew = false,
  isSaving = false,
  isDeleting = false,
  isCloning = false,
  isSendingToScriptorium = false,
  saveError = "",
  activeCampaignId = null,
  scopeCampaignName = null,
} = defineProps<{
  form: ItemEditForm;
  item?: Item | null;
  isNew?: boolean;
  isSaving?: boolean;
  isDeleting?: boolean;
  isCloning?: boolean;
  isSendingToScriptorium?: boolean;
  saveError?: string;
  activeCampaignId?: string | null;
  scopeCampaignName?: string | null;
}>();

const emit = defineEmits<{
  save: [];
  cancel: [];
  delete: [];
  clone: [];
  scriptorium: [];
}>();

const ART_VARIANTS = [
  { id: "identified", label: "Identified" },
  { id: "mundane", label: "Mundane" },
] as const;

const showMenu = ref(false);
const bundleItemInput = ref("");

const title = computed(() => {
  if (isNew) return "New Item";
  return form.name?.trim() || "Edit Item";
});

const isWeapon = computed(() => isWeaponType(form.itemType));
const isArmor = computed(() => isArmorType(form.itemType));
const isMagic = computed(() => form.rarity !== "mundane");
const isArtObject = computed(() => form.itemType === "art_object");
const isPack = computed(() => form.itemType === "pack");
const rarityColor = computed(() => RARITY_COLORS[form.rarity] ?? "#888888");
const rarityPriceHint = computed(() => RARITY_PRICE_HINTS[form.rarity] ?? "");

function addBundleItem() {
  const name = bundleItemInput.value.trim();
  if (!name) return;
  form.bundleItems = [...form.bundleItems, { name, quantity: 1 }];
  bundleItemInput.value = "";
}
function removeBundleItem(idx: number) {
  form.bundleItems = form.bundleItems.filter((_, i) => i !== idx);
}

function runAction(action: "scriptorium" | "clone" | "delete") {
  showMenu.value = false;
  if (action === "scriptorium") emit("scriptorium");
  else if (action === "clone") emit("clone");
  else emit("delete");
}
</script>

<style scoped>
@reference "@/assets/main.css";
.field-input {
  @apply w-full bg-muted border border-border rounded-md px-3 py-1.5 font-fell text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring;
}
.field-label {
  @apply block font-cinzel text-xs font-semibold tracking-wider text-muted-foreground mb-1;
}
</style>
