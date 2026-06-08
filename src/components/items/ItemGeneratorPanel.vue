<template>
  <Transition name="fade">
    <div
      v-if="ui.itemGeneratorOpen"
      class="fixed inset-0 bg-black/60 z-40"
      @click="ui.itemGeneratorOpen = false"
    />
  </Transition>

  <Transition name="slide-right">
    <aside
      v-if="ui.itemGeneratorOpen"
      class="fixed right-0 top-0 bottom-0 w-full max-w-md bg-card border-l border-border z-50 flex flex-col"
    >
      <!-- Header -->
      <div
        class="flex items-center justify-between px-5 py-4 border-b border-border shrink-0"
      >
        <h2 class="font-cinzel text-base font-semibold text-foreground">
          Item Generator
        </h2>
        <button
          class="text-muted-foreground hover:text-foreground"
          @click="ui.itemGeneratorOpen = false"
        >
          <IconClose class="h-5 w-5" />
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
            rows="4"
            :maxlength="CONCEPT_LIMIT"
            placeholder="A staff carved from petrified dragon bone, crackling with lightning and able to call storms when wielded by a chosen champion…"
            class="w-full bg-muted border border-border rounded-md px-3 py-2 font-fell text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring resize-none"
          />
          <div class="flex justify-end mt-1">
            <span
              class="font-fell text-xs"
              :class="concept.length >= CONCEPT_LIMIT * 0.9 ? 'text-destructive' : 'text-muted-foreground/50'"
            >{{ concept.length }} / {{ CONCEPT_LIMIT }}</span>
          </div>
        </div>

        <div class="gold-divider" />

        <!-- Constraints -->
        <div class="space-y-3">
          <p
            class="font-cinzel text-xs font-semibold tracking-wider text-muted-foreground"
          >
            CONSTRAINTS
            <span
              class="font-fell normal-case tracking-normal text-muted-foreground/60 ml-1"
              >(optional)</span
            >
          </p>

          <div class="grid grid-cols-2 gap-2">
            <div>
              <label class="block font-fell text-xs text-muted-foreground mb-1"
                >Item Type</label
              >
              <select
                v-model="constraints.item_type"
                class="w-full bg-muted border border-border rounded-md px-3 py-1.5 font-fell text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
              >
                <option value="">Any</option>
                <option v-for="t in ITEM_TYPES" :key="t" :value="t">
                  {{ ITEM_TYPE_LABELS[t] }}
                </option>
              </select>
            </div>
            <div>
              <label class="block font-fell text-xs text-muted-foreground mb-1"
                >Rarity</label
              >
              <select
                v-model="constraints.rarity"
                class="w-full bg-muted border border-border rounded-md px-3 py-1.5 font-fell text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
              >
                <option value="">Any</option>
                <option v-for="r in ITEM_RARITIES" :key="r" :value="r">
                  {{ ITEM_RARITY_LABELS[r] }}
                </option>
              </select>
            </div>
          </div>
        </div>

        <!-- Toggles -->
        <div v-if="isAiEnabled" class="space-y-2">
          <div class="flex items-center justify-between">
            <span class="font-fell text-xs text-muted-foreground">Generate item art</span>
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
          <div class="flex items-center justify-between">
            <span class="font-fell text-xs text-muted-foreground">Make it cursed <span class="text-muted-foreground/50">(AI chooses the curse)</span></span>
            <button
              type="button"
              class="relative inline-flex h-5 w-9 items-center rounded-full transition-colors focus:outline-none"
              :class="generateCursed ? 'bg-destructive' : 'bg-muted border border-border'"
              @click="generateCursed = !generateCursed"
            >
              <span
                class="inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform shadow-sm"
                :class="generateCursed ? 'translate-x-4.5' : 'translate-x-0.5'"
              />
            </button>
          </div>
        </div>

        <!-- Generating state -->
        <div
          v-else-if="isGenerating"
          class="flex flex-col items-center gap-3 py-4"
        >
          <IconGenerate class="h-7 w-7 text-primary animate-pulse" />
          <p class="font-fell text-sm text-muted-foreground italic text-center">
            {{ currentLoadingQuote }}
          </p>
          <button
            type="button"
            class="mt-1 font-fell text-xs text-muted-foreground hover:text-foreground underline underline-offset-2 transition-colors"
            @click="ui.itemGeneratorOpen = false"
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
      <div
        class="px-5 py-4 border-t border-border flex flex-col gap-2 shrink-0"
      >
        <GenerationCostBadge
          v-if="isPro && isAiEnabled"
          :credits="textCreditCost"
          :byok="textIsByok"
          class="self-center"
        />
        <button
          v-if="isPro && isAiEnabled"
          type="button"
          :disabled="isAnyAiGenerating || !concept.trim()"
          :title="isAnyAiGenerating && !isGenerating ? 'Another generation is already in progress' : undefined"
          class="w-full inline-flex items-center justify-center gap-1.5 py-2 font-cinzel text-xs font-semibold tracking-wider rounded-md bg-primary text-primary-foreground hover:opacity-90 disabled:opacity-50 transition-opacity"
          @click="generateAndCreate"
        >
          <IconGenerate class="h-3.5 w-3.5" />
          {{ isGenerating ? "Generating…" : "Generate with AI" }}
        </button>
        <button
          v-else-if="!isPro"
          type="button"
          class="w-full inline-flex items-center justify-center gap-1.5 py-2 font-cinzel text-xs font-semibold tracking-wider rounded-md bg-primary text-primary-foreground hover:opacity-90 transition-opacity"
          @click="showPaywall = true"
        >
          <IconGenerate class="h-3.5 w-3.5" />
          Generate with AI
        </button>
        <RouterLink
          to="/vault/new"
          :class="isPro && !aiApiKey ? 'bg-primary text-primary-foreground' : 'border border-border bg-card text-foreground hover:bg-muted'"
          class="w-full inline-flex items-center justify-center py-2 font-cinzel text-xs font-semibold tracking-wider rounded-md hover:opacity-90 transition-opacity"
          @click="ui.itemGeneratorOpen = false"
        >
          New Blank Item
        </RouterLink>
      </div>
    </aside>
  </Transition>
  <PaywallModal v-model="showPaywall" message="AI generation is a Pro feature. Upgrade to generate items, NPCs, monsters, spells, puzzles, and session artwork." />
</template>

<script setup lang="ts">
import { ref, reactive, computed } from "vue";
import { AI_PROMPT_LIMIT } from "@/ai/utils";

const CONCEPT_LIMIT = AI_PROMPT_LIMIT;
import { useRouter, RouterLink } from "vue-router";
import { IconClose, IconGenerate } from '@/lib/icons';
import { useUiStore } from "@/stores/ui";
import { useCampaignStore } from "@/stores/campaign";
import { useCreateItem } from "@/composables/useItems";
import { useSubscription } from "@/composables/useSubscription";
import PaywallModal from "@/components/common/PaywallModal.vue";
import GenerationCostBadge from "@/components/common/GenerationCostBadge.vue";
import { useAiCredits } from "@/composables/useAiCredits";
import { useProviderConfig } from "@/composables/useProviderConfig";
import { useItemGeneration } from "@/ai/useItemGeneration";
import { toTiptapJson } from "@/ai/useNpcGeneration";
import { currentLoadingQuote } from "@/ai/aiGenerationState";
import { isAnyAiGenerating } from "@/ai/aiGeneratorRegistry";
import {
  ITEM_TYPES,
  ITEM_TYPE_LABELS,
  ITEM_RARITIES,
  ITEM_RARITY_LABELS,
} from "@/types/item.types";

const ui = useUiStore();
const router = useRouter();
const campaign = useCampaignStore();
const { mutateAsync: createItem } = useCreateItem();
const { isGenerating, error: genError, completedEntityId, concept: genConcept, clearCompleted, generate } = useItemGeneration();

const aiApiKey = computed(() => campaign.decryptedApiKey);
const isAiEnabled = computed(() => campaign.isAiEnabled);
const { isPro } = useSubscription();
const showPaywall = ref(false);

const { costOf } = useAiCredits();
const { textMultiplierFor } = useProviderConfig();
const textProvider = computed(() => campaign.activeCampaign?.text_provider ?? "openai");
const textIsByok = computed(() => !!campaign.decryptedApiKey);
const textCreditCost = computed(
  () => Math.round(costOf("item_generation") * textMultiplierFor(textProvider.value) * 100) / 100,
);

const concept = ref("");
const constraints = reactive({ item_type: "", rarity: "" });
const generateImage = ref(true);
const generateCursed = ref(false);

async function generateAndCreate() {
  genConcept.value = concept.value.trim();
  clearCompleted();

  const result = await generate(
    concept.value.trim(),
    {
      item_type: constraints.item_type || undefined,
      rarity: constraints.rarity || undefined,
      cursed: generateCursed.value || undefined,
      generateImage: generateImage.value,
    },
  );
  if (!result) return;

  const created = await createItem({
    name: result.name,
    item_type: result.item_type,
    subtype: result.subtype ?? null,
    rarity: result.rarity,
    requires_attunement: result.requires_attunement ?? false,
    attunement_requirements: result.attunement_requirements ?? null,
    weight: result.weight !== null && result.weight !== undefined ? parseFloat(String(result.weight)) || null : null,
    cost: result.cost ?? null,
    damage_rolls: result.damage_rolls ?? null,
    armor_class: result.armor_class ?? null,
    properties: result.properties ?? [],
    weapon_range: result.weapon_range ?? null,
    versatile_damage: result.versatile_damage ?? null,
    charges: result.charges ?? null,
    recharge: result.recharge ?? null,
    spell_ids: [],
    description: result.description ? toTiptapJson(result.description) : "",
    mundane_description: result.mundane_description ? toTiptapJson(result.mundane_description) : null,
    source: "Grimoire:AI",
    tags: result.tags ?? [],
    image_url: result.image_url ?? null,
    image_focal_point: null,
    curse_description: result.curse_description ?? null,
    is_arcane_focus: false,
  });

  if (ui.itemGeneratorOpen) {
    ui.itemGeneratorOpen = false;
    router.push(`/vault/${created.id}`);
  } else {
    completedEntityId.value = created.id;
  }
}
</script>

<style scoped>
.gold-divider {
  border-top: 1px solid
    color-mix(in srgb, var(--color-primary) 30%, transparent);
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
