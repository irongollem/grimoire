<template>
  <AppModal :open="!!spell" size="md" align="sheet" @close="emit('close')">
    <ModalHeader
      :title="spell ? `Resolve ${spell.name}` : ''"
      subtitle="Choose each target's actual outcome before any effect is rolled."
      closeable
      @close="emit('close')"
    />

    <div v-if="spell" class="min-h-0 flex-1 overflow-y-auto overscroll-contain p-4 space-y-4">
      <div v-if="spell.mechanics_reviewed === false || !castEffects.length" class="rounded border border-tone-caution/30 bg-tone-caution/10 p-3">
        <p class="text-caption font-semibold text-ink-caution">Roll this one by hand</p>
        <p class="text-body text-muted-foreground">Grimoire can't roll this spell's effects for you. Read its description and roll the dice yourself.</p>
      </div>

      <template v-else>
        <div v-for="choice in typeChoices" :key="choice.id" class="space-y-1">
          <p :id="`damage-type-${choice.id}`" class="text-label-lg text-muted-foreground">Damage type</p>
          <SegmentedControl
            v-if="choice.options.length <= 6"
            :model-value="pickedTypes[choice.id] ?? NO_TYPE"
            :options="choice.options.map((type) => ({ value: type, label: typeLabel(type) }))"
            :aria-labelledby="`damage-type-${choice.id}`"
            wrap
            gap="loose"
            @update:model-value="pickedTypes[choice.id] = $event"
          />
          <AppSelect
            v-else
            :model-value="pickedTypes[choice.id] ?? NO_TYPE"
            aria-label="Damage type"
            tone="default"
            size="body"
            weight="normal"
            @update:model-value="pickedTypes[choice.id] = String($event)"
          >
            <option value="" disabled>Pick a damage type</option>
            <option v-for="type in choice.options" :key="type" :value="type">{{ typeLabel(type) }}</option>
          </AppSelect>
        </div>

        <label v-if="!instance" class="block text-label-lg text-muted-foreground">
          Targets
          <AppInput v-model.number="targetCount" type="number" min="1" max="20" size="body-xs" :block="false" class="ml-2 w-16" />
        </label>

        <div class="space-y-2">
          <div v-for="target in targets" :key="target.id" :class="instance ? 'grid grid-cols-[auto_1fr_auto] items-center gap-2' : 'grid grid-cols-[1fr_auto] gap-2'">
            <span v-if="instance" class="text-label-lg text-muted-foreground tabular-nums">{{ rowLabel(target.id) }}</span>
            <AppInput
              v-model="target.name"
              :aria-label="instance ? `${rowLabel(target.id)} target name` : `Target ${target.id} name`"
              size="body-xs"
              class="min-w-0"
              :placeholder="instance ? 'Aimed at' : `Target ${target.id}`"
            />
            <AppSelect v-if="outcomeOptions.length > 1" v-model="target.outcome" :aria-label="instance ? `${rowLabel(target.id)} outcome` : `Target ${target.id} outcome`" tone="default" size="body" weight="normal">
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
        <ul v-if="reminders.length" class="list-disc space-y-1 pl-5 text-body text-ink-arcane">
          <li v-for="reminder in reminders" :key="reminder">{{ reminder }}</li>
        </ul>

        <AppButton
          variant="primary"
          size="lg"
          block
          :disabled="resolving || !typesPicked"
          :label="resolving ? 'Resolving…' : typesPicked ? `Resolve ${phaseLabel(selectedPhase)}` : 'Pick a damage type'"
          @click="resolveSelectedPhase"
        />
      </template>
    </div>
  </AppModal>
</template>

<script setup lang="ts">
import { computed, ref, watch } from "vue";
import type { Spell, SpellOutcome, StructuredSpellEffect } from "@/types/spell.types";
import { effectsForCast, resolveSpellEffects } from "@/rules/spellEffects";
import { groupSpellRolls, type ResolvedSpellEffect } from "@/rules/spellEffectRolls";
import { parseExpression } from "@/lib/dice/dice";
import { rollParsed } from "@/lib/dice/roller";
import { useCampaignMessages } from "@/composables/campaign/useCampaignMessages";
import { useChatSendFailure } from "@/composables/campaign/chatSendErrors";
import { useToast } from "@/composables/useToast";
import { metamagicReminders, metamagicTargetBonus } from "@/rules/metamagicPolicy";
import { useRuleset } from "@/composables/rules/useRuleset";
import AppButton from "@/components/common/controls/AppButton.vue";
import AppInput from "@/components/common/controls/AppInput.vue";
import AppModal from "@/components/common/overlays/AppModal.vue";
import AppSelect from "@/components/common/controls/AppSelect.vue";
import SegmentedControl from "@/components/common/controls/SegmentedControl.vue";
import ModalHeader from "@/components/common/overlays/ModalHeader.vue";

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
const { reportChatFailure } = useChatSendFailure();
const toast = useToast();
const { ruleset } = useRuleset();
const targetCount = ref(1);
const targets = ref<Array<{ id: number; name: string; outcome: SpellOutcome }>>([]);
const selectedPhase = ref<StructuredSpellEffect["phase"]>("impact");
const resolving = ref(false);

/** SegmentedControl and the select need a string for "nothing picked yet". */
const NO_TYPE = "";
const pickedTypes = ref<Record<string, string>>({});
const cast = computed(() => effectsForCast(
  spell?.effects ?? [],
  spell?.level ?? 0,
  castLevel,
  characterLevel,
));
// A damage type picked at cast (Chromatic Orb) becomes the effect's own type, so
// rolls group by it and labels carry it. `damageTypeOverride` stays label-only.
// A save-for-half twin deals the same damage, so it follows its base effect's pick (Spirit Guardians).
const choiceKey = (effect: StructuredSpellEffect): string => effect.id.replace(/-save-half$/, "");
const castEffects = computed(() => cast.value.map((effect) => {
  const picked = pickedTypes.value[choiceKey(effect)];
  return effect.damageTypeChoices?.length && picked ? { ...effect, damageType: picked } : effect;
}));
const typeChoices = computed(() => {
  const byKey = new Map<string, string[]>();
  for (const effect of cast.value) {
    if (effect.damageTypeChoices?.length && !byKey.has(choiceKey(effect))) byKey.set(choiceKey(effect), effect.damageTypeChoices);
  }
  return [...byKey].map(([id, options]) => ({ id, options }));
});
const typesPicked = computed(() => typeChoices.value.every((choice) => !!pickedTypes.value[choice.id]));
// Rays, darts and beams: the rows are the instances, not targets.
const instance = computed(() => castEffects.value.find((effect) => effect.instances)?.instances ?? null);
const capitalize = (word: string): string => `${word.charAt(0).toUpperCase()}${word.slice(1)}`;
const typeLabel = capitalize;
function rowLabel(id: number): string {
  return instance.value ? `${capitalize(instance.value.noun)} ${id}` : `Target ${id}`;
}
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
  pickedTypes.value = {};
  targetCount.value = Math.min(20, Math.max(1, ...castEffects.value.map((effect) => effect.target.count ?? 1)) + metamagicTargetBonus(metamagicNames));
  selectedPhase.value = phases.value.includes("impact") ? "impact" : (phases.value[0] ?? "impact");
}, { immediate: true });
watch([targetCount, outcomeOptions, instance], () => {
  // A cleared or non-numeric count field falls back to one target.
  const count = Math.min(20, Math.max(1, instance.value ? instance.value.count : (targetCount.value || 1)));
  const first = outcomeOptions.value[0]?.value ?? "automatic";
  // A row kept from before the spell loaded (or from another spell) may hold an
  // outcome this spell cannot have, which left the picker blank and resolved nothing.
  targets.value = Array.from({ length: count }, (_, index) => {
    const kept = targets.value[index];
    if (!kept) return { id: index + 1, name: "", outcome: first };
    return outcomeOptions.value.some((option) => option.value === kept.outcome) ? kept : { ...kept, outcome: first };
  });
}, { immediate: true });

const phaseSummary = computed(() => {
  const effects = castEffects.value.filter((effect) => effect.phase === selectedPhase.value);
  if (!effects.length) return "No structured effects occur in this phase.";
  // A save-for-half twin is the same roll, said once: "3d8 radiant damage, half on a successful save".
  const halved = new Set(effects.filter((effect) => effect.id.endsWith("-save-half")).map(choiceKey));
  return effects
    .filter((effect) => !effect.id.endsWith("-save-half"))
    .map((effect) => {
      const text = [effect.dice, damageTypeOverride ?? effect.damageType, effect.kind, effect.description].filter(Boolean).join(" ");
      return halved.has(effect.id) ? `${text}, half on a successful save` : text;
    })
    .join("; ");
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
    const names = new Map(targets.value.map((target) => {
      const typed = target.name.trim();
      const label = instance.value ? (typed ? `${rowLabel(target.id)} → ${typed}` : rowLabel(target.id)) : (typed || `Target ${target.id}`);
      return [String(target.id), label];
    }));
    const resolved = resolveSpellEffects(castEffects.value, selectedPhase.value, outcomes, {
      carefulPreventsDamage: ruleset.value === "2024",
    });
    if (!resolved.length) {
      toast.info("No structured effect applies to the selected outcomes.");
      return;
    }
    // One roll per distinct group, shared by every target in it (PHB 2014 "Damage Rolls").
    const shared = new Map<string, { total: number; breakdown: ReturnType<typeof rollParsed>["breakdown"]; modifier: number }>();
    const groups = groupSpellRolls(resolved);
    for (const group of groups) {
      const parsed = parseExpression(group.dice);
      if (!parsed) throw new Error(`Unsupported dice expression: ${group.dice}`);
      const abilityModifier = group.modifier === "spellcasting_ability" ? spellcastingModifier : (group.modifier ?? 0);
      const modifier = parsed.modifier + abilityModifier;
      const rolled = rollParsed({ ...parsed, modifier });
      shared.set(group.key, { total: rolled.total, breakdown: rolled.breakdown, modifier });
    }
    const groupOf = new Map<ResolvedSpellEffect, string>();
    for (const group of groups) for (const entry of group.entries) groupOf.set(entry, group.key);
    for (const entry of resolved) {
      const { targetId, effect } = entry;
      const target = names.get(targetId) ?? targetId;
      const key = groupOf.get(entry);
      const roll = key === undefined ? undefined : shared.get(key);
      if (effect.dice && roll) {
        const total = Math.floor(roll.total * effect.multiplier);
        const damageType = damageTypeOverride ?? effect.damageType;
        const label = `${spell.name} · ${target}: ${effect.kind}${damageType ? ` (${damageType})` : ""}${effect.multiplier === 0.5 ? " · successful save, half" : ""}`;
        await sendRoll({ total, label, modifier: roll.modifier, breakdown: roll.breakdown, isCrit: outcomes[targetId] === "critical_hit", isFumble: false, isDamage: effect.kind === "damage" }).catch((e) => reportChatFailure(e, "post the roll to the chat"));
      } else if (effect.condition || effect.description) {
        await sendFlavorMessage(`${target}: ${effect.condition ?? effect.description}`, spell.name).catch((e) => reportChatFailure(e, "post the effect to the chat"));
      }
    }
  } catch (error) {
    toast.error(toast.fromError(error));
  } finally {
    resolving.value = false;
  }
}
</script>
