<template>
  <Transition name="fade">
    <div
      v-if="ui.spellGeneratorOpen"
      class="fixed inset-0 bg-black/60 z-40"
      @click="ui.spellGeneratorOpen = false"
    />
  </Transition>

  <Transition name="slide-right">
    <aside
      v-if="ui.spellGeneratorOpen"
      class="fixed right-0 top-0 bottom-0 w-full max-w-md bg-card border-l border-border z-50 flex flex-col"
    >
      <!-- Header -->
      <div class="flex items-center justify-between px-5 py-4 border-b border-border shrink-0">
        <h2 class="font-cinzel text-base font-semibold text-foreground">Spell Generator</h2>
        <button class="text-muted-foreground hover:text-foreground" @click="ui.spellGeneratorOpen = false">
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
            placeholder="A storm of luminous moths that swarm a target, biting and dazzling them with flashes of bioluminescence…"
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

          <div class="grid grid-cols-2 gap-2">
            <div>
              <label class="block font-fell text-xs text-muted-foreground mb-1">Level</label>
              <select
                v-model="constraints.level"
                class="w-full bg-muted border border-border rounded-md px-3 py-1.5 font-fell text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
              >
                <option value="">Any</option>
                <option value="0">Cantrip</option>
                <option v-for="n in 9" :key="n" :value="String(n)">{{ n }}{{ levelSuffix(n) }}</option>
              </select>
            </div>
            <div>
              <label class="block font-fell text-xs text-muted-foreground mb-1">School</label>
              <select
                v-model="constraints.school"
                class="w-full bg-muted border border-border rounded-md px-3 py-1.5 font-fell text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring capitalize"
              >
                <option value="">Any</option>
                <option v-for="s in SPELL_SCHOOLS" :key="s" :value="s" class="capitalize">{{ s }}</option>
              </select>
            </div>
          </div>
        </div>

        <!-- Image generation toggle -->
        <div v-if="aiApiKey" class="flex items-center justify-between">
          <span class="font-fell text-xs text-muted-foreground">Generate spell-effect art</span>
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
              @click="ui.spellGeneratorOpen = false"
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
            @click="ui.spellGeneratorOpen = false"
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
          to="/spells/new"
          class="w-full inline-flex items-center justify-center py-2 font-cinzel text-xs font-semibold tracking-wider rounded-md hover:opacity-90 transition-opacity"
          :class="aiApiKey ? 'border border-border bg-card text-foreground hover:bg-muted' : 'bg-primary text-primary-foreground'"
          @click="ui.spellGeneratorOpen = false"
        >
          New Blank Spell
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
import { useCreateSpell } from "@/composables/useSpells";
import { useSpellGeneration } from "@/ai/useSpellGeneration";
import { currentLoadingQuote } from "@/ai/aiGenerationState";
import { isAnyAiGenerating } from "@/ai/aiGeneratorRegistry";
import { spellInsertFromAi } from "@/ai/spellAiAdapter";
import { SPELL_SCHOOLS, type SpellSchool } from "@/types/spell.types";

const ui = useUiStore();
const router = useRouter();
const campaign = useCampaignStore();
const { mutateAsync: createSpell } = useCreateSpell();
const {
  isGenerating,
  error: genError,
  completedEntityId,
  concept: genConcept,
  clearCompleted,
  generate,
} = useSpellGeneration();

const aiApiKey = computed(() => campaign.decryptedApiKey);

const concept = ref("");
const constraints = reactive<{ level: string; school: "" | SpellSchool }>({
  level: "",
  school: "",
});
const generateImage = ref(true);

function levelSuffix(n: number): string {
  if (n === 1) return "st";
  if (n === 2) return "nd";
  if (n === 3) return "rd";
  return "th";
}

async function generateAndCreate() {
  genConcept.value = concept.value.trim();
  clearCompleted();

  const result = await generate(concept.value.trim(), {
    level: constraints.level === "" ? undefined : Number(constraints.level),
    school: constraints.school || undefined,
    generateImage: generateImage.value,
  });
  if (!result) return;

  const created = await createSpell(spellInsertFromAi(result));

  if (ui.spellGeneratorOpen) {
    ui.spellGeneratorOpen = false;
    router.push(`/spells/${created.id}`);
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
