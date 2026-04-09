<template>
  <div class="flex flex-col gap-6">
    <!-- Header actions -->
    <div class="flex items-center justify-between gap-3 flex-wrap">
      <RouterLink
        to="/vault"
        class="font-cinzel text-xs text-muted-foreground hover:text-foreground transition-colors tracking-wider"
      >
        ← Vault
      </RouterLink>
      <div class="flex items-center gap-2">
        <button
          v-if="item"
          type="button"
          :disabled="isSendingToScriptorium"
          class="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-2 font-cinzel text-xs font-semibold text-muted-foreground hover:text-foreground hover:border-foreground/40 transition-colors disabled:opacity-50"
          @click="sendToScriptorium"
        >
          <ScrollText class="h-3.5 w-3.5" />
          {{ isSendingToScriptorium ? "Sending…" : "Send to Scriptorium" }}
        </button>
        <button
          v-if="item"
          type="button"
          :disabled="isCloning"
          class="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-2 font-cinzel text-xs font-semibold text-muted-foreground hover:text-foreground hover:border-foreground/40 transition-colors disabled:opacity-50"
          @click="cloneItem"
        >
          <Copy class="h-3.5 w-3.5" />
          {{ isCloning ? "Cloning…" : "Clone" }}
        </button>
        <button
          v-if="item"
          type="button"
          :disabled="isDeleting"
          class="inline-flex items-center gap-1.5 rounded-md border border-destructive/40 px-3 py-2 font-cinzel text-xs font-semibold text-destructive hover:bg-destructive hover:text-destructive-foreground transition-colors disabled:opacity-50"
          @click="confirmDelete"
        >
          <Trash2 class="h-3.5 w-3.5" />
          {{ isDeleting ? "Deleting…" : "Delete" }}
        </button>
        <button
          type="button"
          :disabled="isSaving || !name.trim()"
          class="inline-flex items-center gap-1.5 rounded-md bg-primary px-4 py-2 font-cinzel text-xs font-semibold text-primary-foreground tracking-wider hover:opacity-90 transition-opacity disabled:opacity-50"
          @click="save"
        >
          <Save class="h-3.5 w-3.5" />
          {{ isSaving ? "Saving…" : item ? "Save" : "Create" }}
        </button>
      </div>
    </div>

    <p v-if="saveError" class="text-destructive font-fell text-sm">{{ saveError }}</p>

    <div class="grid grid-cols-1 lg:grid-cols-[220px_1fr] gap-6">
      <!-- Left: Portrait + Tags -->
      <div class="flex flex-col gap-4">
        <!-- Portrait (tabbed: Identified / Mundane) -->
        <div class="flex flex-col gap-0">
          <div class="flex border-b border-border">
            <button
              v-for="tab in (['identified', 'mundane'] as const)"
              :key="tab"
              class="px-3 py-1.5 font-cinzel text-[11px] font-semibold tracking-wider border-b-2 transition-colors capitalize"
              :class="artTab === tab
                ? 'border-primary text-primary'
                : 'border-transparent text-muted-foreground hover:text-foreground'"
              @click="artTab = tab"
            >{{ tab }}</button>
          </div>
          <ImageUpload
            v-if="artTab === 'identified'"
            :model-value="imageUrl || null"
            show-focal-point
            :focal-point="imageFocalPoint"
            @update:model-value="imageUrl = $event ?? ''"
            @update:focal-point="imageFocalPoint = $event"
          />
          <ImageUpload
            v-else
            :model-value="mundaneImageUrl || null"
            show-focal-point
            :focal-point="mundaneImageFocalPoint"
            @update:model-value="mundaneImageUrl = $event ?? ''"
            @update:focal-point="mundaneImageFocalPoint = $event"
          />
        </div>

        <!-- Tags -->
        <div class="rounded-lg border border-border bg-card p-4 flex flex-col gap-3">
          <h3 class="font-cinzel text-xs font-bold tracking-wider text-muted-foreground uppercase">Tags</h3>
          <TagInput v-model="tags" />
        </div>

        <!-- Linked spells summary (when spells selected) -->
        <div v-if="selectedSpells.length" class="rounded-lg border border-border bg-card p-4 flex flex-col gap-2">
          <h3 class="font-cinzel text-xs font-bold tracking-wider text-muted-foreground uppercase">Linked Spells</h3>
          <div class="flex flex-col gap-1">
            <div v-for="spell in selectedSpells" :key="spell.id" class="flex items-center justify-between gap-2">
              <span class="font-fell text-xs text-foreground">{{ spell.name }}</span>
              <span class="font-cinzel text-[10px] text-muted-foreground">{{ spell.level === 0 ? 'Cantrip' : `L${spell.level}` }}</span>
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
          class="w-full bg-card border border-border rounded-md px-3 py-2 font-cinzel text-lg font-bold text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
        />

        <!-- Type + Subtype + Rarity -->
        <div class="grid gap-3" :class="isArtObject ? 'grid-cols-1' : 'grid-cols-3'">
          <label class="flex flex-col gap-1">
            <span class="font-cinzel text-[11px] text-muted-foreground tracking-wider uppercase">Type</span>
            <select
              v-model="itemType"
              class="bg-card border border-border rounded-md px-3 py-2 font-cinzel text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
            >
              <option v-for="t in ITEM_TYPES" :key="t" :value="t">{{ ITEM_TYPE_LABELS[t] }}</option>
            </select>
          </label>
          <template v-if="!isArtObject">
            <label class="flex flex-col gap-1">
              <span class="font-cinzel text-[11px] text-muted-foreground tracking-wider uppercase">Subtype</span>
              <input
                v-model="subtype"
                placeholder="e.g. longsword, chain mail…"
                class="bg-card border border-border rounded-md px-3 py-2 font-fell text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
              />
            </label>
            <label class="flex flex-col gap-1">
              <span class="font-cinzel text-[11px] text-muted-foreground tracking-wider uppercase">Rarity</span>
              <select
                v-model="rarity"
                class="bg-card border border-border rounded-md px-3 py-2 font-cinzel text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                :style="{ borderColor: rarityColor + '66' }"
              >
                <option v-for="r in ITEM_RARITIES" :key="r" :value="r">{{ ITEM_RARITY_LABELS[r] }}</option>
              </select>
            </label>
          </template>
        </div>

        <!-- Physical: Weight + Cost -->
        <div class="grid grid-cols-2 gap-3">
          <label class="flex flex-col gap-1">
            <span class="font-cinzel text-[11px] text-muted-foreground tracking-wider uppercase">Weight</span>
            <input
              v-model="weight"
              placeholder="e.g. 3 lb."
              class="bg-card border border-border rounded-md px-3 py-2 font-fell text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
            />
          </label>
          <label class="flex flex-col gap-1">
            <span class="font-cinzel text-[11px] text-muted-foreground tracking-wider uppercase">Cost</span>
            <input
              v-model="cost"
              placeholder="e.g. 50 gp"
              class="bg-card border border-border rounded-md px-3 py-2 font-fell text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
            />
          </label>
        </div>

        <!-- Weapon stats (damage + properties) -->
        <div
          v-if="isWeapon && !isArtObject"
          class="rounded-lg border border-border bg-card/50 p-4 flex flex-col gap-3"
        >
          <h3 class="font-cinzel text-[11px] font-bold tracking-wider text-muted-foreground uppercase">
            Weapon
          </h3>
          <div class="flex flex-col gap-1">
            <span class="font-cinzel text-[10px] text-muted-foreground tracking-wider uppercase">Damage</span>
            <DamageRollsInput v-model="damageRolls" />
          </div>
          <div class="grid grid-cols-2 gap-3">
            <label class="flex flex-col gap-1">
              <span class="font-cinzel text-[10px] text-muted-foreground tracking-wider uppercase">Versatile Damage</span>
              <input
                v-model="versatileDamage"
                placeholder="e.g. 1d10 (two-handed)"
                class="bg-muted border border-border rounded-md px-3 py-1.5 font-fell text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
              />
            </label>
            <label class="flex flex-col gap-1">
              <span class="font-cinzel text-[10px] text-muted-foreground tracking-wider uppercase">Range</span>
              <input
                v-model="weaponRange"
                placeholder="e.g. 80/320 ft."
                class="bg-muted border border-border rounded-md px-3 py-1.5 font-fell text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
              />
            </label>
          </div>
          <div class="flex flex-col gap-2">
            <span class="font-cinzel text-[10px] text-muted-foreground tracking-wider uppercase">Properties</span>
            <div class="flex flex-wrap gap-x-4 gap-y-2">
              <label
                v-for="p in WEAPON_PROPERTIES"
                :key="p"
                class="flex items-center gap-1.5 cursor-pointer"
              >
                <input type="checkbox" :value="p" v-model="properties" class="rounded" />
                <span class="font-fell text-sm text-foreground capitalize">{{ p }}</span>
              </label>
            </div>
          </div>
        </div>

        <!-- Armor stats -->
        <div
          v-if="isArmor && !isArtObject"
          class="rounded-lg border border-border bg-card/50 p-4 flex flex-col gap-3"
        >
          <h3 class="font-cinzel text-[11px] font-bold tracking-wider text-muted-foreground uppercase">
            Defense
          </h3>
          <label class="flex flex-col gap-1">
            <span class="font-cinzel text-[10px] text-muted-foreground tracking-wider uppercase">Armor Class</span>
            <input
              v-model="armorClass"
              placeholder="e.g. 13 + DEX modifier (max 2)"
              class="bg-muted border border-border rounded-md px-3 py-1.5 font-fell text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
            />
          </label>
        </div>

        <!-- Attunement (shown for non-mundane) -->
        <div
          v-if="isMagic && !isArtObject"
          class="rounded-lg border border-border bg-card/50 p-4 flex flex-col gap-2"
        >
          <h3 class="font-cinzel text-[11px] font-bold tracking-wider text-muted-foreground uppercase">
            Magic Properties
          </h3>
          <label class="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" v-model="requiresAttunement" class="rounded" />
            <span class="font-cinzel text-xs font-semibold text-muted-foreground tracking-wider">REQUIRES ATTUNEMENT</span>
          </label>
          <input
            v-if="requiresAttunement"
            v-model="attunementRequirements"
            placeholder="by whom? (optional, e.g. by a spellcaster)"
            class="bg-muted border border-border rounded-md px-3 py-1.5 font-fell text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
          />
        </div>

        <!-- Charges / Quantity (independent of spells — any item can have charges) -->
        <div v-if="!isArtObject" class="rounded-lg border border-border bg-card/50 p-4 flex flex-col gap-3">
          <h3 class="font-cinzel text-[11px] font-bold tracking-wider text-muted-foreground uppercase">
            {{ itemType === "ammunition" ? "Quantity" : "Charges" }}
            <span class="normal-case font-fell font-normal text-muted-foreground/60"> — optional</span>
          </h3>
          <div class="grid grid-cols-2 gap-3">
            <label class="flex flex-col gap-1">
              <span class="font-cinzel text-[10px] text-muted-foreground tracking-wider uppercase">{{ itemType === "ammunition" ? "Count" : "Max Charges" }}</span>
              <input
                v-model.number="charges"
                type="number"
                min="0"
                placeholder="e.g. 20"
                class="bg-muted border border-border rounded-md px-3 py-1.5 font-fell text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
              />
            </label>
            <label v-if="isMagic && itemType !== 'ammunition'" class="flex flex-col gap-1">
              <span class="font-cinzel text-[10px] text-muted-foreground tracking-wider uppercase">Recharge</span>
              <input
                v-model="recharge"
                placeholder="e.g. 1d6+4 charges at dawn"
                class="bg-muted border border-border rounded-md px-3 py-1.5 font-fell text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
              />
            </label>
          </div>
          <label class="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" v-model="isArcaneFocus" class="rounded" />
            <span class="font-cinzel text-xs font-semibold text-muted-foreground tracking-wider">ARCANE FOCUS</span>
          </label>
          <label class="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" v-model="isContainer" class="rounded" />
            <span class="font-cinzel text-xs font-semibold text-muted-foreground tracking-wider">CONTAINER</span>
          </label>
        </div>

        <!-- Spell references (optional, links to Spellbook entries) -->
        <div v-if="isMagic && !isArtObject" class="rounded-lg border border-border bg-card/50 p-4 flex flex-col gap-2">
          <div class="flex items-center justify-between">
            <h3 class="font-cinzel text-[11px] font-bold tracking-wider text-muted-foreground uppercase">
              Linked Spells
              <span class="normal-case font-fell font-normal text-muted-foreground/60"> — optional</span>
            </h3>
            <span v-if="selectedSpells.length" class="font-fell text-[10px] text-muted-foreground italic">{{ selectedSpells.length }} linked</span>
          </div>
          <input
            v-model="spellSearch"
            placeholder="Search your Spellbook…"
            class="bg-muted border border-border rounded-md px-3 py-1.5 font-fell text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
          />
          <div class="max-h-40 overflow-y-auto flex flex-col gap-1 rounded border border-border/50 bg-muted/30 p-2">
            <p v-if="!filteredSpells.length" class="font-fell text-xs text-muted-foreground italic px-1">
              {{ spellsLoading ? 'Loading spells…' : 'No spells found. Add spells in the Spellbook.' }}
            </p>
            <label
              v-for="spell in filteredSpells"
              :key="spell.id"
              class="flex items-center gap-2 cursor-pointer py-0.5 px-1 rounded hover:bg-muted"
            >
              <input type="checkbox" :value="spell.id" v-model="spellIds" class="rounded shrink-0" />
              <span class="font-fell text-xs text-foreground">{{ spell.name }}</span>
              <span class="font-cinzel text-[10px] text-muted-foreground ml-auto shrink-0">
                {{ spell.level === 0 ? 'Cantrip' : `L${spell.level}` }} · {{ spell.school }}
              </span>
            </label>
          </div>
        </div>

        <!-- Mundane description (pre-identification) -->
        <div v-if="isMagic && !isArtObject" class="flex flex-col gap-1">
          <span class="font-cinzel text-[11px] text-muted-foreground tracking-wider uppercase">
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
          <span class="font-cinzel text-[11px] text-muted-foreground tracking-wider uppercase">Description</span>
          <RichTextEditor
            v-model="description"
            placeholder="Describe this item's properties, lore, and any special effects…"
            min-height="200px"
          />
        </div>

        <!-- Curse -->
        <div v-if="isMagic && !isArtObject" class="rounded-lg border border-border bg-card/50 p-4 flex flex-col gap-3">
          <div class="flex items-center justify-between gap-2">
            <h3 class="font-cinzel text-[11px] font-bold tracking-wider text-muted-foreground uppercase">
              Curse
              <span class="normal-case font-fell font-normal text-muted-foreground/60"> — optional</span>
            </h3>
            <label class="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" v-model="isCursed" class="rounded" />
              <span class="font-cinzel text-xs font-semibold text-muted-foreground tracking-wider">CURSED</span>
            </label>
          </div>
          <template v-if="isCursed">
            <RichTextEditor
              v-model="curseDescription"
              placeholder="Describe the curse effect, trigger, and how it can be removed…"
              min-height="120px"
            />
            <label class="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" v-model="curseRevealed" class="rounded" />
              <span class="font-fell text-sm text-foreground">Revealed to players</span>
            </label>
            <p class="font-fell text-xs text-muted-foreground italic">
              When hidden, players cannot see the curse description. Toggle revealed once a player attunes or triggers the curse.
            </p>
          </template>
        </div>

        <!-- Source -->
        <div class="flex flex-col gap-1">
          <span class="font-cinzel text-[11px] text-muted-foreground tracking-wider uppercase">Source</span>
          <!-- Imported items: read-only with optional link -->
          <div
            v-if="props.item?.source_url || props.item?.source_title"
            class="bg-muted/30 border border-border rounded-md px-3 py-2 font-fell text-sm text-muted-foreground italic"
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
          <input
            v-else
            v-model="source"
            placeholder="e.g. Homebrew, DMG, XGtE…"
            class="bg-card border border-border rounded-md px-3 py-2 font-fell text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
          />
        </div>
      </div>

    </div>
  </div>
</template>

<script setup lang="ts">
import { useConfirm } from "@/composables/useConfirm";
const { confirm, notify } = useConfirm();
import { ref, computed } from "vue";
import { useRouter, useRoute } from "vue-router";
import { Save, Trash2, ScrollText, Copy } from "lucide-vue-next";
import ImageUpload from "@/components/common/ImageUpload.vue";
import { useCreateItem, useUpdateItem, useDeleteItem } from "@/composables/useItems";
import { useSpells } from "@/composables/useSpells";
import { useCreateScriptoriumDocument } from "@/composables/useScriptorium";
import { formatItemForScriptorium } from "@/lib/scriptoriumImport";
import DamageRollsInput from "@/components/common/DamageRollsInput.vue";
import TagInput from "@/components/common/TagInput.vue";
import RichTextEditor from "@/components/common/RichTextEditor.vue";
import {
  ITEM_TYPES,
  ITEM_TYPE_LABELS,
  ITEM_RARITIES,
  ITEM_RARITY_LABELS,
  WEAPON_PROPERTIES,
  RARITY_COLORS,
  isWeaponType,
  isArmorType,
  itemSourceLabel,
} from "@/types/item.types";
import type { Item, ItemType, ItemRarity } from "@/types/item.types";
import type { DamageRoll } from "@/lib/dice";

const props = defineProps<{ item: Item | null; prefillName?: string }>();
const router = useRouter();
const route = useRoute();

// ── Core fields ───────────────────────────────────────────────────────────────
const name = ref(props.item?.name ?? props.prefillName ?? "");
const itemType = ref<ItemType>(props.item?.item_type ?? "gear");
const subtype = ref(props.item?.subtype ?? "");
const rarity = ref<ItemRarity>(props.item?.rarity ?? "mundane");
const weight = ref(props.item?.weight ?? "");
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

// ── Weapon fields ─────────────────────────────────────────────────────────────
const damageRolls = ref<DamageRoll[]>(props.item?.damage_rolls ?? []);
const properties = ref<string[]>(props.item?.properties ?? []);
const weaponRange = ref(props.item?.weapon_range ?? "");
const versatileDamage = ref(props.item?.versatile_damage ?? "");

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

// ── Curse fields ──────────────────────────────────────────────────────────────
const isCursed = ref(!!(props.item?.curse_description));
const curseDescription = ref(props.item?.curse_description ?? "");
const curseRevealed = ref(props.item?.curse_revealed ?? false);

// ── Magic fields ──────────────────────────────────────────────────────────────
const requiresAttunement = ref(props.item?.requires_attunement ?? false);
const attunementRequirements = ref(props.item?.attunement_requirements ?? "");
const charges = ref<number | null>(props.item?.charges ?? null);
const recharge = ref(props.item?.recharge ?? "");
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
const isArtObject = computed(() => itemType.value === "art_object");
const rarityColor = computed(() => RARITY_COLORS[rarity.value] ?? "#888888");


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
    weight: weight.value.trim() || null,
    cost: cost.value.trim() || null,
    damage_rolls: isWeapon.value && damageRolls.value.length ? damageRolls.value : null,
    armor_class: isArmor.value ? armorClass.value.trim() || null : null,
    properties: isWeapon.value ? properties.value : [],
    weapon_range: isWeapon.value ? weaponRange.value.trim() || null : null,
    versatile_damage: isWeapon.value ? versatileDamage.value.trim() || null : null,
    charges: charges.value ?? null,
    recharge: recharge.value.trim() || null,
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
    curse_revealed: isCursed.value ? curseRevealed.value : false,
  };
}

async function save() {
  if (!name.value.trim()) return;
  isSaving.value = true;
  saveError.value = "";
  try {
    if (props.item) {
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
    await deleteItem(props.item.id);
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
</script>
