<template>
  <div class="flex flex-col gap-6">
    <p v-if="saveError" class="text-destructive text-body">{{ saveError }}</p>
    <DraftConflictNotice :fields="conflictLabels" :on-discard="reset" />

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
              <span class="text-label text-muted-foreground">{{ spell.level === 0 ? 'Cantrip' : `L${spell.level}` }}</span>
            </div>
          </div>
        </div>
      </div>

      <!-- Right: Main form -->
      <div class="flex flex-col gap-4">
        <!-- Name -->
        <AppInput
          v-model="name"
          placeholder="Item name…"
          tone="card"
          size="heading"
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
          <AppCheckbox v-model="requiresAttunement" label-role="label-lg" label="REQUIRES ATTUNEMENT" />
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
            <span class="normal-case font-fell font-normal text-muted-foreground/60">(optional)</span>
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
          <AppCheckbox v-model="isArcaneFocus" label-role="label-lg" label="ARCANE FOCUS" />
          <AppCheckbox v-model="isContainer" label-role="label-lg" label="CONTAINER" />
        </div>

        <!-- Bundle contents (packs only) -->
        <div v-if="isPack" class="rounded-lg border border-border bg-card/50 p-4 flex flex-col gap-3">
          <h3 class="text-label-lg font-bold text-muted-foreground uppercase">
            Bundle Contents
            <span class="normal-case font-fell font-normal text-muted-foreground/60">(items added when this pack is opened)</span>
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
              <AppButton
                variant="ghost"
                tone="danger"
                size="inline-xs"
                :icon="IconClose"
                @click="removeBundleItem(idx)"
              />
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
              <span class="normal-case font-fell font-normal text-muted-foreground/60">(optional)</span>
            </h3>
            <span v-if="selectedSpells.length" class="text-caption-sm text-muted-foreground italic">{{ selectedSpells.length }} linked</span>
          </div>
          <AppInput
            v-model="spellSearch"
            placeholder="Search your Spellbook…"
            tone="filled"
            size="caption"
          />
          <div class="max-h-40 overflow-y-auto flex flex-col gap-1 rounded border border-border/50 bg-muted/30 p-2">
            <p v-if="!filteredSpells.length" class="text-caption text-muted-foreground italic px-1">
              {{ spellsLoading ? 'Loading spells…' : 'No spells found. Add spells in the Spellbook.' }}
            </p>
            <AppCheckbox
              v-for="spell in filteredSpells"
              :key="spell.id"
              v-model="spellIds"
              :value="spell.id"
              label-role="caption"
              label-layout="row"
              class="rounded py-0.5 px-1 hover:bg-muted"
            >
              <span class="truncate">{{ spell.name }}</span>
              <span class="text-caption-sm text-muted-foreground ml-auto shrink-0">
                {{ spell.level === 0 ? 'Cantrip' : `L${spell.level}` }} · {{ spell.school }}
              </span>
            </AppCheckbox>
          </div>
        </div>

        <!-- Mundane description (pre-identification) -->
        <div v-if="isMagic && !isArtObject" class="flex flex-col gap-1">
          <span class="text-label-lg text-muted-foreground uppercase">
            Mundane Description
            <span class="normal-case font-fell font-normal text-muted-foreground/60">(shown before identification)</span>
          </span>
          <RichTextEditor
            v-model="mundaneDescription"
            allow-secrets
            placeholder="What does this item appear to be before it's identified? Describe only its physical appearance, no magical hints…"
            size="md"
          />
        </div>

        <!-- Description -->
        <div class="flex flex-col gap-1">
          <span class="text-label-lg text-muted-foreground uppercase">Description</span>
          <RichTextEditor
            v-model="description"
            allow-secrets
            placeholder="Describe this item's properties, lore, and any special effects…"
            size="md"
          />
        </div>

        <!-- Written contents — in-world text the object itself carries -->
        <ItemWrittenContentsCard
          :item="item"
          v-model:has-written-content="hasWrittenContent"
          v-model:content="content"
          v-model:player-writable="contentPlayerWritable"
        />

        <!-- Curse -->
        <ItemEditorCard
          v-if="isMagic && !isArtObject"
          title="Curse"
          hint="optional"
          toggle-label="CURSED"
          v-model:toggle="isCursed"
          :gap="3"
        >
          <template v-if="isCursed">
            <RichTextEditor
              v-model="curseDescription"
              allow-secrets
              placeholder="Describe the curse effect, trigger, and how it can be removed…"
              size="md"
            />
            <p class="text-caption text-muted-foreground italic">
              Reveal the curse to players via the party inventory panel once a player attunes or triggers it.
            </p>
          </template>
        </ItemEditorCard>

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

  <PaywallModal v-model="showScriptoriumPaywall" resource="scriptorium_documents" />
</template>

<script setup lang="ts">
import { IconClose } from '@/lib/icons';
import { useConfirm } from "@/composables/useConfirm";
const { confirm, notify } = useConfirm();
import { isQuotaExceeded } from "@/lib/quotaError";
import PaywallModal from "@/components/common/overlays/PaywallModal.vue";
import { ref, computed, toRefs } from "vue";
import { useRouter, useRoute } from "vue-router";
import AppButton from "@/components/common/controls/AppButton.vue";
import AppCheckbox from "@/components/common/controls/AppCheckbox.vue";
import AppInput from "@/components/common/controls/AppInput.vue";
import AppSelect from "@/components/common/controls/AppSelect.vue";
import CampaignScopeField from "@/components/common/entity/CampaignScopeField.vue";
import DiceExprInput from "@/components/common/dice/DiceExprInput.vue";
import EntityImageBlock from "@/components/common/entity/EntityImageBlock.vue";
import ItemWeaponBlock from "@/components/items/ItemWeaponBlock.vue";
import ItemArmorBlock from "@/components/items/ItemArmorBlock.vue";
import ItemEditorCard from "@/components/items/ItemEditorCard.vue";
import ItemWrittenContentsCard from "@/components/items/ItemWrittenContentsCard.vue";
import { useCreateItem, useUpdateItem, useDeleteItem } from "@/composables/items/useItems";
import { useSpellIndex } from "@/composables/spells/useSpellIndex";
import { useSpellsByIds } from "@/composables/spells/useSpellsByIds";
import { useCampaignStore } from "@/stores/campaign";
import { storeToRefs } from "pinia";
import { useCreateScriptoriumDocument } from "@/composables/scriptorium/useScriptorium";
import { formatItemForScriptorium } from "@/lib/scriptorium/scriptoriumImport";
import { buildEntityEmbedDocumentContent } from "@/lib/scriptorium/entityEmbeds";
import WeightInput from "@/components/common/controls/WeightInput.vue";
import TagInput from "@/components/common/controls/TagInput.vue";
import RichTextEditor from "@/components/common/richtext/RichTextEditor.vue";
import {
  cleanupRemovedRichTextImages,
  removeRichTextImages,
  extractRichTextImageUrls,
} from "@/composables/useImageUpload";
import { tiptapToPlainText } from "@/lib/tiptap/tiptapText";
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
import { useRecordDraft, cloneDraftValue } from "@/composables/useRecordDraft";
import DraftConflictNotice from "@/components/common/feedback/DraftConflictNotice.vue";

const props = defineProps<{ item: Item | null; prefillName?: string }>();
const router = useRouter();
const route = useRoute();

function parseRecharge(val: string | null): { roll: string | null; when: string } {
  if (!val) return { roll: null, when: "" };
  const m = val.match(/^(.+?)\s+charges?\s+(?:at\s+)?(.*)$/i);
  return m ? { roll: m[1].trim(), when: m[2].trim() } : { roll: val, when: "" };
}

const { activeCampaignId } = storeToRefs(useCampaignStore());

// Every editable field in one draft, so the row builder below is a pure
// function of it and useRecordDraft can send only what this edit changed (#946).
function toDraft(item: Item | null) {
  const recharge = parseRecharge(item?.recharge ?? null);
  return {
    name: item?.name ?? props.prefillName ?? "",
    itemType: (item?.item_type ?? "gear") as ItemType,
    subtype: item?.subtype ?? "",
    rarity: (item?.rarity ?? "mundane") as ItemRarity,
    weight: (typeof item?.weight === "string"
      ? parseFloat(item.weight) || null
      : (item?.weight ?? null)) as number | null,
    cost: item?.cost ?? "",
    description: item?.description ?? "",
    content: (item?.content ?? null) as string | null,
    contentPlayerWritable: item?.content_player_writable ?? false,
    // Master fold for the Written Contents card: non-null content is a real signal
    // (feather badge, tome tab in player journals), so the editor only opens once
    // the DM says the item carries writing. Initialized from the writable flag too,
    // so a writable-but-blank item doesn't silently lose its flag on save.
    hasWrittenContent: (item?.content ?? null) !== null || (item?.content_player_writable ?? false),
    mundaneDescription: item?.mundane_description ?? "",
    source: item?.source ?? "",
    imageUrl: item?.image_url ?? "",
    imageFocalPoint: item?.image_focal_point ?? null,
    mundaneImageUrl: item?.mundane_image_url ?? "",
    mundaneImageFocalPoint: item?.mundane_image_focal_point ?? null,
    tags: [...(item?.tags ?? [])],
    aiProvenance: (item?.ai_provenance ?? null) as AiProvenance | null,
    damageRolls: cloneDraftValue(item?.damage_rolls ?? []) as DamageRoll[],
    properties: [...(item?.properties ?? [])] as string[],
    weaponRange: item?.weapon_range ?? "",
    versatileDamage: item?.versatile_damage ?? "",
    mastery: (item?.mastery ?? null) as WeaponMasteryProperty | null,
    armorClass: item?.armor_class ?? "",
    isArcaneFocus: item?.is_arcane_focus ?? false,
    bundleItems: (item?.bundle_items ?? []).map((e) => ({ name: e.name, quantity: e.quantity ?? 1 })),
    isCursed: !!item?.curse_description,
    curseDescription: item?.curse_description ?? "",
    campaignId: (item?.campaign_id ?? activeCampaignId.value ?? null) as string | null,
    requiresAttunement: item?.requires_attunement ?? false,
    attunementRequirements: item?.attunement_requirements ?? "",
    charges: (item?.charges ?? null) as number | null,
    rechargeRoll: recharge.roll,
    rechargeWhen: recharge.when,
    spellIds: [...(item?.spell_ids ?? [])],
  };
}
type ItemDraft = ReturnType<typeof toDraft>;

const { draft, conflicts, changes, commit, reset } = useRecordDraft({
  source: () => props.item,
  identity: (item) => item.id,
  toDraft,
});

// The template and the helpers below bind to refs of the draft, so a re-seed or
// a merged refetch reaches them without a copy step.
const {
  name, itemType, subtype, rarity, weight, cost, description, content,
  contentPlayerWritable, hasWrittenContent, mundaneDescription, source,
  imageUrl, imageFocalPoint, mundaneImageUrl, mundaneImageFocalPoint, tags,
  aiProvenance, damageRolls, properties, weaponRange, versatileDamage, mastery,
  armorClass, isArcaneFocus, bundleItems, isCursed, curseDescription,
  campaignId, requiresAttunement, attunementRequirements, charges,
  rechargeRoll, rechargeWhen, spellIds,
} = toRefs(draft);
const artTab = ref<'identified' | 'mundane'>('identified');

const CONFLICT_LABELS: Record<keyof ItemDraft, string> = {
  name: "Name",
  itemType: "Type",
  subtype: "Subtype",
  rarity: "Rarity",
  weight: "Weight",
  cost: "Cost",
  description: "Description",
  content: "Written contents",
  contentPlayerWritable: "Written contents",
  hasWrittenContent: "Written contents",
  mundaneDescription: "Mundane Description",
  source: "Source",
  imageUrl: "Portrait",
  imageFocalPoint: "Portrait focus",
  mundaneImageUrl: "Mundane portrait",
  mundaneImageFocalPoint: "Mundane portrait focus",
  tags: "Tags",
  aiProvenance: "AI provenance",
  damageRolls: "Damage",
  properties: "Properties",
  weaponRange: "Range",
  versatileDamage: "Versatile damage",
  mastery: "Mastery",
  armorClass: "Armor class",
  isArcaneFocus: "Arcane focus",
  bundleItems: "Bundle Contents",
  isCursed: "Curse",
  curseDescription: "Curse",
  campaignId: "Campaign",
  requiresAttunement: "Attunement",
  attunementRequirements: "Attunement",
  charges: "Charges",
  rechargeRoll: "Recharge",
  rechargeWhen: "Recharge",
  spellIds: "Linked Spells",
};
const conflictLabels = computed(() => [...new Set(conflicts.value.map((k) => CONFLICT_LABELS[k]))]);

const aiContext = computed(() => {
  const base = [name.value, ITEM_TYPE_LABELS[itemType.value], ITEM_RARITY_LABELS[rarity.value]];
  return artTab.value === 'identified'
    ? buildEntityContext([...base, toPlainText(description.value)])
    // Mundane art shows the item before identification — describe only its plain form.
    : buildEntityContext([name.value, ITEM_TYPE_LABELS[itemType.value], toPlainText(mundaneDescription.value)]);
});

const isContainer = computed({
  get: () => tags.value.includes('container'),
  set: (v) => {
    if (v && !tags.value.includes('container')) tags.value = [...tags.value, 'container'];
    else if (!v) tags.value = tags.value.filter(t => t !== 'container');
  },
});

// ── Pack / bundle fields ───────────────────────────────────────────────────────
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

// ── Spell picker ──────────────────────────────────────────────────────────────
const { data: spellIndex, isLoading: spellsLoading } = useSpellIndex();
// The linked spells are stored ids: read as rows (the Scriptorium export needs them in full).
const { data: linkedSpells } = useSpellsByIds(() => spellIds.value);
const spellSearch = ref("");

const filteredSpells = computed(() => {
  const q = spellSearch.value.trim().toLowerCase();
  // Own spells only, as before: `items.spell_ids` is a uuid[] column, so a
  // library spell's text id could not be stored on an item.
  return (spellIndex.value ?? []).filter(
    (s) =>
      !s.is_shared &&
      (!q ||
      s.name.toLowerCase().includes(q) ||
      s.school.toLowerCase().includes(q)),
  );
});

const selectedSpells = computed(() =>
  spellIds.value.flatMap((id) => {
    const spell = linkedSpells.value.get(id);
    return spell ? [spell] : [];
  }),
);

// ── Derived ───────────────────────────────────────────────────────────────────
const isWeapon = computed(() => isWeaponType(itemType.value));
const isArmor = computed(() => isArmorType(itemType.value));
const isMagic = computed(() => rarity.value !== "mundane");

const rarityPriceHint = computed(() => RARITY_PRICE_HINTS[rarity.value] ?? "");
const isArtObject = computed(() => itemType.value === "art_object");
const rarityColor = computed(() => RARITY_SURFACE_BG[rarity.value] ?? "#888888");

// A doc with no text and no embedded images isn't a document — persist NULL
// rather than an empty Tiptap doc string, matching the migration's contract
// (content is NULL for "not a document item").
function isBlankContent(json: string | null): boolean {
  if (!json) return true;
  return !tiptapToPlainText(json).trim() && extractRichTextImageUrls(json).length === 0;
}
// Folding the card closed unsays "this is a document": drafted text stays in
// the draft (reopening the fold restores it pre-save) but persists as NULL.
function effectiveContentOf(d: ItemDraft): string | null {
  if (!d.hasWrittenContent) return null;
  return isBlankContent(d.content) ? null : d.content;
}
const effectiveContent = computed(() => effectiveContentOf(draft));

// ── Save / Delete ─────────────────────────────────────────────────────────────
const { mutateAsync: createItem } = useCreateItem();
const { mutateAsync: updateItem } = useUpdateItem();
const { mutateAsync: deleteItem } = useDeleteItem();
const isSaving = ref(false);
const isDeleting = ref(false);
const isCloning = ref(false);
const saveError = ref("");

function buildPayload(d: ItemDraft) {
  const isWeapon = isWeaponType(d.itemType);
  const isArmor = isArmorType(d.itemType);
  const isMagic = d.rarity !== "mundane";
  return {
    name: d.name.trim(),
    item_type: d.itemType,
    subtype: d.subtype.trim() || null,
    rarity: d.rarity,
    requires_attunement: d.requiresAttunement,
    attunement_requirements: d.requiresAttunement
      ? d.attunementRequirements.trim() || null
      : null,
    weight: d.weight,
    cost: d.cost.trim() || null,
    damage_rolls: isWeapon && d.damageRolls.length ? d.damageRolls : null,
    armor_class: isArmor ? d.armorClass.trim() || null : null,
    properties: isWeapon ? d.properties : [],
    mastery: isWeapon ? d.mastery : null,
    weapon_range: isWeapon ? d.weaponRange.trim() || null : null,
    versatile_damage: isWeapon ? d.versatileDamage.trim() || null : null,
    charges: d.charges ?? null,
    recharge: d.rechargeRoll
      ? `${d.rechargeRoll} charges${d.rechargeWhen ? ` at ${d.rechargeWhen}` : ""}`.trim()
      : null,
    spell_ids: d.spellIds,
    description: d.description,
    content: effectiveContentOf(d),
    content_player_writable: d.hasWrittenContent ? d.contentPlayerWritable : false,
    mundane_description: isMagic ? d.mundaneDescription || null : null,
    source: d.source.trim() || null,
    tags: d.tags,
    image_url: d.imageUrl || null,
    image_focal_point: d.imageFocalPoint,
    mundane_image_url: d.mundaneImageUrl || null,
    mundane_image_focal_point: d.mundaneImageFocalPoint,
    is_arcane_focus: d.isArcaneFocus,
    curse_description: d.isCursed ? d.curseDescription || null : null,
    bundle_items: d.itemType === "pack" && d.bundleItems.length
      ? d.bundleItems.map(e => ({ name: e.name, quantity: e.quantity }))
      : null,
    campaign_id: d.campaignId,
    ai_provenance: d.aiProvenance,
  };
}

async function save() {
  if (!name.value.trim()) return;
  isSaving.value = true;
  saveError.value = "";
  try {
    if (props.item) {
      // Material edit detection (#606): tags, art, spell links, bundle
      // contents and campaign scope are
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

      const oldContent = props.item.content;
      // Only the columns this edit changed, so a stale cached copy cannot write
      // untouched fields back at old values (#946).
      const changed = changes(buildPayload);
      if (Object.keys(changed).length > 0) {
        await updateItem({ id: props.item.id, update: changed });
        commit();
      }
      cleanupRemovedRichTextImages(oldContent, effectiveContent.value);
      router.push("/vault");
    } else {
      // A new item has no import provenance; the builder stays pure over the draft.
      await createItem({ ...buildPayload(draft), source_title: null, source_url: null });
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
    const oldContent = props.item.content;
    await deleteItem(props.item);
    removeRichTextImages(oldContent);
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
      ...buildPayload(draft),
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
const showScriptoriumPaywall = ref(false);

async function sendToScriptorium() {
  if (!props.item) return;
  isSendingToScriptorium.value = true;
  try {
    const data = formatItemForScriptorium(props.item, selectedSpells.value);
    // Live link, not a one-time snapshot (#915 story 3). The generated
    // document travels with the item's own campaign scope (#915 story 1).
    const doc = await createDoc({
      ...data,
      content: buildEntityEmbedDocumentContent("item", props.item.id),
      campaign_id: props.item.campaign_id,
    });
    router.push(`/scriptorium/${doc.id}`);
  } catch (e: unknown) {
    if (isQuotaExceeded(e)) { showScriptoriumPaywall.value = true; return; }
    notify('Failed to send to Scriptorium. Please try again.');
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
