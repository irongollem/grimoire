<template>
  <!-- Mobile edit (<md): full-screen takeover with its own app bar + save bar.
       Form state lives here; MonsterEditMobile owns layout only. -->
  <MonsterEditMobile
    v-if="isMobile"
    :form="form"
    :sb="sb"
    :monster-id="props.monster?.id"
    :is-srd="isSrd"
    :is-new="!props.monster"
    :is-saving="saving"
    :is-cloning="cloning"
    :is-duplicating="duplicating"
    :is-sending-to-scriptorium="sendingToScriptorium"
    :is-ai-enabled="isAiEnabled"
    @save="save"
    @cancel="onCancel"
    @delete="remove"
    @duplicate="duplicate"
    @customize="customize"
    @scriptorium="sendToScriptorium"
    @generate="showGenerateDialog = true"
    @update:image-url="onPortraitUrlUpdate($event)"
    @update:focal-point="onPortraitFocalUpdate($event)"
  />

  <!-- Desktop (≥md): unchanged two-column grid form -->
  <div v-else class="flex flex-col gap-5 min-w-0 max-w-full">
    <!-- Read-only SRD banner -->
    <div
      v-if="isSrd"
      class="flex items-center justify-between gap-3 rounded-md border border-border bg-muted/50 px-4 py-2.5"
    >
      <p class="text-body text-muted-foreground italic">
        Read-only reference. Customize to create your own editable copy.
      </p>
      <button
        type="button"
        :disabled="cloning"
        class="inline-flex items-center gap-1.5 rounded-md bg-primary px-4 py-2 text-label-lg font-semibold text-primary-foreground hover:opacity-90 transition-opacity disabled:opacity-50 shrink-0"
        @click="customize"
      >
        <IconCopy class="h-3.5 w-3.5" />
        {{ cloning ? "Copying…" : "Customize" }}
      </button>
    </div>

    <!-- Top bar (editable monsters only) -->
    <EntityEditorActionBar
      v-else
      :title="form.name"
      title-placeholder="Monster name…"
      :exists="!!props.monster"
      :can-save="!!form.name.trim()"
      :saving="saving"
      create-label="Create"
      :error="saveError"
      @update:title="form.name = $event"
      @save="save"
      @delete="remove"
    >
      <template #extra-actions>
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
      </template>
    </EntityEditorActionBar>

    <!-- Two-column body: portrait sidebar + stat block content -->
    <!-- Left col is NOT in fieldset — ImageUploads must remain interactive for SRD art -->
    <div class="grid grid-cols-1 lg:grid-cols-[13.75rem_1fr] gap-6">
      <!-- Left: Portrait + Tags -->
      <div class="space-y-4">
        <!-- Portrait -->
        <EntityImageBlock
          :model-value="form.image_url"
          :focal-point="form.portrait_focal_point"
          bucket="monster-images"
          show-focal-point
          ai-kind="monster"
          :ai-target-id="props.monster?.id"
          :ai-context="aiContext"
          :mini-source="props.monster?.id ? { table: 'monsters', id: props.monster.id } : undefined"
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
              class="inline-flex items-center px-2 py-0.5 rounded bg-muted text-label-lg text-muted-foreground"
              >{{ tag }}</span
            >
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
                <option
                  v-for="a in ALIGNMENTS"
                  :key="a"
                  :value="a.toLowerCase()"
                >
                  {{ a }}
                </option>
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
            <label class="block">
              <span class="field-label">Lair Location</span>
              <EntityCombobox
                :model-value="form.lair_location_id ?? ''"
                :options="locationOptions"
                placeholder="— none —"
                @update:model-value="form.lair_location_id = $event || null"
              >
                <template #option="{ opt }">
                  <span :style="{ paddingLeft: `${(opt as LocationOption).depth * 12}px` }">{{ opt.name }}</span>
                </template>
              </EntityCombobox>
            </label>
          </section>

          <!-- Divider -->
          <div class="gold-divider" />

          <StatBlockEditor :sb="sb" show-legendary show-lair />

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
import { ref, reactive, computed, watch } from "vue";
import { useRouter } from "vue-router";
import { useMediaQuery } from "@vueuse/core";
import { IconCopy, IconGenerate, IconScrollText } from "@/lib/icons";
import MonsterEditMobile from "@/components/monsters/MonsterEditMobile.vue";
import MonsterGenerateDialog from "@/ai/MonsterGenerateDialog.vue";
import { toTiptapJson } from "@/ai/useNpcGeneration";
import { buildEntityContext, toPlainText } from "@/ai/utils";
import { useCampaignStore } from "@/stores/campaign";
import type { MonsterAiGenerated } from "@/ai/types";
import RichTextEditor from "@/components/common/RichTextEditor.vue";
import TagInput from "@/components/common/TagInput.vue";
import EntityCombobox from "@/components/common/EntityCombobox.vue";
import { useLocationTree } from "@/composables/useLocations";
import type { Location } from "@/types/location.types";
import EntityImageBlock from "@/components/common/EntityImageBlock.vue";
import EntityEditorActionBar from "@/components/common/EntityEditorActionBar.vue";
import StatBlockEditor from "@/components/common/StatBlockEditor.vue";
import {
  useCreateMonster,
  useUpdateMonster,
  useDeleteMonster,
  useCloneSrdMonster,
} from "@/composables/useMonsters";
import { useUpsertSrdMonsterArt } from "@/composables/useSrdMonsterArt";
import { useCreateScriptoriumDocument } from "@/composables/useScriptorium";
import { formatMonsterForScriptorium } from "@/lib/scriptoriumImport";
import type {
  Monster,
  MonsterType,
  MonsterSize,
  MonsterStatBlock,
} from "@/types/monster.types";
import PaywallModal from "@/components/common/PaywallModal.vue";
import { isQuotaExceeded } from "@/lib/quotaError";

const ALIGNMENTS = [
  "Lawful Good",
  "Neutral Good",
  "Chaotic Good",
  "Lawful Neutral",
  "True Neutral",
  "Chaotic Neutral",
  "Lawful Evil",
  "Neutral Evil",
  "Chaotic Evil",
  "Unaligned",
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
const props = defineProps<{ monster: Monster | null }>();
const router = useRouter();

const isSrd = computed(() => !!props.monster?.is_srd);

const aiContext = computed(() =>
  buildEntityContext([
    form.name,
    `${form.size} ${form.monster_type}`,
    form.alignment,
    form.habitat,
    toPlainText(form.description),
  ]),
);

// Mobile-only edit layer (<md). Desktop keeps the existing two-column grid form,
// byte-identical to before.
const isMobile = useMediaQuery("(max-width: 767px)");

// Leaving edit mode on mobile: existing monsters drop the ?edit=true flag (back
// to the read view); a brand-new monster has no detail page to fall back to, so
// it returns to the list — the post-mutation/cancel feedback surface.
function onCancel() {
  if (props.monster) {
    void router.replace(`/monsters/${props.monster.id}`);
  } else {
    void router.push("/monsters");
  }
}

const { mutateAsync: upsertSrdArt } = useUpsertSrdMonsterArt();

type LocationOption = Location & { depth: number };
const { locationOptions } = useLocationTree();

const form = reactive({
  name: props.monster?.name ?? "",
  monster_type: (props.monster?.monster_type ?? "humanoid") as MonsterType,
  size: (props.monster?.size ?? "medium") as MonsterSize,
  alignment: props.monster?.alignment ?? "unaligned",
  habitat: props.monster?.habitat ?? "",
  lair_location_id: (props.monster?.lair_location_id ?? null) as string | null,
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

// Image upload handlers
function onPortraitUrlUpdate(url: string | null) {
  if (isSrd.value) upsertSrdArt({ srd_id: props.monster!.id, image_url: url });
  else form.image_url = url ?? "";
}
function onPortraitFocalUpdate(pt: { x: number; y: number } | null) {
  if (isSrd.value)
    upsertSrdArt({ srd_id: props.monster!.id, portrait_focal_point: pt });
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
    const copy = await create({
      ...buildPayload(),
      name: `${props.monster.name} (copy)`,
    });
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
    lair_location_id: form.lair_location_id,
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
    if (isQuotaExceeded(e)) {
      showPaywall.value = true;
      return;
    }
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
  @apply block text-label-lg font-semibold text-muted-foreground mb-1;
}
.field-input {
  @apply bg-muted border border-border rounded-md px-3 py-1.5 text-body text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring;
}
.section-heading {
  @apply text-label-lg font-semibold text-muted-foreground uppercase mb-3;
}
.gold-divider {
  @apply border-t border-primary/30;
}
.speed-input {
  -moz-appearance: textfield;
}
.speed-input::-webkit-outer-spin-button,
.speed-input::-webkit-inner-spin-button {
  appearance: none;
}
</style>
