<template>
  <div class="space-y-6 pb-8">
    <!-- Header row -->
    <div class="flex items-start justify-between gap-4">
      <div>
        <h1 class="font-cinzel text-xl font-bold text-foreground">Choose a Background</h1>
        <p v-if="headerDescription" class="font-fell text-sm text-muted-foreground italic mt-1">
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
            <h2 class="font-cinzel text-lg font-bold text-foreground">{{ pendingBg.name }}</h2>
            <p v-if="pendingBg.feature_name" class="font-fell text-sm italic text-muted-foreground mt-0.5">
              {{ pendingBg.feature_name }}
            </p>
          </div>

          <!-- Proficiencies granted by the new background -->
          <div v-if="propsToApply.length > 0">
            <p class="font-cinzel text-[10px] font-semibold text-muted-foreground tracking-wider mb-2">
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
          <p v-else class="font-fell text-sm text-muted-foreground italic">
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
            <ul class="font-fell text-xs text-muted-foreground list-disc pl-4 space-y-0.5">
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
import BackgroundList from "@/components/backgrounds/BackgroundList.vue";
import ListFilterBar from "@/components/common/ListFilterBar.vue";
import ListSearchInput from "@/components/common/ListSearchInput.vue";
import ListFilterGroup from "@/components/common/ListFilterGroup.vue";
import {
  applyBackgroundProfs,
  computeRemovals,
  removeBackgroundProfs,
  type BgRemovalState,
} from "@/lib/backgroundProficiencies";
import { SKILLS } from "@/types/party.types";
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
    await update({
      id: me.value.id,
      update: {
        background_id: pendingBg.value.id,
        skill_proficiencies: form.skill_proficiencies,
        tool_proficiencies: form.tool_proficiencies,
        languages: form.languages,
      },
    });
    router.push("/play");
  } finally {
    saving.value = false;
  }
}
</script>
