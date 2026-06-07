<template>
  <div class="flex flex-col gap-5">
    <!-- Name input -->
    <label>
      <span class="sr-only">Species name</span>
      <input
        v-model="form.name"
        placeholder="Species name…"
        class="w-full bg-card border border-border rounded-md px-3 py-2 font-cinzel text-lg font-bold text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
      />
    </label>

    <p v-if="saveError" class="text-destructive font-fell text-sm">{{ saveError }}</p>

    <!-- Two-column: portrait sidebar + details -->
    <div class="grid grid-cols-1 lg:grid-cols-[220px_1fr] gap-6">
      <!-- Left: Portrait -->
      <div class="space-y-4">
        <EntityImageBlock
          :model-value="form.image_url || null"
          :focal-point="form.focal_point"
          show-focal-point
          bucket="asset-images"
          ai-kind="species"
          :ai-context="aiContext"
          @update:model-value="form.image_url = $event ?? ''"
          @update:focal-point="form.focal_point = $event"
        />

        <!-- Tags -->
        <div>
          <label class="block font-cinzel text-xs font-semibold tracking-wider text-muted-foreground mb-1.5">
            TAGS
          </label>
          <TagInput v-model="form.tags" placeholder="humanoid, fey, undead…" />
        </div>

        <!-- Shapeshifter flag -->
        <label class="flex items-center gap-2 cursor-pointer">
          <input type="checkbox" v-model="form.is_shapeshifter" class="rounded" />
          <span class="font-fell text-sm text-muted-foreground italic">Shapeshifter (player can polymorph)</span>
        </label>

        <!-- Campaign-specific flag -->
        <div v-if="campaignStore.activeCampaignId" class="rounded-md border border-border/60 bg-muted/20 p-3 space-y-1">
          <label class="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" :checked="form.campaign_id === campaignStore.activeCampaignId" class="rounded" @change="toggleCampaignSpecific" />
            <span class="font-fell text-sm text-foreground">Campaign-only</span>
          </label>
          <p class="font-fell text-xs text-muted-foreground italic pl-6">
            Restrict this species to <strong>{{ campaignStore.activeCampaign?.name }}</strong>. It won't appear in other campaigns.
          </p>
        </div>
      </div>

      <!-- Right: Fields -->
      <fieldset class="space-y-5 min-w-0">
        <!-- Size + Source row -->
        <div class="grid grid-cols-2 gap-3">
          <div>
            <label class="block font-cinzel text-xs font-semibold tracking-wider text-muted-foreground mb-1.5">SIZE</label>
            <select
              v-model="form.size"
              class="w-full bg-card border border-border rounded-md px-3 py-1.5 font-fell text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
            >
              <option value="">— none —</option>
              <option v-for="sz in SIZES" :key="sz" :value="sz" class="capitalize">{{ sz }}</option>
            </select>
          </div>
          <div>
            <label class="block font-cinzel text-xs font-semibold tracking-wider text-muted-foreground mb-1.5">SOURCE</label>
            <input
              v-model="form.source"
              placeholder="PHB 2024, Homebrew…"
              class="w-full bg-card border border-border rounded-md px-3 py-1.5 font-fell text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
            />
          </div>
        </div>

        <!-- Avg Height + Weight row -->
        <div class="grid grid-cols-2 gap-3">
          <div>
            <label class="block font-cinzel text-xs font-semibold tracking-wider text-muted-foreground mb-1.5">AVG. HEIGHT</label>
            <input
              v-model="form.avg_height"
              placeholder="e.g. 5 ft 9 in (175 cm)…"
              class="w-full bg-card border border-border rounded-md px-3 py-1.5 font-fell text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
            />
          </div>
          <div>
            <label class="block font-cinzel text-xs font-semibold tracking-wider text-muted-foreground mb-1.5">AVG. WEIGHT</label>
            <input
              v-model="form.avg_weight"
              placeholder="e.g. 165 lbs (75 kg)…"
              class="w-full bg-card border border-border rounded-md px-3 py-1.5 font-fell text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
            />
          </div>
        </div>

        <!-- Natural Armor AC -->
        <div>
          <label class="block font-cinzel text-xs font-semibold tracking-wider text-muted-foreground mb-1.5">NATURAL ARMOR AC</label>
          <div class="flex items-center gap-2">
            <input
              v-model.number="form.natural_armor_ac"
              type="number"
              min="1"
              max="30"
              placeholder="—"
              class="w-24 bg-card border border-border rounded-md px-3 py-1.5 font-fell text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
            />
            <span class="font-fell text-xs text-muted-foreground italic">Leave blank if the species has no natural armor trait</span>
          </div>
        </div>

        <!-- Speed -->
        <div>
          <label class="block font-cinzel text-xs font-semibold tracking-wider text-muted-foreground mb-1.5">SPEED (ft)</label>
          <div class="grid grid-cols-3 sm:grid-cols-5 gap-2">
            <div v-for="type in SPEED_TYPES" :key="type">
              <label class="block font-fell text-[11px] text-muted-foreground mb-0.5 capitalize">{{ type }}</label>
              <input
                :value="form.speed[type] ?? ''"
                type="number"
                min="0"
                step="5"
                :placeholder="type === 'walk' ? '30' : '—'"
                class="w-full bg-card border border-border rounded-md px-2 py-1.5 font-fell text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                @input="setSpeed(type, ($event.target as HTMLInputElement).value)"
              />
            </div>
          </div>
        </div>

        <!-- Ability Score Increases -->
        <div>
          <label class="block font-cinzel text-xs font-semibold tracking-wider text-muted-foreground mb-1.5">ABILITY SCORE INCREASES</label>
          <input
            v-model="form.asiDescription"
            placeholder="e.g. +2 STR, +1 to any ability score of your choice…"
            class="w-full bg-card border border-border rounded-md px-3 py-1.5 font-fell text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
          />
        </div>

        <!-- Languages -->
        <div>
          <label class="block font-cinzel text-xs font-semibold tracking-wider text-muted-foreground mb-1.5">LANGUAGES</label>
          <TagInput v-model="form.languages" placeholder="Common, Elvish…" />
        </div>

        <!-- Description -->
        <div>
          <label class="block font-cinzel text-xs font-semibold tracking-wider text-muted-foreground mb-1.5">DESCRIPTION</label>
          <RichTextEditor v-model="form.description" placeholder="Describe this species…" />
        </div>

        <!-- Traits -->
        <TraitSection v-model="form.traits" label="Racial Trait" />

        <!-- Subraces -->
        <div>
          <p class="font-cinzel text-xs font-semibold tracking-wider text-muted-foreground mb-2">SUBRACES / LINEAGES</p>
          <div
            v-for="(sub, i) in form.subraces"
            :key="i"
            class="rounded-md border border-border p-4 mb-3 space-y-3"
          >
            <div class="flex items-center gap-2">
              <input
                v-model="sub.name"
                placeholder="Subrace name…"
                class="flex-1 bg-muted border border-border rounded-md px-3 py-1.5 font-cinzel text-sm font-semibold text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
              />
              <button
                type="button"
                class="text-muted-foreground hover:text-destructive transition-colors shrink-0 text-lg leading-none"
                @click="removeSubrace(i)"
              >
                ✕
              </button>
            </div>
            <label class="block">
              <span class="font-cinzel text-[10px] font-semibold tracking-wider text-muted-foreground">ABILITY BONUS</span>
              <input
                v-model="sub.asiText"
                placeholder="e.g. CHA +1 or +1 Charisma"
                class="mt-1 w-full bg-muted border border-border rounded-md px-3 py-1.5 font-fell text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
              />
            </label>
            <RichTextEditor v-model="sub.description" placeholder="Subrace description…" />
            <TraitSection v-model="sub.traits" label="Subrace Trait" />
          </div>
          <button
            type="button"
            class="font-cinzel text-xs font-semibold text-primary hover:opacity-80 transition-opacity"
            @click="addSubrace"
          >
            + Add Subrace
          </button>
        </div>

        <!-- Spell Grants -->
        <SpeciesSpellGrants
          :grants="form.grantedSpells"
          :subrace-names="form.subraces.map((sr) => sr.name)"
          @add="form.grantedSpells.push($event)"
          @remove="form.grantedSpells.splice($event, 1)"
        />

        <!-- DM Notes -->
        <div>
          <label class="block font-cinzel text-xs font-semibold tracking-wider text-muted-foreground mb-1.5">DM NOTES</label>
          <RichTextEditor v-model="form.notes" placeholder="Private DM notes…" />
        </div>
      </fieldset>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, watch, computed } from "vue";
import { buildEntityContext, toPlainText } from "@/ai/utils";
import { useRouter } from "vue-router";
import { useCreateSpecies, useUpdateSpecies, useDeleteSpecies } from "@/composables/useSpecies";
import { useConfirm } from "@/composables/useConfirm";
import { useCampaignStore } from "@/stores/campaign";
import RichTextEditor from "@/components/common/RichTextEditor.vue";
import EntityImageBlock from "@/components/common/EntityImageBlock.vue";
import TagInput from "@/components/common/TagInput.vue";
import TraitSection from "@/components/npcs/TraitSection.vue";
import SpeciesSpellGrants from "@/components/species/SpeciesSpellGrants.vue";
import type { Species, SpeciesSize } from "@/types/species.types";

const props = defineProps<{ species?: Species | null }>();

const router = useRouter();
const { confirm } = useConfirm();
const campaignStore = useCampaignStore();
const { mutateAsync: createSpecies } = useCreateSpecies();
const { mutateAsync: updateSpecies } = useUpdateSpecies();
const { mutate: deleteSpecies } = useDeleteSpecies();

const SIZES: SpeciesSize[] = ["tiny", "small", "medium", "large"];
const SPEED_TYPES = ["walk", "fly", "swim", "climb", "burrow"] as const;

const saving = ref(false);
const saveError = ref("");

function asiToString(asi: Species["ability_score_increases"]): string {
  if (!asi) return "";
  // Stored as { description: string } from free-text edits
  if ("description" in asi && typeof asi.description === "string") return asi.description as string;
  // Stored as { dex: 2, int: 1, ... } from Open5e import
  return Object.entries(asi)
    .map(([k, v]) => `+${v} ${k.toUpperCase()}`)
    .join(", ");
}

// Maps 3-letter codes and full names → canonical 3-letter key
const ASI_ABILITY_MAP: Record<string, string> = {
  str: "str", strength: "str",
  dex: "dex", dexterity: "dex",
  con: "con", constitution: "con",
  int: "int", intelligence: "int",
  wis: "wis", wisdom: "wis",
  cha: "cha", charisma: "cha",
};

/**
 * Try to parse a simple "+2 DEX, +1 WIS" style string back to a structured map.
 * Supports "+N STAT" and "STAT +N" in any order, 3-letter codes or full names.
 * Returns null if any token can't be parsed — caller falls back to { description }.
 */
function tryParseAsiText(text: string): Record<string, number> | null {
  const parts = text.split(/,\s*/);
  const result: Record<string, number> = {};
  for (const part of parts) {
    const m = part.trim().match(/^\+?(\d+)\s+([A-Za-z]+)$/) ??
              part.trim().match(/^([A-Za-z]+)\s+\+?(\d+)$/);
    if (!m) return null;
    const [val, abilityRaw] = m[1].match(/^\d+$/)
      ? [parseInt(m[1]), m[2].toLowerCase()]
      : [parseInt(m[2]), m[1].toLowerCase()];
    const key = ASI_ABILITY_MAP[abilityRaw];
    if (!key || isNaN(val)) return null;
    result[key] = val;
  }
  return Object.keys(result).length ? result : null;
}

function makeForm(s?: Species | null) {
  return {
    name: s?.name ?? "",
    description: s?.description ?? "",
    notes: s?.notes ?? "",
    size: (s?.size ?? "") as SpeciesSize | "",
    speed: { ...s?.speed } as Partial<Record<typeof SPEED_TYPES[number], number>>,
    asiDescription: asiToString(s?.ability_score_increases ?? null),
    traits: (s?.traits ?? []).map((t) => ({ ...t })),
    languages: [...(s?.languages ?? [])],
    tags: [...(s?.tags ?? [])],
    source: s?.source ?? "",
    subraces: (s?.subraces ?? []).map((sr) => ({
      name: sr.name,
      description: sr.description,
      traits: sr.traits.map((t) => ({ ...t })),
      ability_score_increases: sr.ability_score_increases ?? null,
      asiText: asiToString(sr.ability_score_increases ?? null),
    })),
    image_url: s?.image_url ?? "",
    focal_point: s?.focal_point ?? null,
    is_shapeshifter: s?.is_shapeshifter ?? false,
    natural_armor_ac: s?.natural_armor_ac ?? null as number | null,
    avg_height: s?.avg_height ?? "",
    avg_weight: s?.avg_weight ?? "",
    grantedSpells: (s?.granted_spells ?? []).map((g) => ({ ...g })),
    campaign_id: s?.campaign_id ?? null as string | null,
  };
}

function toggleCampaignSpecific() {
  const id = campaignStore.activeCampaignId;
  if (!id) return;
  form.campaign_id = form.campaign_id === id ? null : id;
}

const form = reactive(makeForm(props.species));

const aiContext = computed(() =>
  buildEntityContext([form.name, toPlainText(form.description)]),
);

watch(() => props.species, (s) => {
  Object.assign(form, makeForm(s));
});

function setSpeed(type: typeof SPEED_TYPES[number], raw: string) {
  const val = parseInt(raw);
  if (raw === "" || isNaN(val)) {
    delete form.speed[type];
  } else {
    form.speed[type] = val;
  }
}

function addSubrace() {
  form.subraces.push({ name: "", description: "", traits: [], ability_score_increases: null, asiText: "" });
}

function removeSubrace(i: number) {
  form.subraces.splice(i, 1);
}

async function save() {
  saving.value = true;
  saveError.value = "";
  try {
    const payload = {
      name: form.name.trim(),
      description: form.description || null,
      notes: form.notes || null,
      size: (form.size as SpeciesSize) || null,
      speed: Object.keys(form.speed).length ? form.speed : null,
      ability_score_increases: (() => {
        const t = form.asiDescription.trim();
        if (!t) return null;
        return tryParseAsiText(t) ?? { description: t };
      })(),
      traits: form.traits.length ? form.traits : null,
      languages: form.languages,
      tags: form.tags,
      source: form.source.trim() || null,
      subraces: form.subraces.length
        ? form.subraces.map((sr) => ({
            name: sr.name,
            description: sr.description,
            traits: sr.traits,
            ability_score_increases: (() => {
              const t = sr.asiText?.trim();
              if (!t) return null;
              return tryParseAsiText(t) ?? { description: t };
            })(),
          }))
        : null,
      image_url: form.image_url || null,
      focal_point: form.focal_point,
      is_shapeshifter: form.is_shapeshifter,
      natural_armor_ac: form.natural_armor_ac || null,
      avg_height: form.avg_height.trim() || null,
      avg_weight: form.avg_weight.trim() || null,
      granted_spells: form.grantedSpells,
      campaign_id: form.campaign_id,
    };

    if (props.species) {
      await updateSpecies({ id: props.species.id, update: payload });
    } else {
      await createSpecies(payload);
    }
    router.push("/species");
  } catch (e) {
    saveError.value = e instanceof Error ? e.message : "Failed to save.";
  } finally {
    saving.value = false;
  }
}

async function remove() {
  if (!props.species) return;
  const ok = await confirm(`Delete "${props.species.name}"? This cannot be undone.`, { confirmLabel: "Delete" });
  if (!ok) return;
  router.push("/species");
  deleteSpecies(props.species);
}

defineExpose({
  saving,
  canSave: computed(() => !saving.value && !!form.name.trim()),
  save,
  remove,
})
</script>
