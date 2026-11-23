<template>
  <GeneratorPanelShell
    v-model:open="spellsUi.spellGeneratorOpen"
    v-model:concept="concept"
    v-model:generate-image="generateImage"
    title="Spell Generator"
    concept-placeholder="A storm of luminous moths that swarm a target, biting and dazzling them with flashes of bioluminescence…"
    :credits="quote.total"
    :byok="quote.byok"
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
import { useSpellGeneration } from "@/ai/useSpellGeneration";
import { useGenerateSpell } from "@/composables/spells/useGenerateSpell";
import AppSelect from "@/components/common/controls/AppSelect.vue";
import GeneratorPanelShell from "@/components/common/ai/GeneratorPanelShell.vue";
import { useOutOfCredits } from "@/composables/ai/useOutOfCredits";
import { useSpellQuote } from "@/composables/ai/quotes/spellQuote";
import { SPELL_SCHOOLS, type SpellSchool } from "@/types/spell.types";

const spellsUi = useSpellsUiStore();
const router = useRouter();
const { generateAndCreateSpell } = useGenerateSpell();
// The shared generation state `useGenerateSpell` drives underneath; this panel reads it for its own loading UI.
const {
  isGenerating,
  error: genError,
  completedEntityId,
  concept: genConcept,
  clearCompleted,
} = useSpellGeneration();

const { requireCredits } = useOutOfCredits();
const quoteSpell = useSpellQuote();

const concept = ref("");
const constraints = reactive<{ level: string; school: "" | SpellSchool }>({
  level: "",
  school: "",
});
const generateImage = ref(true);

// The price Ask Grimoire quotes for the same run: the picture counts when it is switched on.
const quote = computed(() => quoteSpell({ image: generateImage.value }));

function levelSuffix(n: number): string {
  if (n === 1) return "st";
  if (n === 2) return "nd";
  if (n === 3) return "rd";
  return "th";
}

async function generateAndCreate() {
  if (!requireCredits(quote.value.total, quote.value.byok)) return;

  genConcept.value = concept.value.trim();
  clearCompleted();

  const { id } = await generateAndCreateSpell(concept.value.trim(), {
    level: constraints.level === "" ? undefined : Number(constraints.level),
    school: constraints.school || undefined,
    generateImage: generateImage.value,
  });
  if (!id) return;

  if (spellsUi.spellGeneratorOpen) {
    spellsUi.spellGeneratorOpen = false;
    router.push(`/spells/${id}`);
  } else {
    completedEntityId.value = id;
  }
}
</script>
