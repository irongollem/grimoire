<template>
  <Transition name="fade">
    <div
      v-if="ui.monsterGeneratorOpen"
      class="fixed inset-0 bg-black/60 z-40"
      @click="ui.monsterGeneratorOpen = false"
    />
  </Transition>

  <Transition name="slide-right">
    <aside
      v-if="ui.monsterGeneratorOpen"
      class="fixed right-0 top-0 bottom-0 w-full max-w-md bg-card border-l border-border z-50 flex flex-col"
    >
      <!-- Header -->
      <div class="flex items-center justify-between px-5 py-4 border-b border-border shrink-0">
        <h2 class="font-cinzel text-base font-semibold text-foreground">Monster Generator</h2>
        <button class="text-muted-foreground hover:text-foreground" @click="ui.monsterGeneratorOpen = false">
          <X class="h-5 w-5" />
        </button>
      </div>

      <!-- Body -->
      <div class="flex-1 overflow-y-auto p-5 space-y-5">
        <!-- Concept -->
        <div>
          <label class="block font-cinzel text-xs font-semibold tracking-wider text-muted-foreground mb-1.5">
            CONCEPT
            <span class="font-fell normal-case tracking-normal text-muted-foreground/60 ml-1">(AI will use this)</span>
          </label>
          <textarea
            v-model="concept"
            rows="4"
            placeholder="A colossal spider deity that dwells in the Underdark, commanding its cultists through webs of illusion and dreams…"
            class="w-full bg-muted border border-border rounded-md px-3 py-2 font-fell text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring resize-none"
          />
        </div>

        <div class="gold-divider" />

        <!-- Constraints -->
        <div class="space-y-3">
          <p class="font-cinzel text-xs font-semibold tracking-wider text-muted-foreground">
            CONSTRAINTS
            <span class="font-fell normal-case tracking-normal text-muted-foreground/60 ml-1">(optional)</span>
          </p>

          <div>
            <label class="block font-fell text-xs text-muted-foreground mb-1">Challenge Rating</label>
            <input
              v-model="constraints.challenge_rating"
              placeholder="e.g. 5, 1/2, 1/4"
              class="w-full bg-muted border border-border rounded-md px-3 py-1.5 font-fell text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
            />
          </div>

          <div class="grid grid-cols-2 gap-2">
            <div>
              <label class="block font-fell text-xs text-muted-foreground mb-1">Monster Type</label>
              <select
                v-model="constraints.monster_type"
                class="w-full bg-muted border border-border rounded-md px-3 py-1.5 font-fell text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
              >
                <option value="">Any</option>
                <option v-for="t in MONSTER_TYPES" :key="t" :value="t" class="capitalize">{{ t }}</option>
              </select>
            </div>
            <div>
              <label class="block font-fell text-xs text-muted-foreground mb-1">Size</label>
              <select
                v-model="constraints.size"
                class="w-full bg-muted border border-border rounded-md px-3 py-1.5 font-fell text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
              >
                <option value="">Any</option>
                <option v-for="s in SIZES" :key="s" :value="s" class="capitalize">{{ s }}</option>
              </select>
            </div>
          </div>
        </div>

        <!-- Image generation toggle -->
        <div v-if="aiApiKey" class="flex items-center justify-between">
          <span class="font-fell text-xs text-muted-foreground">Generate portrait art</span>
          <button
            type="button"
            class="relative inline-flex h-5 w-9 items-center rounded-full transition-colors focus:outline-none"
            :class="generateImage ? 'bg-primary' : 'bg-muted border border-border'"
            @click="generateImage = !generateImage"
          >
            <span
              class="inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform shadow-sm"
              :class="generateImage ? 'translate-x-4.5' : 'translate-x-0.5'"
            />
          </button>
        </div>

        <!-- No API key nudge -->
        <div v-if="!aiApiKey" class="rounded-md border border-border bg-muted/40 p-3">
          <p class="font-fell text-xs text-muted-foreground italic">
            Add an OpenAI key in
            <RouterLink
              to="/campaign/settings"
              class="text-primary hover:underline"
              @click="ui.monsterGeneratorOpen = false"
            >
              Campaign Settings → AI Assistant
            </RouterLink>
            to unlock AI generation.
          </p>
        </div>

        <!-- Generating state -->
        <div v-else-if="isGenerating" class="flex flex-col items-center gap-3 py-4">
          <Sparkles class="h-7 w-7 text-primary animate-pulse" />
          <p class="font-fell text-sm text-muted-foreground italic text-center">{{ currentLoadingQuote }}</p>
          <button
            type="button"
            class="mt-1 font-fell text-xs text-muted-foreground hover:text-foreground underline underline-offset-2 transition-colors"
            @click="ui.monsterGeneratorOpen = false"
          >
            Continue in background
          </button>
        </div>

        <!-- Error -->
        <div
          v-else-if="genError"
          class="rounded-md bg-destructive/10 border border-destructive/30 px-3 py-2"
        >
          <p class="font-fell text-xs text-destructive">{{ genError }}</p>
        </div>
      </div>

      <!-- Footer -->
      <div class="px-5 py-4 border-t border-border flex flex-col gap-2 shrink-0">
        <button
          v-if="aiApiKey"
          type="button"
          :disabled="isAnyAiGenerating || !concept.trim()"
          :title="isAnyAiGenerating && !isGenerating ? 'Another generation is already in progress' : undefined"
          class="w-full inline-flex items-center justify-center gap-1.5 py-2 font-cinzel text-xs font-semibold tracking-wider rounded-md bg-primary text-primary-foreground hover:opacity-90 disabled:opacity-50 transition-opacity"
          @click="generateAndCreate"
        >
          <Sparkles class="h-3.5 w-3.5" />
          {{ isGenerating ? "Generating…" : "Generate with AI" }}
        </button>
        <RouterLink
          to="/monsters/new"
          class="w-full inline-flex items-center justify-center py-2 font-cinzel text-xs font-semibold tracking-wider rounded-md hover:opacity-90 transition-opacity"
          :class="aiApiKey ? 'border border-border bg-card text-foreground hover:bg-muted' : 'bg-primary text-primary-foreground'"
          @click="ui.monsterGeneratorOpen = false"
        >
          New Blank Monster
        </RouterLink>
      </div>
    </aside>
  </Transition>
</template>

<script setup lang="ts">
import { ref, reactive, computed } from "vue";
import { useRouter, RouterLink } from "vue-router";
import { X, Sparkles } from "lucide-vue-next";
import { useUiStore } from "@/stores/ui";
import { useCampaignStore } from "@/stores/campaign";
import { useCreateMonster } from "@/composables/useMonsters";
import { useMonsterGeneration } from "@/ai/useMonsterGeneration";
import { toTiptapJson } from "@/ai/useNpcGeneration";
import { currentLoadingQuote } from "@/ai/aiGenerationState";
import { isAnyAiGenerating } from "@/ai/aiGeneratorRegistry";
import type { MonsterType, MonsterSize } from "@/types/monster.types";

const MONSTER_TYPES: MonsterType[] = [
  "aberration", "beast", "celestial", "construct", "dragon", "elemental",
  "fey", "fiend", "giant", "humanoid", "monstrosity", "ooze", "plant", "undead",
];
const SIZES: MonsterSize[] = ["tiny", "small", "medium", "large", "huge", "gargantuan"];

const ui = useUiStore();
const router = useRouter();
const campaign = useCampaignStore();
const { mutateAsync: createMonster } = useCreateMonster();
const { isGenerating, error: genError, completedEntityId, concept: genConcept, clearCompleted, generate } = useMonsterGeneration();

const aiApiKey = computed(() => campaign.decryptedApiKey);

const concept = ref("");
const constraints = reactive({ challenge_rating: "", monster_type: "", size: "" });
const generateImage = ref(true);

async function generateAndCreate() {
  genConcept.value = concept.value.trim();
  clearCompleted();

  const result = await generate(
    concept.value.trim(),
    {
      challenge_rating: constraints.challenge_rating.trim() || undefined,
      monster_type: constraints.monster_type || undefined,
      size: constraints.size || undefined,
      generateImage: generateImage.value,
    },
  );
  if (!result) return;

  const created = await createMonster({
    name: result.name,
    monster_type: result.monster_type,
    size: result.size,
    alignment: (result.alignment || "unaligned").toLowerCase(),
    habitat: result.habitat || null,
    source: "Grimoire:AI",
    tags: result.tags ?? [],
    description: result.description ? toTiptapJson(result.description) : null,
    notes: result.notes ? toTiptapJson(result.notes) : null,
    image_url: result.image_url ?? null,
    portrait_focal_point: null,
    stat_block: result.stat_block,
  });

  if (ui.monsterGeneratorOpen) {
    ui.monsterGeneratorOpen = false;
    router.push(`/monsters/${created.id}`);
  } else {
    completedEntityId.value = created.id;
  }
}

</script>

<style scoped>
.gold-divider {
  border-top: 1px solid color-mix(in srgb, var(--color-primary) 30%, transparent);
}
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
