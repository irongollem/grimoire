<template>
  <div class="flex flex-col gap-5">
    <!-- Read-only SRD banner -->
    <div
      v-if="isSrd"
      class="flex items-center justify-between gap-3 rounded-md border border-border bg-muted/50 px-4 py-2.5"
    >
      <p class="font-fell text-sm text-muted-foreground italic">
        Read-only SRD reference. Customize to create your own editable copy.
      </p>
      <button
        type="button"
        :disabled="cloning"
        class="inline-flex items-center gap-1.5 rounded-md bg-primary px-4 py-2 font-cinzel text-xs font-semibold text-primary-foreground tracking-wider hover:opacity-90 transition-opacity disabled:opacity-50 shrink-0"
        @click="customize"
      >
        <Copy class="h-3.5 w-3.5" />
        {{ cloning ? "Copying…" : "Customize" }}
      </button>
    </div>

    <!-- Top bar (editable monsters only) -->
    <div v-else class="flex flex-wrap items-center gap-2">
      <label class="flex-1 min-w-48">
        <span class="sr-only">Monster name</span>
        <input
          v-model="form.name"
          placeholder="Monster name…"
          class="w-full bg-card border border-border rounded-md px-3 py-2 font-cinzel text-lg font-bold text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
        />
      </label>
      <!-- Template picker -->
      <select
        class="bg-card border border-border rounded-md px-3 py-2 font-cinzel text-xs font-semibold text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
        @change="applyTemplate($event)"
      >
        <option value="">Load template…</option>
        <optgroup
          v-for="cat in MONSTER_TEMPLATE_CATEGORIES"
          :key="cat.label"
          :label="cat.label"
        >
          <option v-for="t in cat.templates" :key="t.id" :value="t.id">
            {{ t.name }}
          </option>
        </optgroup>
      </select>
      <button
        type="button"
        :disabled="saving || !form.name.trim()"
        class="inline-flex items-center gap-1.5 rounded-md bg-primary px-4 py-2 font-cinzel text-xs font-semibold text-primary-foreground tracking-wider hover:opacity-90 transition-opacity disabled:opacity-50"
        @click="save"
      >
        <Save class="h-3.5 w-3.5" />
        {{ saving ? "Saving…" : props.monster ? "Save" : "Create" }}
      </button>
      <button
        v-if="props.monster"
        type="button"
        :disabled="sendingToScriptorium"
        class="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-2 font-cinzel text-xs font-semibold text-foreground hover:bg-muted transition-colors disabled:opacity-50"
        @click="sendToScriptorium"
      >
        <ScrollText class="h-3.5 w-3.5" />
        {{ sendingToScriptorium ? "Exporting…" : "Send to Scriptorium" }}
      </button>
      <button
        v-if="props.monster"
        type="button"
        class="inline-flex items-center gap-1.5 rounded-md border border-destructive px-3 py-2 font-cinzel text-xs font-semibold text-destructive hover:bg-destructive/10 transition-colors"
        @click="remove"
      >
        <Trash2 class="h-3.5 w-3.5" />
        Delete
      </button>
    </div>

    <p v-if="saveError" class="text-destructive font-fell text-sm">
      {{ saveError }}
    </p>

    <!-- Two-column body: portrait sidebar + stat block content -->
    <!-- fieldset[disabled] makes all inputs read-only for SRD monsters -->
    <fieldset :disabled="isSrd" class="contents">
      <div class="grid grid-cols-1 lg:grid-cols-[220px_1fr] gap-6">
        <!-- Left: Portrait + Tags -->
        <div class="space-y-4">
          <div
            class="relative aspect-3/4 rounded-lg border border-border overflow-hidden bg-muted group"
            :class="isSrd ? 'cursor-default' : 'cursor-pointer'"
            @click="!isSrd && artFileInput?.click()"
          >
            <img
              v-if="form.image_url"
              :src="form.image_url"
              alt="Portrait"
              class="w-full h-full object-cover"
            />
            <div
              v-else
              class="w-full h-full flex flex-col items-center justify-center gap-2 text-muted-foreground"
            >
              <ImagePlus class="h-10 w-10" />
              <span class="font-fell text-sm italic">{{
                isUploadingArt ? "Uploading…" : "Upload portrait"
              }}</span>
            </div>
            <div
              v-if="!isSrd"
              class="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center"
            >
              <span class="font-fell text-white text-sm italic">{{
                form.image_url ? "Change portrait" : "Upload portrait"
              }}</span>
            </div>
          </div>
          <input
            ref="artFileInput"
            type="file"
            accept="image/*"
            class="hidden"
            @change="onArtSelected"
          />
          <button
            v-if="form.image_url && !isSrd"
            type="button"
            class="font-cinzel text-[10px] text-destructive hover:underline"
            @click="form.image_url = ''"
          >
            Remove portrait
          </button>

          <!-- Card Art (landscape, for MTG Card Forge) -->
          <p
            class="font-cinzel text-[10px] font-semibold text-muted-foreground tracking-wider mt-2"
          >
            CARD ART
          </p>
          <div
            class="relative aspect-video rounded-lg border border-border overflow-hidden bg-muted group"
            :class="isSrd ? 'cursor-default' : 'cursor-pointer'"
            @click="!isSrd && cardArtFileInput?.click()"
          >
            <img
              v-if="form.card_art_url"
              :src="form.card_art_url"
              alt="Card Art"
              class="w-full h-full object-cover"
            />
            <div
              v-else
              class="w-full h-full flex flex-col items-center justify-center gap-2 text-muted-foreground"
            >
              <ImagePlus class="h-8 w-8" />
              <span class="font-fell text-xs italic">{{
                isUploadingCardArt
                  ? "Uploading…"
                  : "Upload card art (landscape)"
              }}</span>
            </div>
            <div
              v-if="!isSrd"
              class="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center"
            >
              <span class="font-fell text-white text-xs italic">{{
                form.card_art_url ? "Change card art" : "Upload card art"
              }}</span>
            </div>
          </div>
          <input
            ref="cardArtFileInput"
            type="file"
            accept="image/*"
            class="hidden"
            @change="onCardArtSelected"
          />
          <button
            v-if="form.card_art_url && !isSrd"
            type="button"
            class="font-cinzel text-[10px] text-destructive hover:underline"
            @click="form.card_art_url = ''"
          >
            Remove card art
          </button>

          <!-- Tags -->
          <div>
            <p class="field-label">Tags</p>
            <div
              class="flex flex-wrap items-center gap-1 min-h-9 bg-muted border border-border rounded-md px-2 py-1"
            >
              <span
                v-for="tag in form.tags"
                :key="tag"
                class="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-card font-cinzel text-[11px] text-muted-foreground tracking-wider"
              >
                {{ tag }}
                <button
                  v-if="!isSrd"
                  type="button"
                  class="hover:text-destructive transition-colors leading-none text-sm"
                  @click="removeTag(tag)"
                >
                  ×
                </button>
              </span>
              <input
                v-if="!isSrd"
                v-model="tagInput"
                placeholder="Add tag…"
                class="bg-transparent border-none outline-none font-fell text-xs text-muted-foreground placeholder:text-muted-foreground/60 min-w-20 flex-1"
                aria-label="Add tag"
                @keydown.enter.prevent="addTag"
                @keydown="onTagKeydown"
              />
            </div>
          </div>
        </div>

        <!-- Right: Identity + stat block -->
        <div class="flex flex-col gap-5">
          <!-- Identity grid -->
          <section class="grid grid-cols-2 lg:grid-cols-3 gap-3">
            <label class="block">
              <span class="field-label">Type</span>
              <select
                v-model="form.monster_type"
                class="field-input w-full capitalize"
              >
                <option
                  v-for="t in MONSTER_TYPES"
                  :key="t"
                  :value="t"
                  class="capitalize"
                >
                  {{ t }}
                </option>
              </select>
            </label>
            <label class="block">
              <span class="field-label">Size</span>
              <select v-model="form.size" class="field-input w-full capitalize">
                <option
                  v-for="s in SIZES"
                  :key="s"
                  :value="s"
                  class="capitalize"
                >
                  {{ s }}
                </option>
              </select>
            </label>
            <label class="block">
              <span class="field-label">Alignment</span>
              <input
                v-model="form.alignment"
                class="field-input w-full"
                placeholder="neutral evil"
              />
            </label>
            <label class="block">
              <span class="field-label">Source</span>
              <input
                v-model="form.source"
                class="field-input w-full"
                placeholder="Monster Manual"
              />
            </label>
            <label class="block">
              <span class="field-label">Habitat</span>
              <input
                v-model="form.habitat"
                class="field-input w-full"
                placeholder="Forest, underground…"
              />
            </label>
          </section>

          <!-- Divider -->
          <div class="gold-divider" />

          <!-- Combat stats -->
          <section>
            <p class="section-heading">Combat Statistics</p>
            <div class="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <label class="block">
                <span class="field-label">Challenge Rating</span>
                <input
                  v-model="sb.challenge_rating"
                  class="field-input w-full font-bold"
                  placeholder="1/4"
                />
              </label>
              <label class="block">
                <span class="field-label">Armor Class</span>
                <input
                  v-model.number="sb.armor_class"
                  type="number"
                  class="field-input w-full"
                />
              </label>
              <label class="block">
                <span class="field-label">Hit Points</span>
                <input
                  v-model="sb.hit_points"
                  class="field-input w-full"
                  placeholder="22 (3d8+9)"
                />
              </label>
              <label class="block">
                <span class="field-label">Speed</span>
                <input
                  v-model="sb.speed"
                  class="field-input w-full"
                  placeholder="30 ft."
                />
              </label>
            </div>
          </section>

          <!-- Ability scores -->
          <section>
            <p class="section-heading">Ability Scores</p>
            <div class="grid grid-cols-3 sm:grid-cols-6 gap-3">
              <label
                v-for="stat in ABILITY_STATS"
                :key="stat.key"
                class="flex flex-col items-center gap-1"
              >
                <span class="field-label">{{ stat.label }}</span>
                <input
                  v-model.number="sb[stat.key]"
                  type="number"
                  min="1"
                  max="30"
                  class="field-input w-full text-center"
                />
                <span
                  class="font-cinzel text-xs font-bold"
                  :class="
                    mod(sb[stat.key]) >= 0
                      ? 'text-green-500'
                      : 'text-destructive'
                  "
                >
                  {{ mod(sb[stat.key]) >= 0 ? "+" : "" }}{{ mod(sb[stat.key]) }}
                </span>
              </label>
            </div>
          </section>

          <!-- Proficiencies & traits (text fields) -->
          <section class="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <label class="block">
              <span class="field-label">Saving Throws</span>
              <input
                v-model="sb.saving_throws"
                class="field-input w-full"
                placeholder="Con +5, Wis +3"
              />
            </label>
            <label class="block">
              <span class="field-label">Skills</span>
              <input
                :value="skillsText"
                class="field-input w-full"
                placeholder="Perception +3, Stealth +5"
                @input="parseSkills(($event.target as HTMLInputElement).value)"
              />
            </label>
            <label class="block">
              <span class="field-label">Damage Vulnerabilities</span>
              <input
                v-model="sb.damage_vulnerabilities"
                class="field-input w-full"
                placeholder="bludgeoning"
              />
            </label>
            <label class="block">
              <span class="field-label">Damage Resistances</span>
              <input
                v-model="sb.damage_resistances"
                class="field-input w-full"
                placeholder="fire, cold"
              />
            </label>
            <label class="block">
              <span class="field-label">Damage Immunities</span>
              <input
                v-model="sb.damage_immunities"
                class="field-input w-full"
                placeholder="poison, psychic"
              />
            </label>
            <label class="block">
              <span class="field-label">Condition Immunities</span>
              <input
                v-model="sb.condition_immunities"
                class="field-input w-full"
                placeholder="charmed, exhaustion"
              />
            </label>
            <label class="block">
              <span class="field-label">Senses</span>
              <input
                v-model="sb.senses"
                class="field-input w-full"
                placeholder="darkvision 60 ft., passive Perception 13"
              />
            </label>
            <label class="block">
              <span class="field-label">Languages</span>
              <input
                v-model="sb.languages"
                class="field-input w-full"
                placeholder="Common, Giant"
              />
            </label>
          </section>

          <div class="gold-divider" />

          <!-- Trait sections -->
          <section class="flex flex-col gap-4">
            <TraitSection
              v-model="sb.special_abilities"
              label="Special Abilities"
            />
            <TraitSection v-model="sb.actions" label="Actions" />
            <TraitSection v-model="sb.bonus_actions" label="Bonus Actions" />
            <TraitSection v-model="sb.reactions" label="Reactions" />
          </section>

          <!-- Legendary -->
          <section>
            <p class="section-heading">Legendary</p>
            <label class="flex items-center gap-3 mb-4">
              <span class="field-label whitespace-nowrap"
                >Legendary Resistance (uses/day)</span
              >
              <input
                v-model.number="sb.legendary_resistance"
                type="number"
                min="0"
                max="5"
                class="field-input w-20"
              />
            </label>
            <TraitSection
              v-model="sb.legendary_actions"
              label="Legendary Actions"
            />
          </section>

          <!-- Lair -->
          <section>
            <TraitSection v-model="sb.lair_actions" label="Lair Actions" />
          </section>

          <!-- Notes -->
          <section>
            <label class="block">
              <span class="field-label">DM Notes</span>
              <textarea
                v-model="form.notes"
                rows="3"
                placeholder="Encounter notes, tactics, lair description…"
                class="field-input w-full resize-y"
              />
            </label>
          </section>
        </div>
      </div>
    </fieldset>
  </div>
</template>

<script setup lang="ts">
import { useConfirm } from "@/composables/useConfirm";
const { confirm } = useConfirm();
import { ref, reactive, computed } from "vue";
import { useRouter } from "vue-router";
import { Save, Trash2, ScrollText, ImagePlus, Copy } from "lucide-vue-next";
import { useImageUpload } from "@/composables/useImageUpload";
import {
  useCreateMonster,
  useUpdateMonster,
  useDeleteMonster,
  useCloneSrdMonster,
} from "@/composables/useMonsters";
import { useCreateScriptoriumDocument } from "@/composables/useScriptorium";
import { formatMonsterForScriptorium } from "@/lib/scriptoriumImport";
import TraitSection from "@/components/npcs/TraitSection.vue";
import {
  MONSTER_TEMPLATE_CATEGORIES,
  getMonsterTemplate,
} from "@/data/monsterTemplates";
import type {
  Monster,
  MonsterType,
  MonsterSize,
  MonsterStatBlock,
} from "@/types/monster.types";

const MONSTER_TYPES: MonsterType[] = [
  "aberration",
  "beast",
  "celestial",
  "construct",
  "dragon",
  "elemental",
  "fey",
  "fiend",
  "giant",
  "humanoid",
  "monstrosity",
  "ooze",
  "plant",
  "undead",
];
const SIZES: MonsterSize[] = [
  "tiny",
  "small",
  "medium",
  "large",
  "huge",
  "gargantuan",
];
const ABILITY_STATS = [
  { key: "str" as const, label: "STR" },
  { key: "dex" as const, label: "DEX" },
  { key: "con" as const, label: "CON" },
  { key: "int" as const, label: "INT" },
  { key: "wis" as const, label: "WIS" },
  { key: "cha" as const, label: "CHA" },
];

const props = defineProps<{ monster: Monster | null }>();
const router = useRouter();

const isSrd = computed(() => !!props.monster?.is_srd);

const form = reactive({
  name: props.monster?.name ?? "",
  monster_type: (props.monster?.monster_type ?? "humanoid") as MonsterType,
  size: (props.monster?.size ?? "medium") as MonsterSize,
  alignment: props.monster?.alignment ?? "unaligned",
  habitat: props.monster?.habitat ?? "",
  source: props.monster?.source ?? "",
  tags: props.monster?.tags ? [...props.monster.tags] : [],
  notes: props.monster?.notes ?? "",
  image_url: props.monster?.image_url ?? "",
  card_art_url: props.monster?.card_art_url ?? "",
});

function defaultSb(): MonsterStatBlock {
  return {
    armor_class: 10,
    hit_points: "10 (2d8+1)",
    speed: "30 ft.",
    str: 10,
    dex: 10,
    con: 10,
    int: 10,
    wis: 10,
    cha: 10,
    challenge_rating: "1/4",
    saving_throws: "",
    skills: {},
    damage_vulnerabilities: "",
    damage_resistances: "",
    damage_immunities: "",
    condition_immunities: "",
    senses: "",
    languages: "",
    special_abilities: [],
    actions: [],
    bonus_actions: [],
    reactions: [],
    legendary_resistance: 0,
    legendary_actions: [],
    lair_actions: [],
  };
}

const sb = reactive<MonsterStatBlock>(
  props.monster?.stat_block
    ? { ...defaultSb(), ...props.monster.stat_block }
    : defaultSb(),
);

// Tags
const tagInput = ref("");
function addTag() {
  const val = tagInput.value.replace(/,\s*$/, "").trim();
  if (val && !form.tags.includes(val)) form.tags.push(val);
  tagInput.value = "";
}
function onTagKeydown(e: KeyboardEvent) {
  if (e.key === ",") {
    e.preventDefault();
    addTag();
  }
}
function removeTag(tag: string) {
  form.tags = form.tags.filter((t) => t !== tag);
}

// Skills string <-> Record conversion
const skillsText = computed(() =>
  Object.entries(sb.skills ?? {})
    .map(([k, v]) => `${k} ${v}`)
    .join(", "),
);
function parseSkills(text: string) {
  const rec: Record<string, string> = {};
  text.split(",").forEach((part) => {
    const m = part.trim().match(/^(.+?)\s+([+-]\d+)$/);
    if (m) rec[m[1].toLowerCase().trim()] = m[2];
  });
  sb.skills = rec;
}

// Template picker
function applyTemplate(event: Event) {
  const id = (event.target as HTMLSelectElement).value;
  if (!id) return;
  const tmpl = getMonsterTemplate(id);
  if (!tmpl) return;
  form.name = tmpl.name;
  form.monster_type = tmpl.monster_type;
  form.size = tmpl.size;
  form.alignment = tmpl.alignment;
  Object.assign(sb, defaultSb(), tmpl.stat_block);
  (event.target as HTMLSelectElement).value = "";
}

// Ability modifier
function mod(score: number) {
  return Math.floor((score - 10) / 2);
}

// Image uploads
const artFileInput = ref<HTMLInputElement | null>(null);
const cardArtFileInput = ref<HTMLInputElement | null>(null);
const { isUploading: isUploadingArt, upload: uploadArt } =
  useImageUpload("asset-images");
const { isUploading: isUploadingCardArt, upload: uploadCardArt } =
  useImageUpload("asset-images");
async function onArtSelected(e: Event) {
  const file = (e.target as HTMLInputElement).files?.[0];
  if (!file) return;
  const url = await uploadArt(file);
  if (url) form.image_url = url;
  if (artFileInput.value) artFileInput.value.value = "";
}
async function onCardArtSelected(e: Event) {
  const file = (e.target as HTMLInputElement).files?.[0];
  if (!file) return;
  const url = await uploadCardArt(file);
  if (url) form.card_art_url = url;
  if (cardArtFileInput.value) cardArtFileInput.value.value = "";
}

// Save
const { mutateAsync: create } = useCreateMonster();
const { mutateAsync: update } = useUpdateMonster();
const { mutateAsync: del } = useDeleteMonster();
const { mutateAsync: clone } = useCloneSrdMonster();
const { mutateAsync: createScriptoriumDoc } = useCreateScriptoriumDocument();
const saving = ref(false);
const cloning = ref(false);
const saveError = ref("");
const sendingToScriptorium = ref(false);

async function customize() {
  if (!props.monster) return;
  cloning.value = true;
  try {
    const copy = await clone(props.monster);
    router.replace(`/monsters/${copy.id}`);
  } finally {
    cloning.value = false;
  }
}

async function sendToScriptorium() {
  if (!props.monster) return;
  sendingToScriptorium.value = true;
  try {
    const importData = formatMonsterForScriptorium(props.monster);
    const doc = await createScriptoriumDoc(importData);
    router.push(`/scriptorium/${doc.id}`);
  } finally {
    sendingToScriptorium.value = false;
  }
}

function buildPayload() {
  return {
    name: form.name.trim(),
    monster_type: form.monster_type,
    size: form.size,
    alignment: form.alignment,
    habitat: form.habitat || null,
    source: form.source || null,
    tags: form.tags,
    notes: form.notes || null,
    image_url: form.image_url || null,
    card_art_url: form.card_art_url || null,
    stat_block: { ...sb },
  };
}

async function save() {
  if (!form.name.trim()) return;
  saving.value = true;
  saveError.value = "";
  try {
    if (props.monster) {
      await update({ id: props.monster.id, update: buildPayload() });
      router.push("/monsters");
    } else {
      const created = await create(buildPayload());
      router.replace(`/monsters/${created.id}`);
    }
  } catch (e: unknown) {
    saveError.value = e instanceof Error ? e.message : "Failed to save";
  } finally {
    saving.value = false;
  }
}

async function remove() {
  if (!props.monster) return;
  if (!(await confirm(`Delete ${props.monster.name}? This cannot be undone.`)))
    return;
  await del(props.monster.id);
  router.push("/monsters");
}
</script>

<style scoped>
@reference "@/assets/main.css";

.field-label {
  @apply block font-cinzel text-xs font-semibold tracking-wider text-muted-foreground mb-1;
}
.field-input {
  @apply bg-muted border border-border rounded-md px-3 py-1.5 font-fell text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring;
}
.section-heading {
  @apply font-cinzel text-xs font-semibold tracking-wider text-muted-foreground uppercase mb-3;
}
.gold-divider {
  @apply border-t border-primary/30;
}
</style>
