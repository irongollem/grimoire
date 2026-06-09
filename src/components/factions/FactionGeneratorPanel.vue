<template>
  <Transition name="fade">
    <div
      v-if="ui.factionGeneratorOpen"
      class="fixed inset-0 bg-black/60 z-40"
      @click="ui.factionGeneratorOpen = false"
    />
  </Transition>

  <Transition name="slide-right">
    <aside
      v-if="ui.factionGeneratorOpen"
      class="fixed right-0 top-0 bottom-0 w-full max-w-md bg-card border-l border-border z-50 flex flex-col"
    >
      <!-- Header -->
      <div class="flex items-center justify-between px-5 py-4 border-b border-border shrink-0">
        <h2 class="font-cinzel text-base font-semibold text-foreground">Faction Generator</h2>
        <button class="text-muted-foreground hover:text-foreground" @click="ui.factionGeneratorOpen = false">
          <IconClose class="h-5 w-5" />
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
            :maxlength="CONCEPT_LIMIT"
            placeholder="A shadowy thieves' guild operating beneath the city's merchant quarter, secretly manipulating trade routes and bribing officials to maintain their monopoly on smuggled goods…"
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
          <p class="font-cinzel text-xs font-semibold tracking-wider text-muted-foreground">
            CONSTRAINTS
            <span class="font-fell normal-case tracking-normal text-muted-foreground/60 ml-1">(optional)</span>
          </p>

          <div class="grid grid-cols-2 gap-2">
            <div>
              <label class="block font-fell text-xs text-muted-foreground mb-1">Type</label>
              <select
                v-model="constraints.faction_type"
                class="w-full bg-muted border border-border rounded-md px-3 py-1.5 font-fell text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
              >
                <option value="">Any</option>
                <option v-for="t in FACTION_TYPES" :key="t" :value="t">{{ t }}</option>
              </select>
            </div>
            <div>
              <label class="block font-fell text-xs text-muted-foreground mb-1">Alignment</label>
              <select
                v-model="constraints.alignment"
                class="w-full bg-muted border border-border rounded-md px-3 py-1.5 font-fell text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
              >
                <option value="">Any</option>
                <option v-for="a in FACTION_ALIGNMENTS" :key="a" :value="a">{{ a }}</option>
              </select>
            </div>
          </div>
          <div>
            <label class="block font-fell text-xs text-muted-foreground mb-1">Leader (NPC)</label>
            <EntityCombobox
              v-model="leaderNpcId"
              :options="npcOptions"
              placeholder="Search NPCs…"
            />
          </div>
          <div>
            <label class="block font-fell text-xs text-muted-foreground mb-1">Headquarters</label>
            <EntityCombobox
              v-model="headquartersLocationId"
              :options="locationOptions"
              placeholder="Search locations…"
            />
          </div>
        </div>

        <!-- Image generation toggle -->
        <div v-if="isAiEnabled" class="flex items-center justify-between">
          <span class="font-fell text-xs text-muted-foreground">Generate faction emblem</span>
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
        <!-- Generating state -->
        <div v-else-if="isGenerating" class="flex flex-col items-center gap-3 py-4">
          <IconGenerate class="h-7 w-7 text-primary animate-pulse" />
          <p class="font-fell text-sm text-muted-foreground italic text-center">{{ currentLoadingQuote }}</p>
          <button
            type="button"
            class="mt-1 font-fell text-xs text-muted-foreground hover:text-foreground underline underline-offset-2 transition-colors"
            @click="ui.factionGeneratorOpen = false"
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
        <GenerationCostBadge
          v-if="isPro && isAiEnabled"
          :credits="textCreditCost"
          :byok="textIsByok"
          class="self-center"
        />
        <button
          v-if="isPro && isAiEnabled"
          type="button"
          :disabled="isAnyAiGenerating || !concept.trim() || !affordable(textCreditCost, textIsByok)"
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
          to="/factions/new"
          class="w-full inline-flex items-center justify-center py-2 font-cinzel text-xs font-semibold tracking-wider rounded-md hover:opacity-90 transition-opacity"
          :class="isPro && !aiApiKey ? 'bg-primary text-primary-foreground' : 'border border-border bg-card text-foreground hover:bg-muted'"
          @click="ui.factionGeneratorOpen = false"
        >
          New Blank Faction
        </RouterLink>
      </div>
    </aside>
  </Transition>
  <PaywallModal v-model="showPaywall" message="AI generation is a Pro feature. Upgrade to generate factions, NPCs, monsters, items, spells, and more." />
</template>

<script setup lang="ts">
import { ref, reactive, computed } from "vue";
import { AI_PROMPT_LIMIT } from "@/ai/utils";

const CONCEPT_LIMIT = AI_PROMPT_LIMIT;
import { useRouter, RouterLink } from "vue-router";
import { IconClose, IconGenerate } from '@/lib/icons';
import { useUiStore } from "@/stores/ui";
import { useCampaignStore } from "@/stores/campaign";
import { useCreateFaction, useAddFactionNpc, useAddFactionLocation } from "@/composables/useFactions";
import { useSubscription } from "@/composables/useSubscription";
import PaywallModal from "@/components/common/PaywallModal.vue";
import GenerationCostBadge from "@/components/common/GenerationCostBadge.vue";
import EntityCombobox from "@/components/common/EntityCombobox.vue";
import { useAiCredits } from "@/composables/useAiCredits";
import { useProviderConfig } from "@/composables/useProviderConfig";
import { useFactionGeneration } from "@/ai/useFactionGeneration";
import { toTiptapJson } from "@/ai/useNpcGeneration";
import { currentLoadingQuote } from "@/ai/aiGenerationState";
import { isAnyAiGenerating } from "@/ai/aiGeneratorRegistry";
import { FACTION_TYPES, FACTION_ALIGNMENTS } from "@/types/faction.types";
import { useNpcs } from "@/composables/useNpcs";
import { useLocationTree } from "@/composables/useLocations";

const ui       = useUiStore();
const router   = useRouter();
const campaign = useCampaignStore();
const { mutateAsync: createFaction }    = useCreateFaction();
const { mutateAsync: addFactionNpc }    = useAddFactionNpc();
const { mutateAsync: addFactionLocation } = useAddFactionLocation();
const { isGenerating, error: genError, completedEntityId, concept: genConcept, clearCompleted, generate } = useFactionGeneration();

const { data: npcs }      = useNpcs();
const { locationOptions } = useLocationTree();

const aiApiKey = computed(() => campaign.decryptedApiKey);
const isAiEnabled = computed(() => campaign.isAiEnabled);
const { isPro } = useSubscription();
const showPaywall = ref(false);

const { costOf, affordable } = useAiCredits();
const { textMultiplierFor } = useProviderConfig();
const textProvider = computed(() => campaign.activeCampaign?.text_provider ?? "openai");
const textIsByok = computed(() => !!campaign.decryptedApiKey);
const textCreditCost = computed(
  () => Math.round(costOf("faction_generation") * textMultiplierFor(textProvider.value) * 100) / 100,
);

const concept                = ref("");
const constraints            = reactive({ faction_type: "", alignment: "" });
const generateImage          = ref(true);
const leaderNpcId            = ref("");
const headquartersLocationId = ref("");

const npcOptions = computed(() =>
  (npcs.value ?? []).map((n) => ({ id: n.id, name: n.name })),
);

const leaderNpc = computed(() =>
  npcs.value?.find((n) => n.id === leaderNpcId.value) ?? null,
);
const headquartersLocation = computed(() =>
  locationOptions.value.find((l) => l.id === headquartersLocationId.value) ?? null,
);

async function generateAndCreate() {
  genConcept.value = concept.value.trim();
  clearCompleted();

  const leaderName = leaderNpc.value
    ? leaderNpc.value.occupation
      ? `${leaderNpc.value.name} (${leaderNpc.value.occupation})`
      : leaderNpc.value.name
    : undefined;

  const result = await generate(
    concept.value.trim(),
    {
      faction_type:      constraints.faction_type || undefined,
      alignment:         constraints.alignment || undefined,
      generateImage:     generateImage.value,
      leader_name:       leaderName,
      headquarters_name: headquartersLocation.value?.name || undefined,
    },
  );

  if (!result) return;

  const faction = await createFaction({
    name:              result.name,
    faction_type:      result.faction_type || null,
    alignment:         result.alignment || null,
    description:       toTiptapJson(result.description),
    emblem_url:        result.image_url,
    player_visible_to: [],
    tags:              result.tags,
  });

  await Promise.all([
    leaderNpcId.value
      ? addFactionNpc({ faction_id: faction.id, npc_id: leaderNpcId.value, role: "Leader" })
      : Promise.resolve(),
    headquartersLocationId.value
      ? addFactionLocation({ faction_id: faction.id, location_id: headquartersLocationId.value })
      : Promise.resolve(),
  ]);

  completedEntityId.value = faction.id;
  ui.factionGeneratorOpen = false;
  router.push(`/factions/${faction.id}`);
}
</script>
