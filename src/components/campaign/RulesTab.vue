<template>
  <div class="space-y-4">
    <section class="rounded-lg border border-border bg-card p-4 space-y-3">
      <div>
        <h2 class="text-heading-sm font-semibold text-foreground">Game system</h2>
        <p class="text-caption text-muted-foreground mt-1">
          The system this table plays by. Every character keeps the edition it was built with.
        </p>
      </div>
      <!-- A system compatible with another may switch to it; one compatible with nothing is fixed at creation. -->
      <GameSystemPicker
        v-if="switchable.length > 0"
        :model-value="gameSystem"
        :only="[gameSystem, ...switchable]"
        :disabled="saving"
        @update:model-value="setGameSystem"
      />
      <p v-else class="text-body text-foreground" data-testid="game-system-fixed">
        <span class="font-semibold">{{ gameSystemLabel(gameSystem) }}</span>
        <span class="text-muted-foreground"> was chosen when the campaign was created and cannot be changed.</span>
      </p>
      <p v-if="switchable.length > 0" class="text-caption text-ink-caution/90">
        Changing the system does not change anyone's character. Characters built for the other one keep their seat and are listed below.
      </p>
      <!-- Inside this section, not beside the optional rules below: it is half of
           the same decision (which system, and whether the other one may sit down). -->
      <div v-if="switchable.length > 0" class="flex items-start gap-3 border-t border-border pt-3">
        <ToggleSwitch
          size="lg"
          class="mt-0.5"
          :model-value="allowsMixed"
          :aria-label="allowsMixed ? 'Require one edition' : 'Allow both editions'"
          :disabled="saving"
          @update:model-value="setAllowsMixed"
        />
        <div class="flex-1 min-w-0">
          <div class="flex items-center gap-2">
            <span class="text-label-lg font-semibold text-foreground">Allow both editions</span>
            <span
              v-if="allowsMixed"
              class="text-eyebrow text-ink-success/80 uppercase"
            >active</span>
          </div>
          <p class="text-caption text-muted-foreground mt-0.5">
            On: characters of either edition may join and stay as they are. Off: a character built with the other edition is asked to bring a converted copy.
          </p>
        </div>
      </div>
    </section>

    <RulesEditionMismatchList
      v-if="tableEdition && mismatched.length"
      :characters="mismatched"
      :campaign-ruleset="tableEdition"
      :allows-mixed="allowsMixed"
    />

    <template v-if="offersOptionalRules">
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
            <span class="text-caption font-semibold text-foreground">{{ def.name }}</span>
            <span
              v-if="isEnabled(def.key)"
              class="text-eyebrow text-ink-success/80 uppercase"
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
    </template>
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
import {
  gameSystemEdition,
  gameSystemLabel,
  switchableGameSystems,
  systemOffers,
  type GameSystemKey,
} from "@/systems/registry";
import type { RuleConfigField } from "@/types/rule.types";
import { useParty } from "@/composables/party/useParty";
import { useToast } from "@/composables/useToast";
import type { CampaignUpdate } from "@/types/campaign.types";
import GameSystemPicker from "@/components/rules/GameSystemPicker.vue";
import RulesEditionMismatchList from "@/components/campaign/RulesEditionMismatchList.vue";
import AppInput from "@/components/common/controls/AppInput.vue";
import ToggleSwitch from "@/components/common/controls/ToggleSwitch.vue";

const allRules = listOptionalRules();
const { data: campaignRules } = useOptionalRules();
const { mutateAsync: upsertRule } = useUpsertCampaignRule();

const toggling = ref<string | null>(null);
const savingConfig = ref<string | null>(null);
const campaign = useCampaignStore();
const { mutateAsync: updateCampaign } = useUpdateCampaign();
const toast = useToast();
const { data: party } = useParty();
const saving = ref(false);
const gameSystem = computed<GameSystemKey>(() => campaign.activeGameSystem);
const switchable = computed(() => switchableGameSystems(gameSystem.value));
const tableEdition = computed(() => gameSystemEdition(gameSystem.value));
const allowsMixed = computed(() => campaign.activeCampaign?.allows_mixed_rulesets ?? false);
// The optional rules are D&D's: a system without a rules reference has none to toggle.
const offersOptionalRules = computed(() => systemOffers(gameSystem.value, "reliquary"));
const mismatched = computed(() =>
  (party.value ?? []).filter((member) => member.ruleset !== tableEdition.value),
);

async function saveCampaign(update: CampaignUpdate) {
  const active = campaign.activeCampaign;
  if (!active) return;
  saving.value = true;
  try {
    const updated = await updateCampaign({ id: active.id, update });
    campaign.switchToCampaign(updated);
  } catch (error) {
    toast.error(toast.fromError(error));
  } finally {
    saving.value = false;
  }
}

async function setGameSystem(next: GameSystemKey) {
  if (next === gameSystem.value) return;
  await saveCampaign({ game_system: next });
}

async function setAllowsMixed(value: boolean) {
  await saveCampaign({ allows_mixed_rulesets: value });
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
