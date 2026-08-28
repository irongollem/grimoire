<template>
  <div class="space-y-6 pb-8">
    <!-- Header row -->
    <div class="flex items-start justify-between gap-4">
      <div>
        <h1 class="text-heading-lg font-bold text-foreground">Choose a Background</h1>
        <p v-if="headerDescription" class="text-body text-muted-foreground italic mt-1">
          {{ headerDescription }}
        </p>
      </div>
      <AppButton to="/play" variant="subtle" size="sm" label="← Back" />
    </div>

    <!-- Filter bar -->
    <ListFilterBar
      :has-active-filters="ui.backgroundsHasActiveFilters"
      @clear="ui.resetBackgroundsFilters()"
    >
      <ListSearchInput v-model="ui.backgroundsSearch" placeholder="Search backgrounds…" />
      <ListFilterGroup
        v-model="ui.backgroundsFilterSource"
        :options="BG_SOURCE_OPTIONS"
        aria-label="Background source filter"
      />
    </ListFilterBar>

    <!-- Background grid -->
    <BackgroundList :select-mode="true" :readonly="true" :selected-id="currentBgId || undefined" @select="onSelect" />

    <!-- Confirmation panel -->
    <AppModal :open="!!pendingBg" size="md" align="sheet" @close="cancel">
      <ModalHeader
        :title="pendingBg?.name ?? ''"
        :subtitle="pendingBg?.feature_name ?? undefined"
      />

      <!-- Scrolls because the shell caps the panel at the viewport, where the old
           hand-rolled panel simply overflowed it. -->
      <div class="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-4 space-y-4">
        <!-- Ability score increase (2024 PHB) -->
        <BackgroundAsiPicker
          v-if="is2024 && pendingBg?.asi_ability_trio"
          v-model="pendingAsiChoice"
          :trio="pendingBg.asi_ability_trio"
        />

        <!-- Origin feat grant (2024 PHB) -->
        <BackgroundOriginFeatBadge
          v-if="is2024 && pendingBg?.origin_feat"
          :origin-feat="pendingBg.origin_feat"
        />

        <!-- Feat grant (legacy free-text display, kept for backgrounds without a structured origin_feat) -->
        <div v-else-if="pendingBg?.feat_grant_name"
          class="rounded-md border border-amber-500/30 bg-amber-500/5 p-3 space-y-1">
          <div class="flex items-center gap-2">
            <p class="text-eyebrow font-semibold text-amber-600 dark:text-amber-400">
              FEAT GRANT
            </p>
            <span class="text-eyebrow text-amber-600/60 dark:text-amber-400/60">2024 PHB</span>
          </div>
          <p class="font-cinzel text-sm font-bold text-foreground">{{ pendingBg.feat_grant_name }}</p>
        </div>

        <!-- Proficiencies granted by the new background -->
        <div v-if="propsToApply.length > 0">
          <p class="text-eyebrow font-semibold text-muted-foreground mb-2">
            PROFICIENCIES GRANTED
          </p>
          <div class="flex flex-wrap gap-1.5">
            <span
              v-for="p in propsToApply"
              :key="p"
              class="px-2 py-0.5 rounded-full bg-primary/10 font-cinzel text-xs text-primary"
            >
              {{ p }}
            </span>
          </div>
        </div>
        <p v-else class="text-body text-muted-foreground italic">
          Your character already has all proficiencies from this background.
        </p>

        <!-- Removal offer when swapping from an existing background -->
        <div
          v-if="pendingRemovals"
          class="rounded-md border border-amber-500/30 bg-amber-500/10 p-3 space-y-2"
        >
          <p class="font-cinzel text-xs font-semibold text-amber-600 dark:text-amber-400">
            Remove {{ pendingRemovals.prevBgName }}'s proficiencies that don't carry over?
          </p>
          <ul class="text-caption text-muted-foreground list-disc pl-4 space-y-0.5">
            <li v-for="s in pendingRemovals.skillLabels" :key="s">{{ s }}</li>
            <li v-for="t in pendingRemovals.tools" :key="t">{{ t }}</li>
            <li v-for="l in pendingRemovals.languages" :key="l">{{ l }}</li>
          </ul>
          <div class="flex gap-2 pt-1">
            <AppButton
              variant="subtle"
              size="sm"
              :active="removeOld"
              label="Yes, remove them"
              :class="removeOld ? 'border-amber-600 bg-amber-600 text-white hover:bg-amber-600 hover:text-white' : ''"
              @click="removeOld = true"
            />
            <AppButton
              variant="subtle"
              size="sm"
              :active="!removeOld"
              label="Keep all"
              @click="removeOld = false"
            />
          </div>
        </div>
      </div>

      <!-- Action buttons -->
      <div class="shrink-0 px-5 pb-5">
        <p v-if="asiChoiceIncomplete" class="text-caption text-amber-600 dark:text-amber-400 italic mb-2">
          Finish the ability score choice above, or clear it, before confirming.
        </p>
        <div class="flex gap-3">
          <AppButton variant="subtle" size="md" class="flex-1" label="Cancel" @click="cancel" />
          <AppButton
            variant="primary"
            size="md"
            class="flex-1"
            :label="saving ? 'Saving…' : 'Confirm & Apply'"
            :disabled="saving || asiChoiceIncomplete"
            @click="confirm"
          />
        </div>
      </div>
    </AppModal>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from "vue";
import { useRouter } from "vue-router";
import { useQueryClient } from "@tanstack/vue-query";
import { useAuthStore } from "@/stores/auth";
import { useUiStore } from "@/stores/ui";
import { useParty, useUpdatePartyMember } from "@/composables/party/useParty";
import { useBackgrounds } from "@/composables/rules/useBackgrounds";
import { useRuleset } from "@/composables/rules/useRuleset";
import { useRulesetReviews, useAcknowledgeRulesetReviews } from "@/composables/play/useRulesetReviews";
import BackgroundList from "@/components/backgrounds/BackgroundList.vue";
import BackgroundAsiPicker from "@/components/backgrounds/BackgroundAsiPicker.vue";
import BackgroundOriginFeatBadge from "@/components/backgrounds/BackgroundOriginFeatBadge.vue";
import AppButton from "@/components/common/AppButton.vue";
import AppModal from "@/components/common/AppModal.vue";
import ModalHeader from "@/components/common/ModalHeader.vue";
import ListFilterBar from "@/components/common/ListFilterBar.vue";
import ListSearchInput from "@/components/common/ListSearchInput.vue";
import ListFilterGroup from "@/components/common/ListFilterGroup.vue";
import {
  applyBackgroundProfs,
  computeRemovals,
  removeBackgroundProfs,
  type BgRemovalState,
} from "@/rules/backgroundProficiencies";
import {
  abilityBonusesForChoice, isValidAsiChoice, parseBackgroundAsiChoice,
  type BackgroundAsiChoice,
} from "@/rules/backgroundAsi";
import { SKILLS } from "@/types/party.types";
import type { SaveKey } from "@/types/party.types";
import type { Background } from "@/types/background.types";

const BG_SOURCE_OPTIONS = [
  { value: "all", label: "All" },
  { value: "custom", label: "Custom" },
  { value: "open5e", label: "Open5e" },
] as const;

const router = useRouter();
const auth = useAuthStore();
const ui = useUiStore();
const queryClient = useQueryClient();
const { data: party } = useParty();
const { mutateAsync: update } = useUpdatePartyMember();
const { is2024 } = useRuleset();

// Resolve the party member: real player uses linkedPartyMemberId; DM preview uses dmPreviewPartyMemberId
const resolvedMemberId = computed(() =>
  ui.dmPreviewMode ? ui.dmPreviewPartyMemberId : auth.linkedPartyMemberId,
);
const me = computed(() => party.value?.find((m) => m.id === resolvedMemberId.value) ?? null);
const { data: rulesetReviews } = useRulesetReviews(resolvedMemberId);
const { mutateAsync: acknowledgeRulesetReviews } = useAcknowledgeRulesetReviews();

const currentBgId = computed(() => me.value?.background_id ?? "");
const { data: allBackgrounds } = useBackgrounds();
const currentBg = computed(() => allBackgrounds.value?.find((b) => b.id === currentBgId.value) ?? null);

const headerDescription = computed(() => {
  if (!me.value) return null;
  const bgName = currentBg.value?.name;
  return bgName
    ? `${me.value.name} — currently: ${bgName}`
    : `${me.value.name} — no background selected`;
});

// ── Confirmation panel state ──────────────────────────────────────────────────

const pendingBg = ref<Background | null>(null);
const pendingRemovals = ref<BgRemovalState | null>(null);
const removeOld = ref(false);
const saving = ref(false);
/** 2024 ASI choice for the pending background — reset whenever the selection changes. */
const pendingAsiChoice = ref<BackgroundAsiChoice | null>(null);

/** Proficiencies the new background will add (that the member doesn't already have). */
const propsToApply = computed(() => {
  if (!pendingBg.value || !me.value) return [];
  const result: string[] = [];
  for (const skill of pendingBg.value.skill_proficiencies ?? []) {
    const def = SKILLS.find((s) => s.label.toLowerCase() === skill.toLowerCase());
    if (def && (me.value!.skill_proficiencies[def.key] ?? "none") === "none") {
      result.push(def.label);
    }
  }
  for (const tool of pendingBg.value.tool_proficiencies ?? []) {
    if (!me.value!.tool_proficiencies.includes(tool)) result.push(tool);
  }
  for (const lang of pendingBg.value.languages ?? []) {
    if (!me.value!.languages.includes(lang)) result.push(lang);
  }
  return result;
});

/**
 * True when the pending 2024 ASI choice has been started (a mode picked) but
 * isn't yet a valid, complete choice — e.g. only a +2 ability picked so far.
 * An untouched choice (null) is a deliberate "skip" and is never incomplete.
 */
const asiChoiceIncomplete = computed(() => {
  if (!is2024.value || !pendingBg.value?.asi_ability_trio) return false;
  return pendingAsiChoice.value !== null
    && !isValidAsiChoice(pendingAsiChoice.value, pendingBg.value.asi_ability_trio);
});

function onSelect(bg: Background) {
  pendingBg.value = bg;
  removeOld.value = false;
  pendingAsiChoice.value = null;
  if (currentBg.value && me.value) {
    pendingRemovals.value = computeRemovals(me.value, currentBg.value, bg);
  } else {
    pendingRemovals.value = null;
  }
}

function cancel() {
  pendingBg.value = null;
  pendingRemovals.value = null;
  removeOld.value = false;
  pendingAsiChoice.value = null;
}

async function confirm() {
  if (!me.value || !pendingBg.value || asiChoiceIncomplete.value) return;
  const memberId = me.value.id;
  const hadReviewFlag = (rulesetReviews.value ?? []).some((r) => r.flag_type === "background");
  saving.value = true;
  try {
    const form = {
      skill_proficiencies: { ...me.value.skill_proficiencies },
      tool_proficiencies: [...me.value.tool_proficiencies],
      languages: [...me.value.languages],
    };
    applyBackgroundProfs(form, pendingBg.value);
    if (removeOld.value && pendingRemovals.value) {
      removeBackgroundProfs(form, pendingRemovals.value);
    }
    // Update class_choices.background_feat / background_asi to reflect the newly
    // selected background. background_feat stays the raw display name (unchanged
    // semantics) — the origin feat itself is resolved live at display time.
    const existingChoices = { ...me.value.class_choices } as Record<string, unknown>;
    if (pendingBg.value.feat_grant_name) {
      existingChoices.background_feat = pendingBg.value.feat_grant_name;
    } else {
      delete existingChoices.background_feat;
    }
    // A half-made ASI choice never persists — the Confirm button is disabled
    // for that state, so anything left here is either complete or empty (skip).
    if (is2024.value && pendingBg.value.asi_ability_trio
      && isValidAsiChoice(pendingAsiChoice.value, pendingBg.value.asi_ability_trio)) {
      existingChoices.background_asi = pendingAsiChoice.value;
    } else {
      delete existingChoices.background_asi;
    }
    const updatedChoices = existingChoices;

    // 2024 ASI: undo the old background's applied bonus (if any), apply the new one.
    // Additive on the member's stored scores, mirroring how species ASI bakes in at
    // character creation — there's no separate "base score" to re-derive from.
    const scores: Record<SaveKey, number> = {
      str: me.value.str, dex: me.value.dex, con: me.value.con,
      int: me.value.int, wis: me.value.wis, cha: me.value.cha,
    };
    if (currentBg.value?.asi_ability_trio) {
      const oldChoice = parseBackgroundAsiChoice(me.value.class_choices?.background_asi);
      const oldBonuses = abilityBonusesForChoice(oldChoice, currentBg.value.asi_ability_trio);
      for (const [key, delta] of Object.entries(oldBonuses) as [SaveKey, number][]) {
        scores[key] = Math.max(1, scores[key] - delta);
      }
    }
    if (is2024.value && pendingBg.value.asi_ability_trio) {
      const newBonuses = abilityBonusesForChoice(pendingAsiChoice.value, pendingBg.value.asi_ability_trio);
      for (const [key, delta] of Object.entries(newBonuses) as [SaveKey, number][]) {
        scores[key] = Math.min(20, scores[key] + delta);
      }
    }

    await update({
      id: memberId,
      update: {
        background_id: pendingBg.value.id,
        skill_proficiencies: form.skill_proficiencies,
        tool_proficiencies: form.tool_proficiencies,
        languages: form.languages,
        class_choices: updatedChoices,
        ...scores,
      },
    });

    // Picking a background (even the same ruleset's) satisfies the pending
    // ruleset review — clear it so the banner doesn't linger after a save
    // that already resolved it.
    if (hadReviewFlag) {
      await acknowledgeRulesetReviews({ partyMemberId: memberId, flagTypes: ["background"] });
      await queryClient.invalidateQueries({ queryKey: ["ruleset_reviews"] });
    }

    router.push("/play");
  } finally {
    saving.value = false;
  }
}
</script>
