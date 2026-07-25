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
        <button
          type="button"
          :aria-label="isEnabled(def.key) ? `Disable ${def.name}` : `Enable ${def.name}`"
          :disabled="toggling === def.key"
          class="mt-0.5 shrink-0 w-9 h-5 rounded-full transition-colors relative focus:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
          :class="isEnabled(def.key) ? 'bg-primary' : 'bg-muted border border-border'"
          @click="toggle(def.key)"
        >
          <span
            class="absolute top-0.5 left-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform"
            :class="isEnabled(def.key) ? 'translate-x-4' : 'translate-x-0'"
          />
        </button>

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
              <input
                type="number"
                :min="field.min"
                :max="field.max"
                :value="configValue(def.key, field.key)"
                :disabled="savingConfig === def.key"
                class="w-20 bg-background border border-border rounded-md px-2 py-1 text-body text-foreground focus:outline-none focus:ring-1 focus:ring-ring disabled:opacity-50"
                @change="onConfigChange(def, field, $event)"
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
} from "@/composables/useOptionalRules";
import { useCampaignStore } from "@/stores/campaign";
import { useUpdateCampaign } from "@/composables/useCampaigns";
import { DEFAULT_RULESET, RULESET_OPTIONS, type RulesetKey } from "@/types/ruleset.types";
import type { OptionalRuleDef, RuleConfigField } from "@/types/rule.types";

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

async function onConfigChange(def: OptionalRuleDef, field: RuleConfigField, e: Event) {
  const raw = Number((e.target as HTMLInputElement).value);
  const clamped = Math.min(field.max ?? Infinity, Math.max(field.min ?? -Infinity, Math.round(raw)));
  const next = { ...resolveRuleConfig(campaignRules.value, def.key), [field.key]: clamped };
  savingConfig.value = def.key;
  try {
    await upsertRule({ ruleKey: def.key, enabled: isEnabled(def.key), config: next });
  } finally {
    savingConfig.value = null;
  }
}
</script>
