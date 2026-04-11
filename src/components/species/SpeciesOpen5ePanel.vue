<template>
  <Transition name="fade">
    <div
      v-if="ui.speciesOpen5ePanelOpen"
      class="fixed inset-0 bg-black/60 z-40"
      @click="ui.speciesOpen5ePanelOpen = false"
    />
  </Transition>

  <Transition name="slide-right">
    <aside
      v-if="ui.speciesOpen5ePanelOpen"
      class="fixed right-0 top-0 bottom-0 w-full max-w-md bg-card border-l border-border z-50 flex flex-col"
    >
      <!-- Header -->
      <div class="flex items-center justify-between px-5 py-4 border-b border-border shrink-0">
        <h2 class="font-cinzel text-base font-semibold text-foreground">Import from Open5e</h2>
        <button class="text-muted-foreground hover:text-foreground" @click="ui.speciesOpen5ePanelOpen = false">
          <X class="h-5 w-5" />
        </button>
      </div>

      <!-- Seed core races -->
      <div class="px-5 py-3 border-b border-border shrink-0">
        <button
          type="button"
          :disabled="seeding || importing"
          class="w-full inline-flex items-center justify-center gap-2 rounded-md border border-border bg-muted px-3 py-2 font-cinzel text-xs font-semibold text-foreground tracking-wider hover:bg-accent disabled:opacity-50 transition-colors"
          @click="seedCoreRaces"
        >
          <LibraryBig class="h-3.5 w-3.5 shrink-0" />
          <span v-if="seeding">{{ seedProgress }}</span>
          <span v-else>Seed core PHB races ({{ CORE_RACE_SLUGS.length }})</span>
        </button>
      </div>

      <!-- Search -->
      <div class="px-5 py-3 border-b border-border shrink-0">
        <div class="relative">
          <Search class="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <input
            v-model="query"
            type="text"
            placeholder="Search races…"
            class="w-full bg-muted border border-border rounded-md pl-8 pr-3 py-1.5 font-fell text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
            @input="onSearch"
          />
        </div>
      </div>

      <!-- Results -->
      <div class="flex-1 overflow-y-auto">
        <div v-if="loading" class="flex justify-center py-8">
          <LoadingSpinner />
        </div>

        <p v-else-if="error" class="px-5 py-4 font-fell text-sm text-destructive italic">
          {{ error }}
        </p>

        <p v-else-if="results.length === 0 && query.trim()" class="px-5 py-4 font-fell text-sm text-muted-foreground italic">
          No results for "{{ query }}".
        </p>

        <p v-else-if="results.length === 0" class="px-5 py-4 font-fell text-sm text-muted-foreground italic">
          Type to search Open5e races.
        </p>

        <ul v-else class="divide-y divide-border">
          <li
            v-for="race in results"
            :key="race.slug"
            class="flex items-center justify-between gap-3 px-5 py-3 hover:bg-muted/50 cursor-pointer transition-colors"
            @click="importRace(race)"
          >
            <div class="min-w-0">
              <p class="font-cinzel text-sm font-semibold text-foreground truncate">{{ race.name }}</p>
              <p class="font-fell text-xs text-muted-foreground italic">{{ race.document__title ?? "—" }}</p>
            </div>
            <Download class="h-4 w-4 text-muted-foreground shrink-0" />
          </li>
        </ul>
      </div>

      <!-- Importing indicator -->
      <div
        v-if="importing"
        class="px-5 py-3 border-t border-border flex items-center gap-2 shrink-0"
      >
        <LoadingSpinner class="h-4 w-4" />
        <span class="font-fell text-sm text-muted-foreground italic">Importing…</span>
      </div>
    </aside>
  </Transition>
</template>

<script setup lang="ts">
import { ref, onUnmounted } from "vue";
import { useRouter } from "vue-router";
import { X, Search, Download, LibraryBig } from "lucide-vue-next";
import { useUiStore } from "@/stores/ui";
import { useCreateSpecies, useAllSpecies } from "@/composables/useSpecies";
import { toTiptapJson } from "@/ai/useNpcGeneration";
import LoadingSpinner from "@/components/common/LoadingSpinner.vue";
import type { SpeciesSize } from "@/types/species.types";

interface Open5eAsi {
  attributes: string[];
  value: number;
}

interface Open5eSubrace {
  name: string;
  desc: string;
  asi: Open5eAsi[];
  asi_desc: string;
  traits: string;
}

interface Open5eRace {
  slug: string;
  name: string;
  desc: string;
  asi: Open5eAsi[];
  asi_desc: string;
  age: string;
  alignment: string;
  size: string;
  size_raw: string;
  speed: string | Record<string, number>;
  speed_desc: string;
  languages: string;
  vision: string;
  traits: string;
  subraces: Open5eSubrace[];
  document__title: string;
  document__slug: string;
}

const CORE_RACE_SLUGS = [
  "dragonborn", "dwarf", "elf", "gnome",
  "half-elf", "half-orc", "halfling", "human", "tiefling",
] as const;

const ui = useUiStore();
const router = useRouter();
const { mutateAsync: createSpecies } = useCreateSpecies();
const { data: existingSpecies } = useAllSpecies();

const query = ref("");
const results = ref<Open5eRace[]>([]);
const loading = ref(false);
const error = ref("");
const importing = ref(false);
const seeding = ref(false);
const seedProgress = ref("");

let debounceTimer: ReturnType<typeof setTimeout> | undefined;

onUnmounted(() => clearTimeout(debounceTimer));

function onSearch() {
  clearTimeout(debounceTimer);
  debounceTimer = setTimeout(search, 350);
}

async function search() {
  const q = query.value.trim();
  if (!q) {
    results.value = [];
    return;
  }
  loading.value = true;
  error.value = "";
  try {
    const url = new URL("https://api.open5e.com/v1/races/");
    url.searchParams.set("search", q);
    url.searchParams.set("limit", "20");
    const res = await fetch(url.toString());
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = await res.json() as { results: Open5eRace[] };
    results.value = json.results;
  } catch (e) {
    error.value = e instanceof Error ? e.message : "Failed to fetch from Open5e.";
  } finally {
    loading.value = false;
  }
}

const VALID_SIZES: SpeciesSize[] = ["tiny", "small", "medium", "large"];

function parseSize(raw: string): SpeciesSize | null {
  const s = raw?.toLowerCase() as SpeciesSize;
  return VALID_SIZES.includes(s) ? s : null;
}

function parseSpeed(raw: string | Record<string, number> | undefined): Record<string, number> | null {
  if (!raw) return null;
  if (typeof raw === "object") return raw;
  // e.g. "30 ft., fly 30 ft."
  const result: Record<string, number> = {};
  const walkMatch = raw.match(/^(\d+)/);
  if (walkMatch) result.walk = parseInt(walkMatch[1]);
  const flyMatch = raw.match(/fly\s+(\d+)/i);
  if (flyMatch) result.fly = parseInt(flyMatch[1]);
  const swimMatch = raw.match(/swim\s+(\d+)/i);
  if (swimMatch) result.swim = parseInt(swimMatch[1]);
  const climbMatch = raw.match(/climb\s+(\d+)/i);
  if (climbMatch) result.climb = parseInt(climbMatch[1]);
  return Object.keys(result).length ? result : null;
}

function parseLanguages(raw: string | undefined): string[] {
  if (!raw) return [];
  // Strip leading markdown header e.g. "**_Languages._** "
  const cleaned = raw.replace(/^\*\*_[^_]+\._\*\*\s*/i, "");
  // Take only the first sentence (the one listing the language names)
  const firstSentence = cleaned.split(".")[0];
  // Strip "You can speak, read, and write " / "You speak " preamble
  const stripped = firstSentence.replace(/^you (?:can )?(?:speak(?:,? read(?:,? and write)?)?\s+)/i, "");
  return stripped
    .split(/,\s*|\s+and\s+/)
    .map((l) => l.trim())
    .filter(Boolean);
}

function parseTags(race: Open5eRace): string[] {
  const tags: string[] = ["humanoid"];
  if (race.size_raw) tags.push(race.size_raw.toLowerCase());
  // Add the race's own name as a tag (e.g. "elf", "dwarf", "half-elf")
  const nameTag = race.name.toLowerCase().replace(/\s+/g, "-");
  if (!tags.includes(nameTag)) tags.push(nameTag);
  return tags;
}

/** Convert [{attributes:["Dexterity"],value:2}] → "+2 Dexterity, +1 Intelligence" */
function parseAsi(asi: Open5eAsi[] | undefined): Record<string, number | string> | null {
  if (!asi?.length) return null;
  const entries: Record<string, number> = {};
  for (const a of asi) {
    for (const attr of a.attributes) {
      entries[attr.toLowerCase().slice(0, 3)] = a.value;
    }
  }
  return entries;
}

/**
 * Splits an Open5e traits string (blocks separated by \n\n, each starting with
 * **_Name._** description…) into [{name, description}] pairs.
 */
function parseTraits(raw: string | undefined): Array<{ name: string; description: string }> {
  if (!raw?.trim()) return [];
  return raw
    .split(/\n\n+/)
    .map((block) => {
      const match = block.match(/^\*\*_(.+?)\._\*\*\s*([\s\S]*)/);
      if (match) {
        return { name: match[1].trim(), description: match[2].trim() };
      }
      return { name: "Trait", description: block.trim() };
    })
    .filter((t) => t.description);
}

async function seedCoreRaces() {
  seeding.value = true;
  error.value = "";
  const existing = new Set(
    (existingSpecies.value ?? []).map((s) => s.name.toLowerCase()),
  );
  let done = 0;
  for (const slug of CORE_RACE_SLUGS) {
    seedProgress.value = `${done} / ${CORE_RACE_SLUGS.length}…`;
    try {
      const res = await fetch(`https://api.open5e.com/v1/races/${slug}/?format=json`);
      if (!res.ok) continue;
      const race = await res.json() as Open5eRace;
      if (existing.has(race.name.toLowerCase())) { done++; continue; }
      await buildAndCreate(race);
    } catch {
      // skip failed entries silently
    }
    done++;
  }
  seeding.value = false;
  seedProgress.value = "";
  ui.speciesOpen5ePanelOpen = false;
}

async function buildAndCreate(race: Open5eRace) {
  return createSpecies({
    name: race.name,
    description: race.desc ? toTiptapJson(race.desc) : null,
    notes: null,
    size: parseSize(race.size_raw ?? race.size),
    speed: parseSpeed(race.speed),
    ability_score_increases: parseAsi(race.asi),
    traits: parseTraits(race.traits),
    languages: parseLanguages(race.languages),
    tags: parseTags(race),
    source: race.document__title ?? null,
    subraces: race.subraces?.length
      ? race.subraces.map((sr) => ({
          name: sr.name,
          description: sr.desc ?? "",
          traits: parseTraits(sr.traits),
        }))
      : null,
    image_url: null,
    focal_point: null,
  });
}

async function importRace(race: Open5eRace) {
  importing.value = true;
  try {
    const created = await buildAndCreate(race);
    ui.speciesOpen5ePanelOpen = false;
    router.push(`/species/${created.id}?edit=true`);
  } catch (e) {
    error.value = e instanceof Error ? e.message : "Import failed.";
  } finally {
    importing.value = false;
  }
}
</script>

<style scoped>
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.2s ease;
}
.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
.slide-right-enter-active,
.slide-right-leave-active {
  transition: transform 0.25s ease;
}
.slide-right-enter-from,
.slide-right-leave-to {
  transform: translateX(100%);
}
</style>
