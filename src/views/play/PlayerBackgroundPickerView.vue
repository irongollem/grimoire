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
      <RouterLink
        to="/play"
        class="shrink-0 inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 font-cinzel text-xs font-semibold text-muted-foreground hover:text-foreground transition-colors"
      >
        ← Back
      </RouterLink>
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

    <!-- Confirmation panel (bottom sheet) -->
    <Teleport to="body">
      <div v-if="pendingBg" class="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4">
        <div class="absolute inset-0 bg-black/60" @click="cancel" />
        <div class="relative z-10 w-full max-w-md rounded-xl border border-border bg-background shadow-2xl p-6 space-y-4">
          <div>
            <h2 class="text-heading font-bold text-foreground">{{ pendingBg.name }}</h2>
            <p v-if="pendingBg.feature_name" class="text-body italic text-muted-foreground mt-0.5">
              {{ pendingBg.feature_name }}
            </p>
          </div>

          <!-- Ability score increase (2024 PHB) -->
          <BackgroundAsiPicker
            v-if="is2024 && pendingBg.asi_ability_trio"
            v-model="pendingAsiChoice"
            :trio="pendingBg.asi_ability_trio"
          />

          <!-- Origin feat grant (2024 PHB) -->
          <BackgroundOriginFeatBadge
            v-if="is2024 && pendingBg.origin_feat"
            :origin-feat="pendingBg.origin_feat"
          />

          <!-- Feat grant (legacy free-text display, kept for backgrounds without a structured origin_feat) -->
          <div v-else-if="pendingBg.feat_grant_name"
            class="rounded-md border border-amber-500/30 bg-amber-500/5 p-3 space-y-1">
            <div class="flex items-center gap-2">
              <p class="text-eyebrow md:text-sm font-semibold text-amber-600 dark:text-amber-400">
                FEAT GRANT
              </p>
              <span class="text-eyebrow text-amber-600/60 dark:text-amber-400/60">2024 PHB</span>
            </div>
            <p class="font-cinzel text-sm font-bold text-foreground">{{ pendingBg.feat_grant_name }}</p>
          </div>

          <!-- Proficiencies granted by the new background -->
          <div v-if="propsToApply.length > 0">
            <p class="text-eyebrow md:text-sm font-semibold text-muted-foreground mb-2">
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
              <button
                type="button"
                class="px-3 py-1.5 rounded-md font-cinzel text-xs font-semibold border transition-colors"
                :class="removeOld ? 'bg-amber-600 text-white border-amber-600' : 'border-border text-muted-foreground hover:text-foreground'"
                @click="removeOld = true"
              >
                Yes, remove them
              </button>
              <button
                type="button"
                class="px-3 py-1.5 rounded-md font-cinzel text-xs font-semibold border transition-colors"
                :class="!removeOld ? 'bg-card text-foreground border-primary' : 'border-border text-muted-foreground hover:text-foreground'"
                @click="removeOld = false"
              >
                Keep all
              </button>
            </div>
          </div>

          <!-- Action buttons -->
          <div class="flex gap-3 pt-2">
            <button
              type="button"
              class="flex-1 px-4 py-2 font-cinzel text-xs font-semibold border border-border rounded-md text-muted-foreground hover:text-foreground transition-colors"
              @click="cancel"
            >
              Cancel
            </button>
            <button
              type="button"
              :disabled="saving"
              class="flex-1 px-4 py-2 font-cinzel text-xs font-semibold bg-primary text-primary-foreground rounded-md hover:opacity-90 transition-opacity disabled:opacity-50"
              @click="confirm"
            >
              {{ saving ? "Saving…" : "Confirm & Apply" }}
            </button>
          </div>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from "vue";
import { useRouter } from "vue-router";
import { useAuthStore } from "@/stores/auth";
import { useUiStore } from "@/stores/ui";
import { useParty, useUpdatePartyMember } from "@/composables/useParty";
import { useBackgrounds } from "@/composables/useBackgrounds";
import { useAllFeatures } from "@/composables/useFeatures";
import { useRuleset } from "@/composables/useRuleset";
import BackgroundList from "@/components/backgrounds/BackgroundList.vue";
import BackgroundAsiPicker from "@/components/backgrounds/BackgroundAsiPicker.vue";
import BackgroundOriginFeatBadge from "@/components/backgrounds/BackgroundOriginFeatBadge.vue";
import ListFilterBar from "@/components/common/ListFilterBar.vue";
import ListSearchInput from "@/components/common/ListSearchInput.vue";
import ListFilterGroup from "@/components/common/ListFilterGroup.vue";
import {
  applyBackgroundProfs,
  computeRemovals,
  removeBackgroundProfs,
  type BgRemovalState,
} from "@/lib/backgroundProficiencies";
import {
  abilityBonusesForChoice, parseBackgroundAsiChoice, resolveOriginFeat,
  type BackgroundAsiChoice,
} from "@/lib/backgroundAsi";
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
const { data: party } = useParty();
const { mutateAsync: update } = useUpdatePartyMember();
const { data: allFeatures } = useAllFeatures();
const { is2024 } = useRuleset();

// Resolve the party member: real player uses linkedPartyMemberId; DM preview uses dmPreviewPartyMemberId
const resolvedMemberId = computed(() =>
  ui.dmPreviewMode ? ui.dmPreviewPartyMemberId : auth.linkedPartyMemberId,
);
const me = computed(() => party.value?.find((m) => m.id === resolvedMemberId.value) ?? null);

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
  if (!me.value || !pendingBg.value) return;
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
    // semantics); background_feat_id links it to an imported feat when resolvable.
    const existingChoices = { ...me.value.class_choices } as Record<string, unknown>;
    if (pendingBg.value.feat_grant_name) {
      const resolved = resolveOriginFeat(pendingBg.value.origin_feat, allFeatures.value ?? []);
      existingChoices.background_feat = pendingBg.value.feat_grant_name;
      existingChoices.background_feat_id = resolved?.feature?.id ?? null;
    } else {
      delete existingChoices.background_feat;
      delete existingChoices.background_feat_id;
    }
    if (is2024.value && pendingBg.value.asi_ability_trio && pendingAsiChoice.value) {
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
      id: me.value.id,
      update: {
        background_id: pendingBg.value.id,
        skill_proficiencies: form.skill_proficiencies,
        tool_proficiencies: form.tool_proficiencies,
        languages: form.languages,
        class_choices: updatedChoices,
        ...scores,
      },
    });
    router.push("/play");
  } finally {
    saving.value = false;
  }
}
</script>
