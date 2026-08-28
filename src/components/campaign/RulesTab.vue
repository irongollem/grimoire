<template>
  <div class="space-y-4">
    <section class="rounded-lg border border-border bg-card p-4 space-y-3">
      <div>
        <h2 class="font-cinzel text-sm font-semibold text-foreground">Rules edition</h2>
        <p class="text-caption text-muted-foreground mt-1">
          This campaign-wide choice governs all rules-aware features. Existing campaigns use 2014 unless changed here.
        </p>
      </div>
      <div class="grid gap-2 sm:grid-cols-2">
        <button
          v-for="option in RULESET_OPTIONS"
          :key="option.value"
          type="button"
          :disabled="savingRuleset"
          class="rounded-md border px-3 py-3 text-left transition-colors disabled:opacity-50"
          :class="selectedRuleset === option.value ? 'border-primary bg-primary/10' : 'border-border hover:bg-muted/40'"
          @click="setRuleset(option.value)"
        >
          <span class="font-cinzel text-xs font-semibold text-foreground">{{ option.label }}</span>
          <p class="text-caption text-muted-foreground mt-1">{{ option.description }}</p>
        </button>
      </div>
      <p class="text-caption text-amber-500/90">
        Changing edition can alter character progression and available content. Existing character choices are preserved for review.
      </p>
    </section>

    <p class="text-body text-muted-foreground">
      Toggle optional D&amp;D rules on or off for this campaign. Enabled rules appear in the
      Rules Reliquary for all players.
    </p>

    <div class="space-y-2">
      <div
        v-for="def in allRules"
        :key="def.key"
        class="flex items-start gap-3 rounded-md border border-border bg-card px-3 py-2.5"
      >
        <!-- Toggle -->
        <ToggleSwitch
          size="lg"
          class="mt-0.5"
          :model-value="isEnabled(def.key)"
          :aria-label="isEnabled(def.key) ? `Disable ${def.name}` : `Enable ${def.name}`"
          :disabled="toggling === def.key"
          @update:model-value="toggle(def.key)"
        />

        <!-- Rule info -->
        <div class="flex-1 min-w-0">
          <div class="flex items-center gap-2">
            <span class="font-cinzel text-xs font-semibold text-foreground">{{ def.name }}</span>
            <span
              v-if="isEnabled(def.key)"
              class="font-cinzel text-2xs tracking-widest text-emerald-400/80 uppercase"
            >active</span>
          </div>
          <p class="text-caption text-muted-foreground mt-0.5">{{ def.summary }}</p>

          <!-- Configurable parameters — shown only while the rule is enabled -->
          <div v-if="def.config && isEnabled(def.key)" class="mt-2 flex flex-wrap gap-3">
            <label
              v-for="field in def.config"
              :key="field.key"
              class="flex items-center gap-2 text-caption text-muted-foreground"
            >
              <span>{{ field.label }}</span>
              <AppInput
                v-model.lazy="fieldModel(def.key, field).value"
                type="number"
                :min="field.min"
                :max="field.max"
                size="body-xs"
                :block="false"
                class="w-20"
                :disabled="savingConfig === def.key"
              />
              <span v-if="field.unit">{{ field.unit }}</span>
            </label>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from "vue";
import { listOptionalRules } from "@/rules/optionalRules";
import {
  useOptionalRules,
  useUpsertCampaignRule,
  isRuleEffectivelyEnabled,
  resolveRuleConfig,
} from "@/composables/rules/useOptionalRules";
import { useCampaignStore } from "@/stores/campaign";
import { useUpdateCampaign } from "@/composables/campaign/useCampaigns";
import { DEFAULT_RULESET, RULESET_OPTIONS, type RulesetKey } from "@/types/ruleset.types";
import type { RuleConfigField } from "@/types/rule.types";
import AppInput from "@/components/common/AppInput.vue";
import ToggleSwitch from "@/components/common/ToggleSwitch.vue";

const allRules = listOptionalRules();
const { data: campaignRules } = useOptionalRules();
const { mutateAsync: upsertRule } = useUpsertCampaignRule();

const toggling = ref<string | null>(null);
const savingConfig = ref<string | null>(null);
const campaign = useCampaignStore();
const { mutateAsync: updateCampaign } = useUpdateCampaign();
const savingRuleset = ref(false);
const selectedRuleset = computed(() => campaign.activeCampaign?.ruleset ?? DEFAULT_RULESET);

async function setRuleset(ruleset: RulesetKey) {
  if (!campaign.activeCampaign || ruleset === selectedRuleset.value) return;
  savingRuleset.value = true;
  try {
    const updated = await updateCampaign({
      id: campaign.activeCampaign.id,
      update: { ruleset },
    });
    campaign.switchToCampaign(updated);
  } finally {
    savingRuleset.value = false;
  }
}

function isEnabled(ruleKey: string): boolean {
  return isRuleEffectivelyEnabled(campaignRules.value, ruleKey);
}

function configValue(ruleKey: string, fieldKey: string): number {
  return resolveRuleConfig(campaignRules.value, ruleKey)[fieldKey];
}

async function toggle(ruleKey: string) {
  toggling.value = ruleKey;
  try {
    // Preserve any tuned config across the on/off flip.
    const existing = (campaignRules.value ?? []).find((r) => r.rule_key === ruleKey)?.config ?? null;
    await upsertRule({ ruleKey, enabled: !isEnabled(ruleKey), config: existing });
  } finally {
    toggling.value = null;
  }
}

async function commitConfigValue(ruleKey: string, field: RuleConfigField, raw: string) {
  const clamped = Math.min(field.max ?? Infinity, Math.max(field.min ?? -Infinity, Math.round(Number(raw))));
  const next = { ...resolveRuleConfig(campaignRules.value, ruleKey), [field.key]: clamped };
  savingConfig.value = ruleKey;
  try {
    await upsertRule({ ruleKey, enabled: isEnabled(ruleKey), config: next });
  } finally {
    savingConfig.value = null;
  }
}

// AppInput requires a v-model, and `v-model.lazy` is what makes it commit on
// blur/Enter (via the `change` event) rather than per keystroke — exactly what
// the old `:value` + `@change` pair did. It needs something assignable, so each
// field gets its own writable computed bridging AppInput's string model onto the
// server-derived config value; the setter re-runs the same clamp + upsert the
// native input's @change handler used to.
function fieldModel(ruleKey: string, field: RuleConfigField) {
  return computed<string>({
    get: () => String(configValue(ruleKey, field.key)),
    set: (raw) => { void commitConfigValue(ruleKey, field, raw); },
  });
}
</script>
