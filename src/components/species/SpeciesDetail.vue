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
        <ImageUpload
          :model-value="form.image_url || null"
          :focal-point="form.focal_point"
          show-focal-point
          label="Portrait"
          bucket="asset-images"
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
        <div>
          <p class="font-cinzel text-xs font-semibold tracking-wider text-muted-foreground mb-2">SPELL GRANTS</p>

          <!-- Existing grants -->
          <div v-if="form.grantedSpells.length" class="space-y-2 mb-3">
            <div
              v-for="(grant, i) in form.grantedSpells"
              :key="i"
              class="flex items-center gap-2 rounded-md border border-border bg-muted/20 px-3 py-2"
            >
              <div class="h-2 w-2 rounded-full shrink-0" :class="grant.spell_id ? 'bg-violet-400' : 'bg-amber-400'" />
              <span class="font-fell text-sm text-foreground flex-1 truncate">{{ grant.spell_name }}</span>
              <span v-if="grant.subrace" class="font-cinzel text-[10px] text-sky-400 shrink-0">{{ grant.subrace }}</span>
              <span v-if="!grant.spell_id" class="font-cinzel text-[10px] text-amber-500 shrink-0">player picks</span>
              <span class="font-cinzel text-[10px] text-muted-foreground shrink-0">
                {{ grant.uses_per_day === null ? "At will" : `${grant.uses_per_day}/day` }}
                <template v-if="grant.uses_per_day !== null"> · {{ grant.resets_on === 'short_rest' ? 'SR' : 'LR' }}</template>
              </span>
              <span v-if="grant.min_level > 1" class="font-cinzel text-[10px] text-amber-500 shrink-0">Lvl {{ grant.min_level }}+</span>
              <button type="button" class="text-muted-foreground hover:text-destructive transition-colors shrink-0 text-sm" @click="removeGrant(i)">✕</button>
            </div>
          </div>

          <!-- Add grant form -->
          <div v-if="addingGrant" class="rounded-md border border-border bg-muted/10 p-3 space-y-3 mb-3">
            <!-- Free pick toggle -->
            <label class="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" v-model="grantForm.isFreePick" class="rounded" />
              <span class="font-cinzel text-[10px] font-semibold text-muted-foreground tracking-wider">PLAYER CHOOSES SPELL (e.g. High Elf cantrip)</span>
            </label>

            <!-- Spell search (hidden for free pick) -->
            <div v-if="!grantForm.isFreePick" class="space-y-1">
              <label class="font-cinzel text-[10px] font-semibold tracking-wider text-muted-foreground">SPELL</label>
              <div v-if="grantForm.spell" class="flex items-center gap-2 px-2 py-1.5 rounded bg-violet-500/10 border border-violet-500/30">
                <div class="h-2 w-2 rounded-full bg-violet-400 shrink-0" />
                <span class="font-fell text-sm flex-1 truncate">{{ grantForm.spell.name }}</span>
                <span class="font-cinzel text-[10px] text-muted-foreground">{{ grantForm.spell.level === 0 ? 'Cantrip' : `Lvl ${grantForm.spell.level}` }}</span>
                <button type="button" class="text-muted-foreground hover:text-foreground text-xs" @click="grantForm.spell = null; grantForm.spellSearch = ''">×</button>
              </div>
              <div v-else class="relative">
                <input
                  v-model="grantForm.spellSearch"
                  type="text"
                  placeholder="Search spell…"
                  class="w-full bg-card border border-border rounded-md px-3 py-1.5 font-fell text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                />
                <div
                  v-if="grantSpellResults.length > 0 && grantForm.spellSearch.length >= 2"
                  class="absolute z-10 mt-1 w-full max-h-36 overflow-y-auto rounded-md border border-border bg-card divide-y divide-border shadow-lg"
                >
                  <button
                    v-for="spell in grantSpellResults"
                    :key="spell.id"
                    type="button"
                    class="w-full flex items-center gap-2 px-3 py-1.5 hover:bg-muted/50 transition-colors text-left"
                    @click="grantForm.spell = spell; grantForm.spellSearch = ''"
                  >
                    <span class="font-fell text-sm text-foreground flex-1 truncate">{{ spell.name }}</span>
                    <span class="font-cinzel text-[10px] text-muted-foreground shrink-0">{{ spell.level === 0 ? 'C' : spell.level }}</span>
                  </button>
                </div>
              </div>
            </div>

            <!-- Source label -->
            <div>
              <label class="font-cinzel text-[10px] font-semibold tracking-wider text-muted-foreground">SOURCE LABEL</label>
              <input
                v-model="grantForm.sourceLabel"
                type="text"
                placeholder="e.g. Tiefling — Infernal Legacy"
                class="mt-1 w-full bg-card border border-border rounded-md px-3 py-1.5 font-fell text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
              />
            </div>

            <!-- Subrace (only if species has subraces) -->
            <div v-if="form.subraces.length > 0">
              <label class="font-cinzel text-[10px] font-semibold tracking-wider text-muted-foreground">APPLIES TO SUBRACE</label>
              <div class="mt-1 flex flex-wrap gap-1.5">
                <button
                  type="button"
                  class="px-2.5 py-1 rounded font-cinzel text-[10px] font-semibold border transition-colors"
                  :class="grantForm.subrace === null ? 'bg-primary text-primary-foreground border-primary' : 'bg-card text-muted-foreground border-border hover:text-foreground'"
                  @click="grantForm.subrace = null"
                >All subraces</button>
                <button
                  v-for="sr in form.subraces"
                  :key="sr.name"
                  type="button"
                  class="px-2.5 py-1 rounded font-cinzel text-[10px] font-semibold border transition-colors"
                  :class="grantForm.subrace === sr.name ? 'bg-primary text-primary-foreground border-primary' : 'bg-card text-muted-foreground border-border hover:text-foreground'"
                  @click="grantForm.subrace = sr.name"
                >{{ sr.name }}</button>
              </div>
            </div>

            <!-- Uses + min level row -->
            <div class="flex gap-3 items-end">
              <div class="flex-1">
                <label class="font-cinzel text-[10px] font-semibold tracking-wider text-muted-foreground">USES</label>
                <div class="mt-1 flex rounded-md border border-border overflow-hidden text-xs font-cinzel font-semibold tracking-wider">
                  <button type="button" class="flex-1 px-2 py-1.5 transition-colors" :class="grantForm.usesPerDay === null ? 'bg-primary text-primary-foreground' : 'bg-card text-muted-foreground hover:text-foreground'" @click="grantForm.usesPerDay = null">At will</button>
                  <button type="button" class="flex-1 px-2 py-1.5 transition-colors" :class="grantForm.usesPerDay !== null ? 'bg-primary text-primary-foreground' : 'bg-card text-muted-foreground hover:text-foreground'" @click="grantForm.usesPerDay = grantForm.usesCount">{{ grantForm.usesPerDay !== null ? `${grantForm.usesCount}/day` : 'N/day' }}</button>
                </div>
                <div v-if="grantForm.usesPerDay !== null" class="mt-1 flex items-center border border-border rounded-md overflow-hidden">
                  <button type="button" class="px-2 py-1.5 font-cinzel text-sm text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors" :disabled="grantForm.usesCount <= 1" @click="grantForm.usesCount = Math.max(1, grantForm.usesCount - 1); grantForm.usesPerDay = grantForm.usesCount">−</button>
                  <span class="flex-1 text-center font-cinzel text-xs font-semibold">{{ grantForm.usesCount }}</span>
                  <button type="button" class="px-2 py-1.5 font-cinzel text-sm text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors" @click="grantForm.usesCount++; grantForm.usesPerDay = grantForm.usesCount">+</button>
                </div>
              </div>
              <div v-if="grantForm.usesPerDay !== null" class="flex-1">
                <label class="font-cinzel text-[10px] font-semibold tracking-wider text-muted-foreground">RESETS ON</label>
                <div class="mt-1 flex rounded-md border border-border overflow-hidden text-xs font-cinzel font-semibold tracking-wider">
                  <button type="button" class="flex-1 px-2 py-1.5 transition-colors" :class="grantForm.resetsOn === 'long_rest' ? 'bg-primary text-primary-foreground' : 'bg-card text-muted-foreground hover:text-foreground'" @click="grantForm.resetsOn = 'long_rest'">Long</button>
                  <button type="button" class="flex-1 px-2 py-1.5 transition-colors" :class="grantForm.resetsOn === 'short_rest' ? 'bg-primary text-primary-foreground' : 'bg-card text-muted-foreground hover:text-foreground'" @click="grantForm.resetsOn = 'short_rest'">Short</button>
                </div>
              </div>
              <div class="w-20">
                <label class="font-cinzel text-[10px] font-semibold tracking-wider text-muted-foreground">MIN LEVEL</label>
                <input
                  v-model.number="grantForm.minLevel"
                  type="number" min="1" max="20"
                  class="mt-1 w-full bg-card border border-border rounded-md px-2 py-1.5 font-fell text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                />
              </div>
            </div>

            <div class="flex gap-2 pt-1">
              <button type="button" class="font-cinzel text-xs font-semibold text-muted-foreground hover:text-foreground transition-colors" @click="cancelAddGrant">Cancel</button>
              <button type="button" class="font-cinzel text-xs font-semibold text-primary hover:opacity-80 transition-opacity disabled:opacity-40" :disabled="!grantForm.isFreePick && !grantForm.spell" @click="confirmAddGrant">Add Grant</button>
            </div>
          </div>

          <button v-else type="button" class="font-cinzel text-xs font-semibold text-primary hover:opacity-80 transition-opacity" @click="addingGrant = true">
            + Add Spell Grant
          </button>
        </div>

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
import { refDebounced } from "@vueuse/core";
import { useQuery } from "@tanstack/vue-query";
import { useRouter } from "vue-router";
import { useCreateSpecies, useUpdateSpecies, useDeleteSpecies } from "@/composables/useSpecies";
import { useConfirm } from "@/composables/useConfirm";
import { supabase } from "@/lib/supabase";
import RichTextEditor from "@/components/common/RichTextEditor.vue";
import ImageUpload from "@/components/common/ImageUpload.vue";
import TagInput from "@/components/common/TagInput.vue";
import TraitSection from "@/components/npcs/TraitSection.vue";
import type { Species, SpeciesSize, SpeciesSpellGrant } from "@/types/species.types";
import type { Spell } from "@/types/spell.types";

const props = defineProps<{ species?: Species | null }>();

const router = useRouter();
const { confirm } = useConfirm();
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
    grantedSpells: (s?.granted_spells ?? []).map((g) => ({ ...g })),
  };
}

// ── Spell grants ──────────────────────────────────────────────────────────────
const addingGrant = ref(false);

function makeGrantForm() {
  return {
    spell: null as Spell | null,
    spellSearch: "",
    isFreePick: false,
    sourceLabel: "",
    subrace: null as string | null,
    usesPerDay: null as number | null,
    usesCount: 1,
    resetsOn: "long_rest" as "long_rest" | "short_rest",
    minLevel: 1,
  };
}
const grantForm = reactive(makeGrantForm());

const debouncedGrantSearch = refDebounced(computed(() => grantForm.spellSearch), 300);

const { data: grantSpellResultsRaw } = useQuery({
  queryKey: computed(() => ["grantSpellSearch", debouncedGrantSearch.value]),
  queryFn: async () => {
    const q = debouncedGrantSearch.value.trim();
    if (q.length < 2) return [] as Spell[];
    const { data, error } = await supabase
      .from("spells")
      .select("id, name, level, school, attack_type, save_attribute, concentration, ritual, damage_rolls, healing_dice")
      .ilike("name", `%${q}%`)
      .order("level").order("name")
      .limit(10);
    if (error) throw error;
    return data as Spell[];
  },
  enabled: computed(() => debouncedGrantSearch.value.length >= 2 && !grantForm.spell),
});
const grantSpellResults = computed(() => grantSpellResultsRaw.value ?? []);

function cancelAddGrant() {
  addingGrant.value = false;
  Object.assign(grantForm, makeGrantForm());
}

function confirmAddGrant() {
  if (!grantForm.isFreePick && !grantForm.spell) return;
  const grant: SpeciesSpellGrant = {
    spell_id: grantForm.isFreePick ? null : grantForm.spell!.id,
    spell_name: grantForm.isFreePick
      ? (grantForm.sourceLabel.trim() || "Player's choice")
      : grantForm.spell!.name,
    uses_per_day: grantForm.usesPerDay,
    resets_on: grantForm.usesPerDay !== null ? grantForm.resetsOn : null,
    min_level: grantForm.minLevel ?? 1,
    source_label: grantForm.sourceLabel.trim() || (grantForm.isFreePick ? "Player's choice" : grantForm.spell!.name),
    subrace: grantForm.subrace,
  };
  form.grantedSpells.push(grant);
  cancelAddGrant();
}

function removeGrant(i: number) {
  form.grantedSpells.splice(i, 1);
}

const form = reactive(makeForm(props.species));

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
      granted_spells: form.grantedSpells,
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
