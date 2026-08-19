<template>
  <Teleport to="body">
    <div v-if="spell" class="fixed inset-0 z-60 flex items-end sm:items-center justify-center bg-black/60 p-0 sm:p-4" @click.self="emit('close')">
      <section ref="dialogRef" tabindex="-1" class="w-full sm:max-w-xl max-h-[90vh] overflow-y-auto rounded-t-xl sm:rounded-xl border border-border bg-card shadow-2xl" role="dialog" aria-modal="true" :aria-label="`Resolve ${spell.name}`" @keydown.esc.stop="emit('close')">
        <header class="flex items-center gap-3 border-b border-border px-4 py-3">
          <div class="flex-1 min-w-0">
            <p class="font-cinzel text-sm font-bold truncate">Resolve {{ spell.name }}</p>
            <p class="text-caption text-muted-foreground">Choose each target's actual outcome before any effect is rolled.</p>
          </div>
          <AppButton variant="ghost" size="icon-xs" icon-size="md" :icon="IconClose" aria-label="Close resolver" @click="emit('close')" />
        </header>

        <div class="p-4 space-y-4">
          <div v-if="spell.mechanics_reviewed === false || !castEffects.length" class="rounded border border-amber-500/30 bg-amber-500/10 p-3">
            <p class="font-cinzel text-xs font-semibold text-amber-500">Manual resolution required</p>
            <p class="text-body text-muted-foreground">This imported spell has not been mechanically reviewed, so Grimoire will not present its partial data as authoritative automation.</p>
          </div>

          <template v-else>
            <label class="block font-cinzel text-xs text-muted-foreground">
              Targets
              <AppInput v-model.number="targetCount" type="number" min="1" max="20" size="body-xs" :block="false" class="ml-2 w-16" />
            </label>

            <div class="space-y-2">
              <div v-for="target in targets" :key="target.id" class="grid grid-cols-[1fr_auto] gap-2">
                <AppInput v-model="target.name" :aria-label="`Target ${target.id} name`" size="body-xs" class="min-w-0" :placeholder="`Target ${target.id}`" />
                <AppSelect v-if="outcomeOptions.length > 1" v-model="target.outcome" :aria-label="`Target ${target.id} outcome`" tone="default" size="body" weight="normal">
                  <option v-for="option in outcomeOptions" :key="option.value" :value="option.value">{{ option.label }}</option>
                </AppSelect>
              </div>
            </div>

            <div class="flex flex-wrap gap-2" role="group" aria-label="Effect phase">
              <AppButton
                v-for="phase in phases" :key="phase"
                variant="subtle"
                :active="selectedPhase === phase"
                :label="phaseLabel(phase)"
                @click="selectedPhase = phase"
              />
            </div>

            <div class="rounded border border-border bg-muted/20 p-3 text-body text-muted-foreground">
              {{ phaseSummary }}
            </div>
            <ul v-if="reminders.length" class="list-disc space-y-1 pl-5 text-body text-violet-400">
              <li v-for="reminder in reminders" :key="reminder">{{ reminder }}</li>
            </ul>

            <AppButton
              variant="primary"
              size="lg"
              block
              :disabled="resolving"
              :label="resolving ? 'Resolving…' : `Resolve ${phaseLabel(selectedPhase)}`"
              @click="resolveSelectedPhase"
            />
          </template>
        </div>
      </section>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { computed, nextTick, ref, watch } from "vue";
import type { Spell, SpellOutcome, StructuredSpellEffect } from "@/types/spell.types";
import { effectsForCast, resolveSpellEffects } from "@/rules/spellEffects";
import { parseExpression } from "@/lib/dice/dice";
import { rollParsed } from "@/lib/dice/roller";
import { useCampaignMessages } from "@/composables/useCampaignMessages";
import { useToast } from "@/composables/useToast";
import { metamagicReminders, metamagicTargetBonus } from "@/rules/metamagicPolicy";
import { useRuleset } from "@/composables/useRuleset";
import { IconClose } from "@/lib/icons";
import AppButton from "@/components/common/AppButton.vue";
import AppInput from "@/components/common/AppInput.vue";
import AppSelect from "@/components/common/AppSelect.vue";

const { spell, castLevel, characterLevel, spellcastingModifier = 0, damageTypeOverride = null, metamagicNames = [] } = defineProps<{
  spell: Spell | null;
  castLevel: number;
  characterLevel: number;
  spellcastingModifier?: number;
  damageTypeOverride?: string | null;
  metamagicNames?: string[];
}>();
const emit = defineEmits<{ close: [] }>();
const { sendRoll, sendFlavorMessage } = useCampaignMessages();
const toast = useToast();
const { ruleset } = useRuleset();
const targetCount = ref(1);
const targets = ref<Array<{ id: number; name: string; outcome: SpellOutcome }>>([]);
const selectedPhase = ref<StructuredSpellEffect["phase"]>("impact");
const resolving = ref(false);
const dialogRef = ref<HTMLElement | null>(null);

const castEffects = computed(() => effectsForCast(
  spell?.effects ?? [],
  spell?.level ?? 0,
  castLevel,
  characterLevel,
));
const phases = computed(() => [...new Set(castEffects.value.map((effect) => effect.phase))]);
const reminders = computed(() => metamagicReminders(metamagicNames, ruleset.value));
const outcomeOptions = computed<Array<{ value: SpellOutcome; label: string }>>(() => {
  if (spell?.attack_type === "ranged_spell" || spell?.attack_type === "melee_spell") return [
    { value: "hit", label: "Hit" }, { value: "critical_hit", label: "Critical hit" }, { value: "miss", label: "Miss" },
  ];
  if (spell?.attack_type === "save") return [
    { value: "failed_save", label: "Failed save" }, { value: "successful_save", label: "Successful save" },
    ...(metamagicNames.includes("Careful Spell")
      ? [{ value: "careful_save" as const, label: ruleset.value === "2024" ? "Careful: save, no damage" : "Careful: successful save" }]
      : []),
  ];
  return [{ value: "automatic", label: "Automatic" }];
});

watch(() => spell, (nextSpell) => {
  if (!nextSpell) return;
  targetCount.value = Math.min(20, Math.max(1, ...castEffects.value.map((effect) => effect.target.count ?? 1)) + metamagicTargetBonus(metamagicNames));
  selectedPhase.value = phases.value.includes("impact") ? "impact" : (phases.value[0] ?? "impact");
  void nextTick(() => dialogRef.value?.focus());
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
  return effects.map((effect) => [effect.dice, damageTypeOverride ?? effect.damageType, effect.kind, effect.description].filter(Boolean).join(" ")).join("; ");
});

function phaseLabel(phase: StructuredSpellEffect["phase"]): string {
  return ({ cast: "On cast", impact: "Impact", turn_start: "Start of turn", turn_end: "End of turn", repeat: "Repeat" })[phase];
}

async function resolveSelectedPhase() {
  if (!spell || resolving.value) return;
  resolving.value = true;
  try {
    const carefulTargets = targets.value.filter((target) => target.outcome === "careful_save").length;
    const carefulLimit = Math.max(1, spellcastingModifier);
    if (carefulTargets > carefulLimit) {
      toast.error(`Careful Spell can protect at most ${carefulLimit} target${carefulLimit === 1 ? "" : "s"}.`);
      return;
    }
    const outcomes = Object.fromEntries(targets.value.map((target) => [String(target.id), target.outcome]));
    const names = new Map(targets.value.map((target) => [String(target.id), target.name.trim() || `Target ${target.id}`]));
    const resolved = resolveSpellEffects(castEffects.value, selectedPhase.value, outcomes, {
      carefulPreventsDamage: ruleset.value === "2024",
    });
    if (!resolved.length) {
      toast.info("No structured effect applies to the selected outcomes.");
      return;
    }
    for (const { targetId, effect } of resolved) {
      const target = names.get(targetId) ?? targetId;
      if (effect.dice) {
        const parsed = parseExpression(effect.dice);
        if (!parsed) throw new Error(`Unsupported dice expression: ${effect.dice}`);
        const abilityModifier = effect.modifier === "spellcasting_ability" ? spellcastingModifier : (effect.modifier ?? 0);
        const rolled = rollParsed({ ...parsed, modifier: parsed.modifier + abilityModifier });
        const total = Math.floor(rolled.total * effect.multiplier);
        const damageType = damageTypeOverride ?? effect.damageType;
        const label = `${spell.name} — ${target}: ${effect.kind}${damageType ? ` (${damageType})` : ""}${effect.multiplier === 0.5 ? " · successful save, half" : ""}`;
        await sendRoll({ total, label, modifier: parsed.modifier + abilityModifier, breakdown: rolled.breakdown, isCrit: outcomes[targetId] === "critical_hit", isFumble: false, isDamage: effect.kind === "damage" });
      } else if (effect.condition || effect.description) {
        await sendFlavorMessage(`${target}: ${effect.condition ?? effect.description}`, spell.name);
      }
    }
  } catch (error) {
    toast.error(toast.fromError(error));
  } finally {
    resolving.value = false;
  }
}
</script>
