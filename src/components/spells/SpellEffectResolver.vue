<template>
  <Teleport to="body">
    <div v-if="spell" class="fixed inset-0 z-60 flex items-end sm:items-center justify-center bg-black/60 p-0 sm:p-4" @click.self="emit('close')">
      <section class="w-full sm:max-w-xl max-h-[90vh] overflow-y-auto rounded-t-xl sm:rounded-xl border border-border bg-card shadow-2xl" role="dialog" aria-modal="true" :aria-label="`Resolve ${spell.name}`">
        <header class="flex items-center gap-3 border-b border-border px-4 py-3">
          <div class="flex-1 min-w-0">
            <p class="font-cinzel text-sm font-bold truncate">Resolve {{ spell.name }}</p>
            <p class="font-fell text-xs text-muted-foreground">Choose each target's actual outcome before any effect is rolled.</p>
          </div>
          <button type="button" class="rounded px-2 py-1 text-muted-foreground hover:text-foreground" aria-label="Close resolver" @click="emit('close')">×</button>
        </header>

        <div class="p-4 space-y-4">
          <div v-if="spell.mechanics_reviewed === false || !castEffects.length" class="rounded border border-amber-500/30 bg-amber-500/10 p-3">
            <p class="font-cinzel text-xs font-semibold text-amber-500">Manual resolution required</p>
            <p class="font-fell text-sm text-muted-foreground">This imported spell has not been mechanically reviewed, so Grimoire will not present its partial data as authoritative automation.</p>
          </div>

          <template v-else>
            <label class="block font-cinzel text-xs text-muted-foreground">
              Targets
              <input v-model.number="targetCount" type="number" min="1" max="20" class="ml-2 w-16 rounded border border-border bg-background px-2 py-1 text-foreground" />
            </label>

            <div class="space-y-2">
              <div v-for="target in targets" :key="target.id" class="grid grid-cols-[1fr_auto] gap-2">
                <input v-model="target.name" :aria-label="`Target ${target.id} name`" class="min-w-0 rounded border border-border bg-background px-2 py-1.5 font-fell text-sm" :placeholder="`Target ${target.id}`" />
                <select v-if="outcomeOptions.length > 1" v-model="target.outcome" :aria-label="`Target ${target.id} outcome`" class="rounded border border-border bg-background px-2 py-1.5 font-fell text-sm">
                  <option v-for="option in outcomeOptions" :key="option.value" :value="option.value">{{ option.label }}</option>
                </select>
              </div>
            </div>

            <div class="flex flex-wrap gap-2" role="group" aria-label="Effect phase">
              <button
                v-for="phase in phases" :key="phase"
                type="button"
                class="rounded border px-3 py-1 font-cinzel text-xs"
                :class="selectedPhase === phase ? 'border-primary bg-primary/15 text-primary' : 'border-border text-muted-foreground'"
                @click="selectedPhase = phase"
              >{{ phaseLabel(phase) }}</button>
            </div>

            <div class="rounded border border-border bg-muted/20 p-3 font-fell text-sm text-muted-foreground">
              {{ phaseSummary }}
            </div>

            <button type="button" class="w-full rounded bg-primary px-4 py-2 font-cinzel text-sm font-semibold text-primary-foreground disabled:opacity-40" :disabled="resolving" @click="resolveSelectedPhase">
              {{ resolving ? "Resolving…" : `Resolve ${phaseLabel(selectedPhase)}` }}
            </button>
          </template>
        </div>
      </section>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { computed, ref, watch } from "vue";
import type { Spell, SpellOutcome, StructuredSpellEffect } from "@/types/spell.types";
import { effectsForCast, resolveSpellEffects } from "@/lib/spellEffects";
import { parseExpression } from "@/lib/dice";
import { rollParsed } from "@/lib/roller";
import { useCampaignMessages } from "@/composables/useCampaignMessages";
import { useToast } from "@/composables/useToast";

const props = withDefaults(defineProps<{
  spell: Spell | null;
  castLevel: number;
  characterLevel: number;
  spellcastingModifier?: number;
  damageTypeOverride?: string | null;
}>(), { spellcastingModifier: 0, damageTypeOverride: null });
const emit = defineEmits<{ close: [] }>();
const { sendRoll, sendFlavorMessage } = useCampaignMessages();
const toast = useToast();
const targetCount = ref(1);
const targets = ref<Array<{ id: number; name: string; outcome: SpellOutcome }>>([]);
const selectedPhase = ref<StructuredSpellEffect["phase"]>("impact");
const resolving = ref(false);

const castEffects = computed(() => effectsForCast(
  props.spell?.effects ?? [],
  props.spell?.level ?? 0,
  props.castLevel,
  props.characterLevel,
));
const phases = computed(() => [...new Set(castEffects.value.map((effect) => effect.phase))]);
const outcomeOptions = computed<Array<{ value: SpellOutcome; label: string }>>(() => {
  if (props.spell?.attack_type === "ranged_spell" || props.spell?.attack_type === "melee_spell") return [
    { value: "hit", label: "Hit" }, { value: "critical_hit", label: "Critical hit" }, { value: "miss", label: "Miss" },
  ];
  if (props.spell?.attack_type === "save") return [
    { value: "failed_save", label: "Failed save" }, { value: "successful_save", label: "Successful save" },
  ];
  return [{ value: "automatic", label: "Automatic" }];
});

watch(() => props.spell, (spell) => {
  if (!spell) return;
  targetCount.value = Math.min(20, Math.max(1, ...castEffects.value.map((effect) => effect.target.count ?? 1)));
  selectedPhase.value = phases.value.includes("impact") ? "impact" : (phases.value[0] ?? "impact");
}, { immediate: true });
watch([targetCount, outcomeOptions], () => {
  const count = Math.min(20, Math.max(1, targetCount.value || 1));
  targets.value = Array.from({ length: count }, (_, index) => targets.value[index] ?? {
    id: index + 1, name: "", outcome: outcomeOptions.value[0]?.value ?? "automatic",
  });
}, { immediate: true });

const phaseSummary = computed(() => {
  const effects = castEffects.value.filter((effect) => effect.phase === selectedPhase.value);
  if (!effects.length) return "No structured effects occur in this phase.";
  return effects.map((effect) => [effect.dice, props.damageTypeOverride ?? effect.damageType, effect.kind, effect.description].filter(Boolean).join(" ")).join("; ");
});

function phaseLabel(phase: StructuredSpellEffect["phase"]): string {
  return ({ cast: "On cast", impact: "Impact", turn_start: "Start of turn", turn_end: "End of turn", repeat: "Repeat" })[phase];
}

async function resolveSelectedPhase() {
  if (!props.spell || resolving.value) return;
  resolving.value = true;
  try {
    const outcomes = Object.fromEntries(targets.value.map((target) => [String(target.id), target.outcome]));
    const names = new Map(targets.value.map((target) => [String(target.id), target.name.trim() || `Target ${target.id}`]));
    const resolved = resolveSpellEffects(castEffects.value, selectedPhase.value, outcomes);
    if (!resolved.length) {
      toast.info("No structured effect applies to the selected outcomes.");
      return;
    }
    for (const { targetId, effect } of resolved) {
      const target = names.get(targetId) ?? targetId;
      if (effect.dice) {
        const parsed = parseExpression(effect.dice);
        if (!parsed) throw new Error(`Unsupported dice expression: ${effect.dice}`);
        const abilityModifier = effect.modifier === "spellcasting_ability" ? props.spellcastingModifier : (effect.modifier ?? 0);
        const rolled = rollParsed({ ...parsed, modifier: parsed.modifier + abilityModifier });
        const total = Math.floor(rolled.total * effect.multiplier);
        const damageType = props.damageTypeOverride ?? effect.damageType;
        const label = `${props.spell.name} — ${target}: ${effect.kind}${damageType ? ` (${damageType})` : ""}${effect.multiplier === 0.5 ? " · successful save, half" : ""}`;
        await sendRoll({ total, label, modifier: parsed.modifier + abilityModifier, breakdown: rolled.breakdown, isCrit: outcomes[targetId] === "critical_hit", isFumble: false, isDamage: effect.kind === "damage" });
      } else if (effect.condition || effect.description) {
        await sendFlavorMessage(`${target}: ${effect.condition ?? effect.description}`, props.spell.name);
      }
    }
  } catch (error) {
    toast.error(toast.fromError(error));
  } finally {
    resolving.value = false;
  }
}
</script>
