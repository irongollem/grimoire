<template>
  <Transition name="fade">
    <div
      v-if="ui.npcGeneratorOpen"
      class="fixed inset-0 bg-black/60 z-40"
      @click="ui.npcGeneratorOpen = false"
    />
  </Transition>

  <Transition name="slide-right">
    <aside
      v-if="ui.npcGeneratorOpen"
      class="fixed right-0 top-0 bottom-0 w-full max-w-md bg-card border-l border-border z-50 flex flex-col"
    >
      <!-- Header -->
      <div
        class="flex items-center justify-between px-5 py-4 border-b border-border shrink-0"
      >
        <h2 class="font-cinzel text-base font-semibold text-foreground">
          NPC Generator
        </h2>
        <button
          class="text-muted-foreground hover:text-foreground"
          @click="ui.npcGeneratorOpen = false"
        >
          <X class="h-5 w-5" />
        </button>
      </div>

      <!-- Body -->
      <div class="flex-1 overflow-y-auto p-5 space-y-5">
        <!-- Concept -->
        <div>
          <label
            class="block font-cinzel text-xs font-semibold tracking-wider text-muted-foreground mb-1.5"
          >
            CONCEPT
            <span
              class="font-fell normal-case tracking-normal text-muted-foreground/60 ml-1"
              >(AI will use this)</span
            >
          </label>
          <textarea
            v-model="concept"
            rows="3"
            placeholder="A mysterious tiefling bard who works as a city informant and hides a dark past…"
            class="w-full bg-muted border border-border rounded-md px-3 py-2 font-fell text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring resize-none"
          />
        </div>

        <div class="gold-divider" />

        <!-- Quick options -->
        <div class="space-y-3">
          <p
            class="font-cinzel text-xs font-semibold tracking-wider text-muted-foreground"
          >
            QUICK OPTIONS
          </p>

          <div>
            <label class="block font-fell text-xs text-muted-foreground mb-1"
              >Name</label
            >
            <input
              v-model="quickForm.name"
              placeholder="Leave blank to auto-generate"
              class="w-full bg-muted border border-border rounded-md px-3 py-1.5 font-fell text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
            />
          </div>

          <div>
            <label class="block font-fell text-xs text-muted-foreground mb-1"
              >Race</label
            >
            <select
              v-model="quickForm.race"
              class="w-full bg-muted border border-border rounded-md px-3 py-1.5 font-fell text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
            >
              <option value="">Any</option>
              <option v-for="r in RACES" :key="r" :value="r">{{ r }}</option>
            </select>
          </div>

          <div class="grid grid-cols-2 gap-2">
            <div>
              <label class="block font-fell text-xs text-muted-foreground mb-1"
                >Alignment</label
              >
              <select
                v-model="quickForm.alignment"
                class="w-full bg-muted border border-border rounded-md px-3 py-1.5 font-fell text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
              >
                <option value="">Any</option>
                <option v-for="a in ALIGNMENTS" :key="a" :value="a">
                  {{ a }}
                </option>
              </select>
            </div>
            <div>
              <label class="block font-fell text-xs text-muted-foreground mb-1"
                >Relationship</label
              >
              <select
                v-model="quickForm.relationship"
                class="w-full bg-muted border border-border rounded-md px-3 py-1.5 font-fell text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
              >
                <option value="neutral">Neutral</option>
                <option value="ally">Ally</option>
                <option value="enemy">Enemy</option>
                <option value="unknown">Unknown</option>
              </select>
            </div>
          </div>

          <div>
            <label class="block font-fell text-xs text-muted-foreground mb-1"
              >Stat block template</label
            >
            <select
              v-model="quickForm.templateId"
              class="w-full bg-muted border border-border rounded-md px-3 py-1.5 font-fell text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
            >
              <option value="">None</option>
              <optgroup
                v-for="cat in templateCategories"
                :key="cat"
                :label="cat"
              >
                <option
                  v-for="t in templatesByCategory(cat)"
                  :key="t.id"
                  :value="t.id"
                >
                  {{ t.name }} (CR {{ t.stat_block.challenge_rating }})
                </option>
              </optgroup>
            </select>
          </div>
        </div>

        <!-- No API key nudge -->
        <div v-if="!aiApiKey" class="rounded-md border border-border bg-muted/40 p-3">
          <p class="font-fell text-xs text-muted-foreground italic">
            Add an OpenAI key in
            <button type="button" class="text-primary hover:underline" @click="openAiSettings">Campaign Settings → AI Assistant</button>
            to unlock AI generation.
          </p>
        </div>

        <!-- Generating state -->
        <div v-else-if="isGenerating" class="flex flex-col items-center gap-3 py-4">
          <Sparkles class="h-7 w-7 text-primary animate-pulse" />
          <p class="font-fell text-sm text-muted-foreground italic">{{ statusText }}</p>
        </div>

        <!-- Error -->
        <div v-else-if="genError" class="rounded-md bg-destructive/10 border border-destructive/30 px-3 py-2">
          <p class="font-fell text-xs text-destructive">{{ genError }}</p>
        </div>
      </div>

      <!-- Footer -->
      <div
        class="px-5 py-4 border-t border-border flex flex-col gap-2 shrink-0"
      >
        <button
          v-if="aiApiKey"
          type="button"
          :disabled="isGenerating || !concept.trim()"
          class="w-full inline-flex items-center justify-center gap-1.5 py-2 font-cinzel text-xs font-semibold tracking-wider rounded-md bg-primary text-primary-foreground hover:opacity-90 disabled:opacity-50 transition-opacity"
          @click="generateAndCreate"
        >
          <Sparkles class="h-3.5 w-3.5" />
          {{ isGenerating ? 'Generating…' : 'Generate with AI' }}
        </button>
        <button
          type="button"
          :disabled="isCreating"
          class="w-full py-2 font-cinzel text-xs font-semibold tracking-wider bg-primary text-primary-foreground rounded-md hover:opacity-90 disabled:opacity-50 transition-opacity"
          @click="quickCreate"
        >
          {{ isCreating ? "Creating…" : "Quick Create NPC" }}
        </button>
      </div>
    </aside>
  </Transition>
</template>

<script setup lang="ts">
import { ref, reactive, computed } from "vue";
import { useRouter } from "vue-router";
import { X, Sparkles } from "lucide-vue-next";
import { useUiStore } from "@/stores/ui";
import { useCreateNpc } from "@/composables/useNpcs";
import {
  NPC_TEMPLATES,
  NPC_TEMPLATE_CATEGORIES,
  getNpcTemplate,
} from "@/data/npcTemplates";
import type { NpcInsert, NpcRelationship } from "@/types/npc.types";
import { useCampaignStore } from "@/stores/campaign";
import { useNpcGeneration, toTiptapJson } from "@/ai/useNpcGeneration";

const RACES = [
  "Human",
  "Elf",
  "Half-Elf",
  "Dwarf",
  "Halfling",
  "Gnome",
  "Half-Orc",
  "Tiefling",
  "Dragonborn",
  "Aasimar",
  "Tabaxi",
  "Kenku",
  "Firbolg",
  "Goliath",
  "Triton",
];
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
];

const FIRST_NAMES = [
  "Aldric",
  "Mira",
  "Theron",
  "Selja",
  "Corvus",
  "Lysa",
  "Dain",
  "Vex",
  "Orin",
  "Nessa",
  "Balthus",
  "Kira",
  "Fenris",
  "Yara",
  "Cael",
];
const LAST_NAMES = [
  "Stone",
  "Ashvale",
  "Brightwater",
  "Darkwood",
  "Ironside",
  "Swiftarrow",
  "Flamecrest",
  "Coldbrook",
  "Thornwall",
  "Duskmantle",
];

function randomName(): string {
  const first = FIRST_NAMES[Math.floor(Math.random() * FIRST_NAMES.length)];
  const last = LAST_NAMES[Math.floor(Math.random() * LAST_NAMES.length)];
  return `${first} ${last}`;
}

const ui = useUiStore();
const router = useRouter();
const { mutateAsync: createNpc, isPending: isCreating } = useCreateNpc();
const campaign = useCampaignStore();
const { isGenerating, error: genError, phase, generate } = useNpcGeneration();

const aiApiKey = computed(() => campaign.decryptedApiKey);
const aiSettingPrompt = computed(() => campaign.activeCampaign?.ai_setting_prompt ?? "");

const STATUS_MESSAGES: Record<string, string> = {
  text:   "Conjuring character details…",
  image:  "Painting the portrait…",
  upload: "Storing the portrait…",
};
const statusText = computed(() => STATUS_MESSAGES[phase.value] ?? "Working…");

function openAiSettings() {
  ui.npcGeneratorOpen = false;
  // The campaign switcher modal has no programmatic open — user nudge is enough
}

function buildAiPrompt(): string {
  const lines = [concept.value.trim()];
  const constraints: string[] = [];
  if (quickForm.name.trim())  constraints.push(`Name: ${quickForm.name.trim()}`);
  if (quickForm.race)         constraints.push(`Race: ${quickForm.race}`);
  if (quickForm.alignment)    constraints.push(`Alignment: ${quickForm.alignment}`);
  if (quickForm.relationship) constraints.push(`Party relationship: ${quickForm.relationship}`);
  if (constraints.length) {
    lines.push("\nUse these constraints (override only if the concept explicitly conflicts):");
    lines.push(constraints.join("\n"));
  }
  return lines.join("\n");
}

async function generateAndCreate() {
  const result = await generate(aiApiKey.value, aiSettingPrompt.value, buildAiPrompt());
  if (!result) return;

  const tpl = quickForm.templateId ? getNpcTemplate(quickForm.templateId) : null;

  const payload: NpcInsert = {
    name:              quickForm.name.trim() || result.name,
    campaign_id:       campaign.activeCampaignId,
    race:              quickForm.race || result.race || null,
    alignment:         quickForm.alignment || result.alignment || null,
    age:               result.age || null,
    occupation:        result.occupation || null,
    appearance:        result.appearance  ? toTiptapJson(result.appearance)  : null,
    personality:       result.personality ? toTiptapJson(result.personality) : null,
    backstory:         result.backstory   ? toTiptapJson(result.backstory)   : null,
    notes:             result.notes       ? toTiptapJson(result.notes)       : null,
    status:            result.status,
    relationship:      quickForm.relationship || result.relationship,
    portrait_url:      result.portrait_url ?? null,
    card_art_url:      null,
    portrait_focal_point: null,
    tags:              result.tags ?? [],
    stat_block:        tpl?.stat_block ?? null,
    scriptorium_doc_id: null,
    shared_with_players: false,
    player_visible_fields: [],
  };

  const created = await createNpc(payload);
  ui.npcGeneratorOpen = false;
  router.push(`/npcs/${created.id}`);
}

const concept = ref("");
const quickForm = reactive({
  name: "",
  race: "",
  alignment: "",
  relationship: "neutral" as NpcRelationship,
  templateId: "",
});

const templateCategories = computed(() => NPC_TEMPLATE_CATEGORIES);
function templatesByCategory(cat: string) {
  return NPC_TEMPLATES.filter((t) => t.category === cat);
}

async function quickCreate() {
  const tpl = quickForm.templateId
    ? getNpcTemplate(quickForm.templateId)
    : null;
  const name = quickForm.name.trim() || randomName();

  const payload: NpcInsert = {
    name,
    campaign_id: campaign.activeCampaignId,
    race: quickForm.race || null,
    alignment: quickForm.alignment || null,
    age: null,
    occupation: null,
    appearance: null,
    personality: null,
    backstory: null,
    notes: concept.value.trim() || null,
    status: "alive",
    relationship: quickForm.relationship,
    portrait_url: null,
    card_art_url: null,
    tags: [],
    stat_block: tpl?.stat_block ?? null,
    scriptorium_doc_id: null,
    shared_with_players: false,
    player_visible_fields: [],
  };

  const created = await createNpc(payload);
  ui.npcGeneratorOpen = false;
  router.push(`/npcs/${created.id}`);
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
