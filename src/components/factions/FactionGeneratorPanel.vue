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
        <h2 class="text-heading-sm font-semibold text-foreground">Faction Generator</h2>
        <AppButton variant="ghost" size="inline-xs" icon-size="lg" :icon="IconClose" tooltip="Close" aria-label="Close" @click="ui.factionGeneratorOpen = false" />
      </div>

      <!-- Body -->
      <div class="flex-1 overflow-y-auto p-5 space-y-5">
        <!-- Concept -->
        <div>
          <label class="block text-label-lg font-semibold text-muted-foreground mb-1.5">
            CONCEPT
            <span class="font-fell normal-case tracking-normal text-muted-foreground/60 ml-1">(AI will use this)</span>
          </label>
          <textarea
            v-model="concept"
            rows="4"
            :maxlength="CONCEPT_LIMIT"
            placeholder="A shadowy thieves' guild operating beneath the city's merchant quarter, secretly manipulating trade routes and bribing officials to maintain their monopoly on smuggled goods…"
            class="w-full bg-muted border border-border rounded-md px-3 py-2 text-body text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring resize-none"
          />
          <div class="flex justify-end mt-1">
            <span
              class="text-caption"
              :class="concept.length >= CONCEPT_LIMIT * 0.9 ? 'text-destructive' : 'text-muted-foreground/50'"
            >{{ concept.length }} / {{ CONCEPT_LIMIT }}</span>
          </div>
        </div>

        <div class="gold-divider" />

        <!-- Constraints -->
        <div class="space-y-3">
          <p class="text-label-lg font-semibold text-muted-foreground">
            CONSTRAINTS
            <span class="font-fell normal-case tracking-normal text-muted-foreground/60 ml-1">(optional)</span>
          </p>

          <div class="grid grid-cols-2 gap-2">
            <div>
              <label class="block text-caption text-muted-foreground mb-1">Type</label>
              <AppSelect v-model="constraints.faction_type" tone="filled" size="body" weight="normal" block>
                <option value="">Any</option>
                <option v-for="t in FACTION_TYPES" :key="t" :value="t">{{ t }}</option>
              </AppSelect>
            </div>
            <div>
              <label class="block text-caption text-muted-foreground mb-1">Alignment</label>
              <AppSelect v-model="constraints.alignment" tone="filled" size="body" weight="normal" block>
                <option value="">Any</option>
                <option v-for="a in FACTION_ALIGNMENTS" :key="a" :value="a">{{ a }}</option>
              </AppSelect>
            </div>
          </div>
          <div>
            <label class="block text-caption text-muted-foreground mb-1">Leader (NPC)</label>
            <EntityCombobox
              v-model="leaderNpcId"
              :options="npcOptions"
              placeholder="Search NPCs…"
            />
          </div>
          <div>
            <label class="block text-caption text-muted-foreground mb-1">Headquarters</label>
            <EntityCombobox
              v-model="headquartersLocationId"
              :options="locationOptions"
              placeholder="Search locations…"
            />
          </div>
        </div>

        <!-- Image generation toggle -->
        <div v-if="isAiEnabled" class="flex items-center justify-between">
          <span class="text-caption text-muted-foreground">Generate faction emblem</span>
          <ToggleSwitch v-model="generateImage" aria-label="Generate faction emblem" />
        </div>

        <!-- No API key nudge -->
        <!-- Generating state -->
        <div v-else-if="isGenerating" class="flex flex-col items-center gap-3 py-4">
          <IconGenerate class="h-7 w-7 text-primary animate-pulse" />
          <p class="text-body text-muted-foreground italic text-center">{{ currentLoadingQuote }}</p>
          <AppButton
            variant="ghost"
            size="inline-caption"
            class="mt-1 underline underline-offset-2"
            label="Continue in background"
            @click="ui.factionGeneratorOpen = false"
          />
        </div>

        <!-- Error -->
        <div
          v-else-if="genError"
          class="rounded-md bg-destructive/10 border border-destructive/30 px-3 py-2"
        >
          <p class="text-caption text-destructive">{{ genError }}</p>
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
        <AppButton
          v-if="isPro && isAiEnabled"
          variant="primary"
          size="md"
          block
          :icon="IconGenerate"
          :disabled="isAnyAiGenerating || !concept.trim() || !affordable(textCreditCost, textIsByok)"
          :tooltip="isAnyAiGenerating && !isGenerating ? 'Another generation is already in progress' : undefined"
          :label="isGenerating ? 'Generating…' : 'Generate with AI'"
          @click="generateAndCreate"
        />
        <AppButton
          v-else-if="!isPro"
          variant="primary"
          size="md"
          block
          :icon="IconGenerate"
          label="Generate with AI"
          @click="showPaywall = true"
        />
        <AppButton
          to="/factions/new"
          :variant="isPro && !aiApiKey ? 'primary' : 'outline'"
          size="md"
          block
          label="New Blank Faction"
          @click="ui.factionGeneratorOpen = false"
        />
      </div>
    </aside>
  </Transition>
  <PaywallModal v-model="showPaywall" message="AI generation is a Pro feature. Upgrade to generate factions, NPCs, monsters, items, spells, and more." />
</template>

<script setup lang="ts">
import { ref, reactive, computed } from "vue";
import { AI_PROMPT_LIMIT } from "@/ai/utils";

const CONCEPT_LIMIT = AI_PROMPT_LIMIT;
import { useRouter } from "vue-router";
import { IconClose, IconGenerate } from '@/lib/icons';
import { useUiStore } from "@/stores/ui";
import { useCampaignStore } from "@/stores/campaign";
import { useCreateFaction, useAddFactionNpc, useAddFactionLocation } from "@/composables/useFactions";
import { useSubscription } from "@/composables/useSubscription";
import PaywallModal from "@/components/common/PaywallModal.vue";
import GenerationCostBadge from "@/components/common/GenerationCostBadge.vue";
import EntityCombobox from "@/components/common/EntityCombobox.vue";
import AppButton from "@/components/common/AppButton.vue";
import AppSelect from "@/components/common/AppSelect.vue";
import ToggleSwitch from "@/components/common/ToggleSwitch.vue";
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

// Mounted on every DM page — only fetch the dropdown data once the panel opens.
const panelOpen           = () => ui.factionGeneratorOpen;
const { data: npcs }      = useNpcs(panelOpen);
const { locationOptions } = useLocationTree(panelOpen);

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
    ai_provenance:     result.ai_provenance ?? null,
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
