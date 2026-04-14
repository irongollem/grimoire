<template>
  <div class="space-y-4">
    <p class="font-fell text-sm text-muted-foreground">
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
              class="font-cinzel text-[9px] tracking-widest text-emerald-400/80 uppercase"
            >active</span>
          </div>
          <p class="font-fell text-xs text-muted-foreground mt-0.5">{{ def.summary }}</p>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from "vue";
import { listOptionalRules } from "@/rules/optionalRules";
import { useOptionalRules, useToggleOptionalRule, isRuleEffectivelyEnabled } from "@/composables/useOptionalRules";

const allRules = listOptionalRules();
const { data: campaignRules } = useOptionalRules();
const { mutateAsync: toggleRule } = useToggleOptionalRule();

const toggling = ref<string | null>(null);

function isEnabled(ruleKey: string): boolean {
  return isRuleEffectivelyEnabled(campaignRules.value, ruleKey);
}

async function toggle(ruleKey: string) {
  toggling.value = ruleKey;
  try {
    await toggleRule({ ruleKey, enabled: !isEnabled(ruleKey) });
  } finally {
    toggling.value = null;
  }
}
</script>
