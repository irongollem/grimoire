<template>
  <GeneratorPanelShell
    v-model:open="spellsUi.spellGeneratorOpen"
    v-model:concept="concept"
    v-model:generate-image="generateImage"
    title="Spell Generator"
    concept-placeholder="A storm of luminous moths that swarm a target, biting and dazzling them with flashes of bioluminescence…"
    :credits="textCreditCost"
    :byok="textIsByok"
    :is-generating="isGenerating"
    :error="genError"
    blank-to="/spells/new"
    blank-label="New Blank Spell"
    image-toggle-label="Generate spell-effect art"
    @generate="generateAndCreate"
  >
    <template #constraints>
      <div class="grid grid-cols-2 gap-2">
        <div>
          <label class="block text-caption text-muted-foreground mb-1">Level</label>
          <AppSelect v-model="constraints.level" tone="filled" size="body" weight="normal" block>
            <option value="">Any</option>
            <option value="0">Cantrip</option>
            <option v-for="n in 9" :key="n" :value="String(n)">{{ n }}{{ levelSuffix(n) }}</option>
          </AppSelect>
        </div>
        <div>
          <label class="block text-caption text-muted-foreground mb-1">School</label>
          <AppSelect v-model="constraints.school" tone="filled" size="body" weight="normal" block class="capitalize">
            <option value="">Any</option>
            <option v-for="s in SPELL_SCHOOLS" :key="s" :value="s" class="capitalize">{{ s }}</option>
          </AppSelect>
        </div>
      </div>
    </template>
  </GeneratorPanelShell>
</template>

<script setup lang="ts">
import { ref, reactive, computed } from "vue";
import { useRouter } from "vue-router";
import { useSpellsUiStore } from "@/stores/ui/spells";
import { useCampaignStore } from "@/stores/campaign";
import { useCreateSpell } from "@/composables/spells/useSpells";
import { useSpellGeneration } from "@/ai/useSpellGeneration";
import AppSelect from "@/components/common/AppSelect.vue";
import GeneratorPanelShell from "@/components/common/GeneratorPanelShell.vue";
import { useAiCredits } from "@/composables/ai/useAiCredits";
import { useOutOfCredits } from "@/composables/ai/useOutOfCredits";
import { useCampaignProviders } from "@/composables/ai/useCampaignProviders";
import { spellInsertFromAi } from "@/ai/spellAiAdapter";
import { SPELL_SCHOOLS, type SpellSchool } from "@/types/spell.types";

const spellsUi = useSpellsUiStore();
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

const { costOf } = useAiCredits();
const { requireCredits } = useOutOfCredits();
const { textCredits, textIsByok } = useCampaignProviders();
const textCreditCost = computed(
  () => textCredits(costOf("spell_generation")),
);

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
  if (!requireCredits(textCreditCost.value, textIsByok.value)) return;

  genConcept.value = concept.value.trim();
  clearCompleted();

  const result = await generate(concept.value.trim(), {
    level: constraints.level === "" ? undefined : Number(constraints.level),
    school: constraints.school || undefined,
    generateImage: generateImage.value,
  });
  if (!result) return;

  const created = await createSpell({
    ...spellInsertFromAi(result),
    // spellInsertFromAi is a pure AI→shape adapter with no campaign awareness;
    // stamp the same default SpellDetail.vue's manual create path uses (#596)
    // so an AI-generated spell lands in the DM's current campaign rather than
    // "every campaign" by accident. No active campaign is genuinely global.
    campaign_id: campaign.activeCampaignId ?? null,
  });

  if (spellsUi.spellGeneratorOpen) {
    spellsUi.spellGeneratorOpen = false;
    router.push(`/spells/${created.id}`);
  } else {
    completedEntityId.value = created.id;
  }
}
</script>
