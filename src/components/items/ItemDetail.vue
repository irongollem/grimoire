<template>
  <div class="flex flex-col gap-6">
    <p v-if="saveError" class="text-destructive text-body">{{ saveError }}</p>

    <div class="grid grid-cols-1 lg:grid-cols-[13.75rem_1fr] gap-6">
      <!-- Left: Portrait + Tags -->
      <div class="flex flex-col gap-4">
        <!-- Portrait (tabbed: Identified / Mundane) -->
        <EntityImageBlock
          bucket="item-images"
          show-focal-point
          :model-value="artTab === 'identified' ? (imageUrl || null) : (mundaneImageUrl || null)"
          :focal-point="artTab === 'identified' ? imageFocalPoint : mundaneImageFocalPoint"
          :variants="[{ id: 'identified', label: 'Identified' }, { id: 'mundane', label: 'Mundane' }]"
          :active-variant-id="artTab"
          ai-kind="item"
          :ai-target-id="props.item?.id"
          :ai-context="aiContext"
          @update:model-value="artTab === 'identified' ? (imageUrl = $event) : (mundaneImageUrl = $event)"
          @update:focal-point="artTab === 'identified' ? (imageFocalPoint = $event) : (mundaneImageFocalPoint = $event)"
          @update:active-variant-id="artTab = $event as 'identified' | 'mundane'"
        />

        <!-- Tags -->
        <div class="rounded-lg border border-border bg-card p-4 flex flex-col gap-3">
          <h3 class="text-label-lg font-bold text-muted-foreground uppercase">Tags</h3>
          <TagInput v-model="tags" />
        </div>

        <!-- Linked spells summary (when spells selected) -->
        <div v-if="selectedSpells.length" class="rounded-lg border border-border bg-card p-4 flex flex-col gap-2">
          <h3 class="text-label-lg font-bold text-muted-foreground uppercase">Linked Spells</h3>
          <div class="flex flex-col gap-1">
            <div v-for="spell in selectedSpells" :key="spell.id" class="flex items-center justify-between gap-2">
              <span class="text-caption text-foreground">{{ spell.name }}</span>
              <span class="font-cinzel text-2xs text-muted-foreground">{{ spell.level === 0 ? 'Cantrip' : `L${spell.level}` }}</span>
            </div>
          </div>
        </div>
      </div>

      <!-- Right: Main form -->
      <div class="flex flex-col gap-4">
        <!-- Name -->
        <input
          v-model="name"
          placeholder="Item name…"
          class="w-full bg-card border border-border rounded-md px-3 py-2 text-heading font-bold text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
        />

        <!-- Type + Subtype + Rarity -->
        <div class="grid gap-3" :class="isArtObject ? 'grid-cols-1' : 'grid-cols-3'">
          <label class="flex flex-col gap-1">
            <span class="text-label-lg text-muted-foreground uppercase">Type</span>
            <AppSelect v-model="itemType" size="lg">
              <option v-for="t in ITEM_TYPES" :key="t" :value="t">{{ ITEM_TYPE_LABELS[t] }}</option>
            </AppSelect>
          </label>
          <template v-if="!isArtObject">
            <label class="flex flex-col gap-1">
              <span class="text-label-lg text-muted-foreground uppercase">Subtype</span>
              <AppInput
                v-model="subtype"
                placeholder="e.g. longsword, chain mail…"
                tone="card"
                size="body"
              />
            </label>
            <label class="flex flex-col gap-1">
              <span class="text-label-lg text-muted-foreground uppercase">Rarity</span>
              <AppSelect
                v-model="rarity"
                size="lg"
                :style="{ borderColor: rarityColor + '66' }"
              >
                <option v-for="r in ITEM_RARITIES" :key="r" :value="r">{{ ITEM_RARITY_LABELS[r] }}</option>
              </AppSelect>
            </label>
          </template>
        </div>

        <!-- Physical: Weight + Cost -->
        <div class="grid grid-cols-2 gap-3">
          <label class="flex flex-col gap-1">
            <span class="text-label-lg text-muted-foreground uppercase">Weight</span>
            <WeightInput v-model="weight" />
          </label>
          <label class="flex flex-col gap-1">
            <span class="text-label-lg text-muted-foreground uppercase">Cost</span>
            <AppInput
              v-model="cost"
              placeholder="e.g. 50 gp"
              tone="card"
              size="body"
            />
            <span v-if="rarityPriceHint" class="text-caption text-muted-foreground/60 italic">{{ rarityPriceHint }}</span>
          </label>
        </div>

        <!-- Weapon stats (damage + properties) -->
        <ItemWeaponBlock
          v-if="isWeapon && !isArtObject"
          :damage-rolls="damageRolls"
          :properties="properties"
          :versatile-damage="versatileDamage"
          :weapon-range="weaponRange"
          :mastery="mastery"
          @update:damage-rolls="damageRolls = $event"
          @update:properties="properties = $event"
          @update:versatile-damage="versatileDamage = $event"
          @update:weapon-range="weaponRange = $event"
          @update:mastery="mastery = $event"
        />

        <!-- Armor stats -->
        <ItemArmorBlock
          v-if="isArmor && !isArtObject"
          :armor-class="armorClass"
          @update:armor-class="armorClass = $event"
        />

        <!-- Attunement (shown for non-mundane) -->
        <div
          v-if="isMagic && !isArtObject"
          class="rounded-lg border border-border bg-card/50 p-4 flex flex-col gap-2"
        >
          <h3 class="text-label-lg font-bold text-muted-foreground uppercase">
            Magic Properties
          </h3>
          <label class="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" v-model="requiresAttunement" class="rounded" />
            <span class="text-label-lg font-semibold text-muted-foreground">REQUIRES ATTUNEMENT</span>
          </label>
          <AppInput
            v-if="requiresAttunement"
            v-model="attunementRequirements"
            placeholder="by whom? (optional, e.g. by a spellcaster)"
            tone="muted"
            size="body"
          />
        </div>

        <!-- Charges / Quantity (independent of spells — any item can have charges) -->
        <div v-if="!isArtObject" class="rounded-lg border border-border bg-card/50 p-4 flex flex-col gap-3">
          <h3 class="text-label-lg font-bold text-muted-foreground uppercase">
            {{ itemType === "ammunition" ? "Quantity" : "Charges" }}
            <span class="normal-case font-fell font-normal text-muted-foreground/60"> — optional</span>
          </h3>
          <div class="grid grid-cols-2 gap-3">
            <label class="flex flex-col gap-1">
              <span class="text-eyebrow text-muted-foreground">{{ itemType === "ammunition" ? "Count" : "Max Charges" }}</span>
              <AppInput
                v-model.number="charges"
                type="number"
                min="0"
                placeholder="e.g. 20"
                tone="muted"
                size="body"
              />
            </label>
            <div v-if="isMagic && itemType !== 'ammunition'" class="flex flex-col gap-1">
              <span class="text-eyebrow text-muted-foreground">Recharge</span>
              <DiceExprInput
                :model-value="rechargeRoll"
                placeholder="1d6+4"
                @update:model-value="rechargeRoll = $event"
              />
              <AppInput
                v-model="rechargeWhen"
                placeholder="dawn / short rest / long rest"
                tone="muted"
                size="body"
              />
            </div>
          </div>
          <label class="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" v-model="isArcaneFocus" class="rounded" />
            <span class="text-label-lg font-semibold text-muted-foreground">ARCANE FOCUS</span>
          </label>
          <label class="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" v-model="isContainer" class="rounded" />
            <span class="text-label-lg font-semibold text-muted-foreground">CONTAINER</span>
          </label>
        </div>

        <!-- Bundle contents (packs only) -->
        <div v-if="isPack" class="rounded-lg border border-border bg-card/50 p-4 flex flex-col gap-3">
          <h3 class="text-label-lg font-bold text-muted-foreground uppercase">
            Bundle Contents
            <span class="normal-case font-fell font-normal text-muted-foreground/60"> — items added when this pack is opened</span>
          </h3>
          <div class="flex flex-col gap-1.5">
            <div
              v-for="(entry, idx) in bundleItems"
              :key="idx"
              class="flex items-center gap-2"
            >
              <AppInput
                v-model.number="entry.quantity"
                type="number" min="1"
                size="sm"
                tone="muted"
                align="center"
                class="w-14"
              />
              <span class="text-body text-foreground flex-1">{{ entry.name }}</span>
              <button
                type="button"
                class="text-muted-foreground hover:text-destructive transition-colors"
                @click="removeBundleItem(idx)"
              ><IconClose class="h-3.5 w-3.5" /></button>
            </div>
          </div>
          <div class="flex gap-2">
            <AppInput
              v-model="bundleItemInput"
              placeholder="Item name…"
              tone="muted"
              size="body"
              class="flex-1"
              @keydown.enter.prevent="addBundleItem"
            />
            <AppButton variant="subtle" size="sm" label="Add" @click="addBundleItem" />
          </div>
        </div>

        <!-- Spell references (optional, links to Spellbook entries) -->
        <div v-if="isMagic && !isArtObject" class="rounded-lg border border-border bg-card/50 p-4 flex flex-col gap-2">
          <div class="flex items-center justify-between">
            <h3 class="text-label-lg font-bold text-muted-foreground uppercase">
              Linked Spells
              <span class="normal-case font-fell font-normal text-muted-foreground/60"> — optional</span>
            </h3>
            <span v-if="selectedSpells.length" class="text-caption-sm text-muted-foreground italic">{{ selectedSpells.length }} linked</span>
          </div>
          <input
            v-model="spellSearch"
            placeholder="Search your Spellbook…"
            class="bg-muted border border-border rounded-md px-3 py-1.5 text-caption text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
          />
          <div class="max-h-40 overflow-y-auto flex flex-col gap-1 rounded border border-border/50 bg-muted/30 p-2">
            <p v-if="!filteredSpells.length" class="text-caption text-muted-foreground italic px-1">
              {{ spellsLoading ? 'Loading spells…' : 'No spells found. Add spells in the Spellbook.' }}
            </p>
            <label
              v-for="spell in filteredSpells"
              :key="spell.id"
              class="flex items-center gap-2 cursor-pointer py-0.5 px-1 rounded hover:bg-muted"
            >
              <input type="checkbox" :value="spell.id" v-model="spellIds" class="rounded shrink-0" />
              <span class="text-caption text-foreground">{{ spell.name }}</span>
              <span class="font-cinzel text-2xs text-muted-foreground ml-auto shrink-0">
                {{ spell.level === 0 ? 'Cantrip' : `L${spell.level}` }} · {{ spell.school }}
              </span>
            </label>
          </div>
        </div>

        <!-- Mundane description (pre-identification) -->
        <div v-if="isMagic && !isArtObject" class="flex flex-col gap-1">
          <span class="text-label-lg text-muted-foreground uppercase">
            Mundane Description
            <span class="normal-case font-fell font-normal text-muted-foreground/60"> — shown before identification</span>
          </span>
          <RichTextEditor
            v-model="mundaneDescription"
            placeholder="What does this item appear to be before it's identified? Describe only its physical appearance — no magical hints…"
            min-height="120px"
          />
        </div>

        <!-- Description -->
        <div class="flex flex-col gap-1">
          <span class="text-label-lg text-muted-foreground uppercase">Description</span>
          <RichTextEditor
            v-model="description"
            placeholder="Describe this item's properties, lore, and any special effects…"
            min-height="200px"
          />
        </div>

        <!-- DM notes — never shown to players -->
        <div class="rounded-lg border border-amber-700/40 bg-amber-950/10 p-4 flex flex-col gap-2">
          <h3 class="text-label-lg font-bold text-amber-300/80 uppercase">
            DM Notes
            <span class="normal-case font-fell font-normal text-muted-foreground/70"> — never shown to players</span>
          </h3>
          <RichTextEditor
            v-model="dmNotes"
            placeholder="GM-side notes, foreshadowing, structural beats this item serves…"
            min-height="100px"
          />
        </div>

        <!-- Curse -->
        <div v-if="isMagic && !isArtObject" class="rounded-lg border border-border bg-card/50 p-4 flex flex-col gap-3">
          <div class="flex items-center justify-between gap-2">
            <h3 class="text-label-lg font-bold text-muted-foreground uppercase">
              Curse
              <span class="normal-case font-fell font-normal text-muted-foreground/60"> — optional</span>
            </h3>
            <label class="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" v-model="isCursed" class="rounded" />
              <span class="text-label-lg font-semibold text-muted-foreground">CURSED</span>
            </label>
          </div>
          <template v-if="isCursed">
            <RichTextEditor
              v-model="curseDescription"
              placeholder="Describe the curse effect, trigger, and how it can be removed…"
              min-height="120px"
            />
            <p class="text-caption text-muted-foreground italic">
              Reveal the curse to players via the party inventory panel once a player attunes or triggers it.
            </p>
          </template>
        </div>

        <!-- Scope -->
        <CampaignScopeField v-model="campaignId" />

        <!-- Source -->
        <div class="flex flex-col gap-1">
          <span class="text-label-lg text-muted-foreground uppercase">Source</span>
          <!-- Imported items: read-only with optional link -->
          <div
            v-if="props.item?.source_url || props.item?.source_title"
            class="bg-muted/30 border border-border rounded-md px-3 py-2 text-body text-muted-foreground italic"
          >
            <a
              v-if="props.item.source_url"
              :href="props.item.source_url"
              target="_blank"
              rel="noopener noreferrer"
              class="hover:text-foreground hover:underline transition-colors"
            >{{ itemSourceLabel(source, props.item.source_title) }}</a>
            <span v-else>{{ itemSourceLabel(source, props.item.source_title) }}</span>
          </div>
          <!-- Custom items: editable -->
          <AppInput
            v-else
            v-model="source"
            placeholder="e.g. Homebrew, DMG, XGtE…"
            tone="card"
            size="body"
          />
        </div>
      </div>

    </div>
  </div>
</template>

<script setup lang="ts">
import { IconClose } from '@/lib/icons';
import { useConfirm } from "@/composables/useConfirm";
const { confirm, notify } = useConfirm();
import { ref, computed } from "vue";
import { useRouter, useRoute } from "vue-router";
import AppButton from "@/components/common/AppButton.vue";
import AppInput from "@/components/common/AppInput.vue";
import AppSelect from "@/components/common/AppSelect.vue";
import CampaignScopeField from "@/components/common/CampaignScopeField.vue";
import DiceExprInput from "@/components/common/DiceExprInput.vue";
import EntityImageBlock from "@/components/common/EntityImageBlock.vue";
import ItemWeaponBlock from "@/components/items/ItemWeaponBlock.vue";
import ItemArmorBlock from "@/components/items/ItemArmorBlock.vue";
import { useCreateItem, useUpdateItem, useDeleteItem } from "@/composables/useItems";
import { useSpells } from "@/composables/useSpells";
import { useCampaignStore } from "@/stores/campaign";
import { storeToRefs } from "pinia";
import { useCreateScriptoriumDocument } from "@/composables/useScriptorium";
import { formatItemForScriptorium } from "@/lib/scriptorium/scriptoriumImport";
import WeightInput from "@/components/common/WeightInput.vue";
import TagInput from "@/components/common/TagInput.vue";
import RichTextEditor from "@/components/common/RichTextEditor.vue";
import {
  ITEM_TYPES,
  ITEM_TYPE_LABELS,
  ITEM_RARITIES,
  ITEM_RARITY_LABELS,
  RARITY_SURFACE_BG,
  RARITY_PRICE_HINTS,
  isWeaponType,
  isArmorType,
  itemSourceLabel,
} from "@/types/item.types";
import type { Item, ItemType, ItemRarity, WeaponMasteryProperty } from "@/types/item.types";
import type { DamageRoll } from "@/lib/dice/dice";
import { buildEntityContext, toPlainText } from "@/ai/utils";
import { markEdited, type AiProvenance } from "@/ai/provenance";
import { deepEqual } from "@/lib/utils";

const props = defineProps<{ item: Item | null; prefillName?: string }>();
const router = useRouter();
const route = useRoute();

// ── Core fields ───────────────────────────────────────────────────────────────
const name = ref(props.item?.name ?? props.prefillName ?? "");
const itemType = ref<ItemType>(props.item?.item_type ?? "gear");
const subtype = ref(props.item?.subtype ?? "");
const rarity = ref<ItemRarity>(props.item?.rarity ?? "mundane");
const weight = ref<number | null>(
  typeof props.item?.weight === "string"
    ? parseFloat(props.item.weight) || null
    : (props.item?.weight ?? null),
);
const cost = ref(props.item?.cost ?? "");
const description = ref(props.item?.description ?? "");
const mundaneDescription = ref(props.item?.mundane_description ?? "");
const source = ref(props.item?.source ?? "");
const imageUrl = ref(props.item?.image_url ?? "");
const imageFocalPoint = ref(props.item?.image_focal_point ?? null);
const mundaneImageUrl = ref(props.item?.mundane_image_url ?? "");
const mundaneImageFocalPoint = ref(props.item?.mundane_image_focal_point ?? null);
const artTab = ref<'identified' | 'mundane'>('identified');
const tags = ref<string[]>(props.item?.tags ?? []);
const aiProvenance = ref<AiProvenance | null>(props.item?.ai_provenance ?? null);

const aiContext = computed(() => {
  const base = [name.value, ITEM_TYPE_LABELS[itemType.value], ITEM_RARITY_LABELS[rarity.value]];
  return artTab.value === 'identified'
    ? buildEntityContext([...base, toPlainText(description.value)])
    // Mundane art shows the item before identification — describe only its plain form.
    : buildEntityContext([name.value, ITEM_TYPE_LABELS[itemType.value], toPlainText(mundaneDescription.value)]);
});

// ── Weapon fields ─────────────────────────────────────────────────────────────
const damageRolls = ref<DamageRoll[]>(props.item?.damage_rolls ?? []);
const properties = ref<string[]>(props.item?.properties ?? []);
const weaponRange = ref(props.item?.weapon_range ?? "");
const versatileDamage = ref(props.item?.versatile_damage ?? "");
const mastery = ref<WeaponMasteryProperty | null>(props.item?.mastery ?? null);

// ── Armor fields ──────────────────────────────────────────────────────────────
const armorClass = ref(props.item?.armor_class ?? "");

// ── Spellcasting ──────────────────────────────────────────────────────────────
const isArcaneFocus = ref(props.item?.is_arcane_focus ?? false);
const isContainer = computed({
  get: () => tags.value.includes('container'),
  set: (v) => {
    if (v && !tags.value.includes('container')) tags.value = [...tags.value, 'container'];
    else if (!v) tags.value = tags.value.filter(t => t !== 'container');
  },
});

// ── Pack / bundle fields ───────────────────────────────────────────────────────
const bundleItems = ref<Array<{ name: string; quantity: number }>>(
  (props.item?.bundle_items ?? []).map(e => ({ name: e.name, quantity: e.quantity ?? 1 })),
);
const isPack = computed(() => itemType.value === "pack");
const bundleItemInput = ref("");

function addBundleItem() {
  const name = bundleItemInput.value.trim();
  if (!name) return;
  bundleItems.value = [...bundleItems.value, { name, quantity: 1 }];
  bundleItemInput.value = "";
}
function removeBundleItem(idx: number) {
  bundleItems.value = bundleItems.value.filter((_, i) => i !== idx);
}

// ── Curse fields ──────────────────────────────────────────────────────────────
const isCursed = ref(!!(props.item?.curse_description));
const curseDescription = ref(props.item?.curse_description ?? "");

// ── Scope + DM notes ──────────────────────────────────────────────────────────
const { activeCampaignId } = storeToRefs(useCampaignStore());
const campaignId = ref<string | null>(props.item?.campaign_id ?? activeCampaignId.value ?? null);
const dmNotes = ref(props.item?.dm_notes ?? "");

// ── Magic fields ──────────────────────────────────────────────────────────────
const requiresAttunement = ref(props.item?.requires_attunement ?? false);
const attunementRequirements = ref(props.item?.attunement_requirements ?? "");
const charges = ref<number | null>(props.item?.charges ?? null);

function parseRecharge(val: string | null): { roll: string | null; when: string } {
  if (!val) return { roll: null, when: "" };
  const m = val.match(/^(.+?)\s+charges?\s+(?:at\s+)?(.*)$/i);
  return m ? { roll: m[1].trim(), when: m[2].trim() } : { roll: val, when: "" };
}
const { roll: _rechargeRoll, when: _rechargeWhen } = parseRecharge(props.item?.recharge ?? null);
const rechargeRoll = ref<string | null>(_rechargeRoll);
const rechargeWhen = ref(_rechargeWhen);
const spellIds = ref<string[]>(props.item?.spell_ids ?? []);

// ── Spell picker ──────────────────────────────────────────────────────────────
const { data: allSpells, isLoading: spellsLoading } = useSpells();
const spellSearch = ref("");

const filteredSpells = computed(() => {
  const q = spellSearch.value.trim().toLowerCase();
  return (allSpells.value ?? []).filter(
    (s) =>
      !q ||
      s.name.toLowerCase().includes(q) ||
      s.school.toLowerCase().includes(q),
  );
});

const selectedSpells = computed(
  () => (allSpells.value ?? []).filter((s) => spellIds.value.includes(s.id)),
);

// ── Derived ───────────────────────────────────────────────────────────────────
const isWeapon = computed(() => isWeaponType(itemType.value));
const isArmor = computed(() => isArmorType(itemType.value));
const isMagic = computed(() => rarity.value !== "mundane");

const rarityPriceHint = computed(() => RARITY_PRICE_HINTS[rarity.value] ?? "");
const isArtObject = computed(() => itemType.value === "art_object");
const rarityColor = computed(() => RARITY_SURFACE_BG[rarity.value] ?? "#888888");

// ── Save / Delete ─────────────────────────────────────────────────────────────
const { mutateAsync: createItem } = useCreateItem();
const { mutateAsync: updateItem } = useUpdateItem();
const { mutateAsync: deleteItem } = useDeleteItem();
const isSaving = ref(false);
const isDeleting = ref(false);
const isCloning = ref(false);
const saveError = ref("");

function buildPayload() {
  return {
    name: name.value.trim(),
    item_type: itemType.value,
    subtype: subtype.value.trim() || null,
    rarity: rarity.value,
    requires_attunement: requiresAttunement.value,
    attunement_requirements: requiresAttunement.value
      ? attunementRequirements.value.trim() || null
      : null,
    weight: weight.value,
    cost: cost.value.trim() || null,
    damage_rolls: isWeapon.value && damageRolls.value.length ? damageRolls.value : null,
    armor_class: isArmor.value ? armorClass.value.trim() || null : null,
    properties: isWeapon.value ? properties.value : [],
    mastery: isWeapon.value ? mastery.value : null,
    weapon_range: isWeapon.value ? weaponRange.value.trim() || null : null,
    versatile_damage: isWeapon.value ? versatileDamage.value.trim() || null : null,
    charges: charges.value ?? null,
    recharge: rechargeRoll.value
      ? `${rechargeRoll.value} charges${rechargeWhen.value ? ` at ${rechargeWhen.value}` : ""}`.trim()
      : null,
    spell_ids: spellIds.value,
    description: description.value,
    mundane_description: isMagic.value ? mundaneDescription.value || null : null,
    source: source.value.trim() || null,
    source_title: props.item?.source_title ?? null,
    source_url: props.item?.source_url ?? null,
    tags: tags.value,
    image_url: imageUrl.value || null,
    image_focal_point: imageFocalPoint.value,
    mundane_image_url: mundaneImageUrl.value || null,
    mundane_image_focal_point: mundaneImageFocalPoint.value,
    is_arcane_focus: isArcaneFocus.value,
    curse_description: isCursed.value ? curseDescription.value || null : null,
    bundle_items: isPack.value && bundleItems.value.length
      ? bundleItems.value.map(e => ({ name: e.name, quantity: e.quantity }))
      : null,
    campaign_id: campaignId.value,
    dm_notes: dmNotes.value.trim() ? dmNotes.value : null,
    ai_provenance: aiProvenance.value,
  };
}

async function save() {
  if (!name.value.trim()) return;
  isSaving.value = true;
  saveError.value = "";
  try {
    if (props.item) {
      // Material edit detection (#606): tags, art, spell links, bundle
      // contents, DM notes (never AI-authored) and campaign scope are
      // excluded per the "moves/tags/image" carve-outs.
      const contentChanged =
        name.value.trim() !== props.item.name ||
        itemType.value !== props.item.item_type ||
        (subtype.value.trim() || null) !== props.item.subtype ||
        rarity.value !== props.item.rarity ||
        requiresAttunement.value !== props.item.requires_attunement ||
        !deepEqual(
          requiresAttunement.value ? attunementRequirements.value.trim() || null : null,
          props.item.attunement_requirements,
        ) ||
        weight.value !== props.item.weight ||
        (cost.value.trim() || null) !== props.item.cost ||
        !deepEqual(isWeapon.value && damageRolls.value.length ? damageRolls.value : null, props.item.damage_rolls) ||
        (isArmor.value ? armorClass.value.trim() || null : null) !== props.item.armor_class ||
        !deepEqual(isWeapon.value ? properties.value : [], props.item.properties) ||
        (isWeapon.value ? weaponRange.value.trim() || null : null) !== props.item.weapon_range ||
        (isWeapon.value ? versatileDamage.value.trim() || null : null) !== props.item.versatile_damage ||
        charges.value !== props.item.charges ||
        (rechargeRoll.value
          ? `${rechargeRoll.value} charges${rechargeWhen.value ? ` at ${rechargeWhen.value}` : ""}`.trim()
          : null) !== props.item.recharge ||
        !deepEqual(description.value, props.item.description) ||
        !deepEqual(isMagic.value ? mundaneDescription.value || null : null, props.item.mundane_description) ||
        (source.value.trim() || null) !== props.item.source ||
        !deepEqual(isCursed.value ? curseDescription.value || null : null, props.item.curse_description) ||
        isArcaneFocus.value !== props.item.is_arcane_focus;
      if (contentChanged) aiProvenance.value = markEdited(aiProvenance.value);

      await updateItem({ id: props.item.id, update: buildPayload() });
      router.push("/vault");
    } else {
      await createItem(buildPayload());
      const redirect = route.query.redirect as string | undefined;
      router.replace(redirect ?? "/vault");
    }
  } catch (e: unknown) {
    saveError.value = e instanceof Error ? e.message : "Failed to save";
  } finally {
    isSaving.value = false;
  }
}

async function confirmDelete() {
  if (!props.item?.id) return;
  if (!await confirm(`Delete "${props.item.name}"? This cannot be undone.`)) return;
  isDeleting.value = true;
  try {
    await deleteItem(props.item);
    router.push("/vault");
  } catch {
    notify("Failed to delete item. Please try again.");
  } finally {
    isDeleting.value = false;
  }
}

// ── Clone ─────────────────────────────────────────────────────────────────────
async function cloneItem() {
  if (!props.item) return;
  isCloning.value = true;
  try {
    const created = await createItem({
      ...buildPayload(),
      name: `${props.item.name} - Clone`,
      source: null,
      source_title: null,
      source_url: null,
    });
    router.replace(`/vault/${created.id}?edit=true`);
  } finally {
    isCloning.value = false;
  }
}

// ── Scriptorium ───────────────────────────────────────────────────────────────
const { mutateAsync: createDoc } = useCreateScriptoriumDocument();
const isSendingToScriptorium = ref(false);

async function sendToScriptorium() {
  if (!props.item) return;
  isSendingToScriptorium.value = true;
  try {
    const data = formatItemForScriptorium(props.item, selectedSpells.value);
    const doc = await createDoc(data);
    router.push(`/scriptorium/${doc.id}`);
  } finally {
    isSendingToScriptorium.value = false;
  }
}

defineExpose({
  isSaving,
  isDeleting,
  isCloning,
  isSendingToScriptorium,
  canSave: computed(() => !!name.value.trim()),
  save,
  confirmDelete,
  cloneItem,
  sendToScriptorium,
})
</script>
