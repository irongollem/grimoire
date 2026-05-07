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
        <IconCopy class="h-3.5 w-3.5" />
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
      <button
        v-if="isAiEnabled"
        type="button"
        class="inline-flex items-center gap-1.5 rounded-md border border-primary/40 px-3 py-2 font-cinzel text-xs font-semibold text-primary hover:bg-primary/10 transition-colors"
        @click="showGenerateDialog = true"
      >
        <IconGenerate class="h-3.5 w-3.5" />
        Generate
      </button>
      <button
        type="button"
        :disabled="saving || !form.name.trim()"
        class="inline-flex items-center gap-1.5 rounded-md bg-primary px-4 py-2 font-cinzel text-xs font-semibold text-primary-foreground tracking-wider hover:opacity-90 transition-opacity disabled:opacity-50"
        @click="save"
      >
        <IconSave class="h-3.5 w-3.5" />
        {{ saving ? "Saving…" : props.monster ? "IconSave" : "Create" }}
      </button>
      <button
        v-if="props.monster"
        type="button"
        :disabled="sendingToScriptorium"
        class="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-2 font-cinzel text-xs font-semibold text-foreground hover:bg-muted transition-colors disabled:opacity-50"
        @click="sendToScriptorium"
      >
        <IconScrollText class="h-3.5 w-3.5" />
        {{ sendingToScriptorium ? "Exporting…" : "Send to Scriptorium" }}
      </button>
      <button
        v-if="props.monster"
        type="button"
        :disabled="duplicating"
        class="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-2 font-cinzel text-xs font-semibold text-muted-foreground hover:text-foreground hover:border-foreground/40 transition-colors disabled:opacity-50"
        @click="duplicate"
      >
        <IconCopy class="h-3.5 w-3.5" />
        {{ duplicating ? "Copying…" : "Duplicate" }}
      </button>
      <button
        v-if="props.monster"
        type="button"
        class="inline-flex items-center gap-1.5 rounded-md border border-destructive px-3 py-2 font-cinzel text-xs font-semibold text-destructive hover:bg-destructive/10 transition-colors"
        @click="remove"
      >
        <IconDelete class="h-3.5 w-3.5" />
        Delete
      </button>
    </div>

    <p v-if="saveError" class="text-destructive font-fell text-sm">
      {{ saveError }}
    </p>

    <!-- Two-column body: portrait sidebar + stat block content -->
    <!-- Left col is NOT in fieldset — ImageUploads must remain interactive for SRD art -->
    <div class="grid grid-cols-1 lg:grid-cols-[220px_1fr] gap-6">
      <!-- Left: Portrait + Tags -->
      <div class="space-y-4">
          <!-- Portrait -->
          <ImageUpload
            :model-value="form.image_url || null"
            :focal-point="form.portrait_focal_point"
            show-focal-point
            @update:model-value="onPortraitUrlUpdate($event)"
            @update:focal-point="onPortraitFocalUpdate($event)"
          />

          <!-- Tags -->
          <div>
            <p class="field-label">Tags</p>
            <TagInput v-if="!isSrd" v-model="form.tags" />
            <div v-else class="flex flex-wrap gap-1 mt-1">
              <span
                v-for="tag in form.tags"
                :key="tag"
                class="inline-flex items-center px-2 py-0.5 rounded bg-muted font-cinzel text-[11px] text-muted-foreground tracking-wider"
              >{{ tag }}</span>
            </div>
          </div>
      </div>

      <!-- Right: Identity + stat block — fieldset[disabled] makes inputs read-only for SRD -->
      <fieldset :disabled="isSrd" class="contents">
        <div class="flex flex-col gap-5">
          <!-- Identity grid -->
          <section class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
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
              <select v-model="form.alignment" class="field-input w-full">
                <option v-for="a in ALIGNMENTS" :key="a" :value="a.toLowerCase()">{{ a }}</option>
              </select>
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
                  @focus="($event.target as HTMLInputElement).select()"
                />
              </label>
              <div class="block">
                <span class="field-label">Hit Points</span>
                <DiceExprInput
                  :model-value="sb.hit_points || null"
                  placeholder="8d8+16"
                  @update:model-value="sb.hit_points = $event ?? ''"
                />
              </div>
              <div class="block col-span-full">
                <span class="field-label">Speed</span>
                <div class="grid grid-cols-5 gap-2 mt-1">
                  <div v-for="sp in SPEED_TYPES" :key="sp.key" class="flex flex-col items-center gap-1">
                    <span class="font-cinzel text-[10px] font-semibold tracking-wider text-muted-foreground">{{ sp.label }}</span>
                    <!-- Fly: left-edge hover toggle embedded in the box -->
                    <div v-if="sp.key === 'fly'"
                      class="relative w-full rounded-md overflow-hidden border border-border bg-muted focus-within:ring-1 focus-within:ring-ring">
                      <button type="button"
                        class="absolute inset-y-0 left-0 w-4 transition-colors flex items-center justify-center"
                        :class="speedObj.hover && speedObj.fly ? 'bg-primary/70' : 'bg-border/50 hover:bg-border/80'"
                        :title="!speedObj.fly ? 'Set a fly speed to enable hover' : speedObj.hover ? 'Hover on — click to disable' : 'Hover off — click to enable'"
                        @click="speedObj.fly && (speedObj.hover = !speedObj.hover)"
                      >
                        <IconWind class="w-2.5 h-2.5 shrink-0"
                          :class="speedObj.hover && speedObj.fly ? 'text-primary-foreground' : 'text-muted-foreground/60'" />
                      </button>
                      <input :value="speedObj.fly ?? ''" type="number" step="5" min="0" placeholder="—"
                        class="speed-input w-full bg-transparent pl-6 pr-8 py-1.5 font-fell text-sm text-foreground text-center placeholder:text-muted-foreground/40 focus:outline-none"
                        @focus="($event.target as HTMLInputElement).select()"
                        @input="setSpeed('fly', ($event.target as HTMLInputElement).value)" />
                      <span class="absolute inset-y-0 right-1.5 flex items-center pointer-events-none font-cinzel text-[10px] text-muted-foreground">ft.</span>
                    </div>
                    <!-- Other speeds: standard -->
                    <div v-else class="relative w-full">
                      <input :value="speedObj[sp.key] ?? ''" type="number" step="5" min="0" placeholder="—"
                        class="field-input speed-input w-full text-center"
                        @focus="($event.target as HTMLInputElement).select()"
                        @input="setSpeed(sp.key, ($event.target as HTMLInputElement).value)" />
                      <span class="absolute inset-y-0 right-1.5 flex items-center pointer-events-none font-cinzel text-[10px] text-muted-foreground">ft.</span>
                    </div>
                  </div>
                </div>
              </div>
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
                  @focus="($event.target as HTMLInputElement).select()"
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
              <span class="field-label">Proficiency Bonus</span>
              <input
                v-model.number="sb.proficiency_bonus"
                type="number"
                min="0"
                class="field-input w-full"
                placeholder="2"
                @focus="($event.target as HTMLInputElement).select()"
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
                @focus="($event.target as HTMLInputElement).select()"
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

          <!-- Spellcasting -->
          <section>
            <SpellcastingSection
              v-model="sb.spellcasting"
              :ability-scores="{ int: sb.int, wis: sb.wis, cha: sb.cha }"
              :proficiency-bonus="sb.proficiency_bonus ?? null"
              :challenge-rating="sb.challenge_rating"
            />
          </section>

          <!-- Description -->
          <section>
            <span class="field-label block mb-1">Description</span>
            <RichTextEditor
              v-model="form.description"
              placeholder="Lore, habitat, behaviour, and flavour text…"
              min-height="160px"
            />
          </section>

          <!-- Notes -->
          <section>
            <span class="field-label block mb-1">DM Notes</span>
            <RichTextEditor
              v-model="form.notes"
              placeholder="Encounter notes, tactics, lair description…"
              min-height="120px"
            />
          </section>
        </div>
      </fieldset>
    </div>

  </div>

  <!-- AI generation dialog -->
  <MonsterGenerateDialog
    v-if="showGenerateDialog && isAiEnabled"
    @close="showGenerateDialog = false"
    @generated="onAiGenerated"
  />

  <PaywallModal v-model="showPaywall" resource="monsters" />
</template>

<script setup lang="ts">
import { useConfirm } from "@/composables/useConfirm";
const { confirm } = useConfirm();
import { ref, reactive, computed, watch, watchEffect } from "vue";
import { parseSpeed, speedToString } from "@/lib/utils";
import type { SpeedBlock } from "@/lib/utils";
import { useRouter } from "vue-router";
import { IconCopy, IconDelete, IconGenerate, IconSave, IconScrollText, IconWind } from '@/lib/icons';
import MonsterGenerateDialog from "@/ai/MonsterGenerateDialog.vue";
import { toTiptapJson } from "@/ai/useNpcGeneration";
import { useCampaignStore } from "@/stores/campaign";
import type { MonsterAiGenerated } from "@/ai/types";
import RichTextEditor from "@/components/common/RichTextEditor.vue";
import TagInput from "@/components/common/TagInput.vue";
import ImageUpload from "@/components/common/ImageUpload.vue";
import DiceExprInput from "@/components/common/DiceExprInput.vue";
import {
  useCreateMonster,
  useUpdateMonster,
  useDeleteMonster,
  useCloneSrdMonster,
} from "@/composables/useMonsters";
import { useUpsertSrdMonsterArt } from "@/composables/useSrdMonsterArt";
import { useCreateScriptoriumDocument } from "@/composables/useScriptorium";
import { formatMonsterForScriptorium } from "@/lib/scriptoriumImport";
import TraitSection from "@/components/npcs/TraitSection.vue";
import SpellcastingSection from "@/components/common/SpellcastingSection.vue";
import type {
  Monster,
  MonsterType,
  MonsterSize,
  MonsterStatBlock,
} from "@/types/monster.types";
import PaywallModal from "@/components/common/PaywallModal.vue";
import { isQuotaExceeded } from "@/lib/quotaError";

const ALIGNMENTS = [
  "Lawful Good", "Neutral Good", "Chaotic Good",
  "Lawful Neutral", "True Neutral", "Chaotic Neutral",
  "Lawful Evil", "Neutral Evil", "Chaotic Evil", "Unaligned",
];
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

const { mutateAsync: upsertSrdArt } = useUpsertSrdMonsterArt();

const form = reactive({
  name: props.monster?.name ?? "",
  monster_type: (props.monster?.monster_type ?? "humanoid") as MonsterType,
  size: (props.monster?.size ?? "medium") as MonsterSize,
  alignment: props.monster?.alignment ?? "unaligned",
  habitat: props.monster?.habitat ?? "",
  source: props.monster?.source ?? "",
  tags: props.monster?.tags ? [...props.monster.tags] : [],
  description: props.monster?.description ?? "",
  notes: props.monster?.notes ?? "",
  image_url: props.monster?.image_url ?? "",
  portrait_focal_point: props.monster?.portrait_focal_point ?? null,
});

// When SRD art loads asynchronously, sync art fields from the updated prop
watch(
  () => props.monster,
  (m) => {
    if (isSrd.value && m) {
      form.image_url = m.image_url ?? "";
      form.portrait_focal_point = m.portrait_focal_point ?? null;
    }
  },
);

function defaultSb(): MonsterStatBlock {
  return {
    armor_class: 10,
    hit_points: "10 (2d8+1)",
    speed: "30 ft.", // serialized string; speedObj is the edit state
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

// Speed structured editor state — parsed from sb.speed on init,
// kept in sync so buildPayload() always gets the right string.
const speedObj = reactive<SpeedBlock>(parseSpeed(sb.speed));
watchEffect(() => {
  sb.speed = speedToString(speedObj);
});

const SPEED_TYPES = [
  { key: "walk", label: "Walk" },
  { key: "fly",  label: "Fly"  },
  { key: "swim", label: "Swim" },
  { key: "climb",label: "Climb"},
  { key: "burrow",label:"Burrow"},
] as const;

function setSpeed(key: "walk" | "fly" | "swim" | "climb" | "burrow", val: string) {
  speedObj[key] = val === "" ? undefined : parseInt(val, 10);
  if (key === "fly" && !speedObj.fly) speedObj.hover = undefined;
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

// Ability modifier
function mod(score: number) {
  return Math.floor((score - 10) / 2);
}

// Image upload handlers (ImageUpload component handles bucket upload/delete internally)
function onPortraitUrlUpdate(url: string | null) {
  if (isSrd.value) upsertSrdArt({ srd_id: props.monster!.id, image_url: url });
  else form.image_url = url ?? "";
}
function onPortraitFocalUpdate(pt: { x: number; y: number } | null) {
  if (isSrd.value) upsertSrdArt({ srd_id: props.monster!.id, portrait_focal_point: pt });
  else form.portrait_focal_point = pt;
}
// AI generation
const campaignStore = useCampaignStore();
const isAiEnabled = computed(() => campaignStore.isAiEnabled);
const showGenerateDialog = ref(false);

function onAiGenerated(result: MonsterAiGenerated) {
  showGenerateDialog.value = false;
  form.name = result.name;
  form.monster_type = result.monster_type;
  form.size = result.size;
  form.alignment = (result.alignment || "unaligned").toLowerCase();
  form.habitat = result.habitat ?? "";
  form.source = "Grimoire:AI";
  form.tags = [...result.tags];
  form.description = result.description ? toTiptapJson(result.description) : "";
  form.notes = result.notes ? toTiptapJson(result.notes) : "";
  if (result.image_url) {
    form.image_url = result.image_url;
    form.portrait_focal_point = null;
  }
  Object.assign(sb, defaultSb(), result.stat_block);
}

// IconSave
const { mutateAsync: create } = useCreateMonster();
const { mutateAsync: update } = useUpdateMonster();
const { mutateAsync: del } = useDeleteMonster();
const { mutateAsync: clone } = useCloneSrdMonster();
const { mutateAsync: createScriptoriumDoc } = useCreateScriptoriumDocument();
const saving = ref(false);
const showPaywall = ref(false);
const cloning = ref(false);
const duplicating = ref(false);
const saveError = ref("");
const sendingToScriptorium = ref(false);

async function duplicate() {
  if (!props.monster) return;
  duplicating.value = true;
  try {
    const copy = await create({ ...buildPayload(), name: `${props.monster.name} (copy)` });
    router.push(`/monsters/${copy.id}`);
  } finally {
    duplicating.value = false;
  }
}

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
    description: form.description || null,
    notes: form.notes || null,
    image_url: form.image_url || null,
    portrait_focal_point: form.portrait_focal_point ?? null,
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
      router.push(`/monsters/${props.monster.id}`);
    } else {
      const created = await create(buildPayload());
      router.push(`/monsters/${created.id}`);
    }
  } catch (e: unknown) {
    if (isQuotaExceeded(e)) { showPaywall.value = true; return; }
    saveError.value = e instanceof Error ? e.message : "Failed to save";
  } finally {
    saving.value = false;
  }
}

async function remove() {
  if (!props.monster) return;
  if (!(await confirm(`Delete ${props.monster.name}? This cannot be undone.`)))
    return;
  router.push("/monsters");
  await del(props.monster);
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
.speed-input { -moz-appearance: textfield; }
.speed-input::-webkit-outer-spin-button,
.speed-input::-webkit-inner-spin-button { appearance: none; }
</style>
