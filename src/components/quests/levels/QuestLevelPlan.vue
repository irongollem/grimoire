<template>
  <section aria-label="Level plan" class="flex flex-col gap-3.5 rounded-md border border-border bg-card px-4 py-3.5 md:px-5">
    <div class="flex flex-wrap items-center gap-x-3.5 gap-y-1">
      <span class="text-eyebrow text-muted-foreground">Levels</span>
      <span class="text-body">
        <template v-if="xpLevelling">By experience</template>
        <template v-else-if="partyLevel !== null">The party is <strong>level {{ partyLevel }}</strong></template>
        <template v-else>No party level set yet</template>
        <template v-if="folded && nextMilestone"> · next: level {{ nextMilestone.level }}, {{ doneOf(nextMilestone) }} of {{ nextMilestone.needs }} done</template>
      </span>
      <!-- Kept together, so a narrow screen wraps the line before them and never strands the fold on its own. -->
      <div class="ml-auto flex items-center gap-2">
        <AppButton v-if="!xpLevelling" to="/party" variant="link" size="inline-caption" label="Edit levels" />
        <AppButton
          variant="ghost"
          size="icon-sm"
          :icon="folded ? IconChevronDown : IconChevronUp"
          :aria-label="folded ? 'Open the level plan' : 'Fold the level plan'"
          :aria-expanded="!folded"
          @click="folded = !folded"
        />
      </div>
    </div>

    <template v-if="!folded">
      <QuestLevelExperience v-if="xpLevelling" :party="party ?? []" :quests="quests ?? []" />

      <div v-else class="grid gap-4 md:grid-cols-[0.7fr_1.4fr_1.2fr_1fr]">
        <div v-if="stations.reached" class="hidden flex-col gap-1.5 rounded-md border border-border/60 p-3 text-muted-foreground md:flex">
          <span class="text-heading-sm font-semibold">Level {{ stations.reached.level }}</span>
          <span class="text-caption">Reached</span>
          <span v-if="stations.reached.note" class="text-caption italic">{{ stations.reached.note }}</span>
        </div>
        <div v-else class="hidden md:block" aria-hidden="true" />

        <QuestLevelStation v-if="nextMilestone" :milestone="nextMilestone" next>
          <QuestLevelFlags
            v-if="party && party.length"
            :quest-ids="questIdsOf(nextMilestone)"
            :level="nextMilestone.level"
            :party-ids="party.map((m) => m.id)"
          />
        </QuestLevelStation>

        <QuestLevelStation v-if="afterNext" :milestone="afterNext" :class="showLater ? 'flex' : 'hidden md:flex'" />

        <div
          v-if="stations.open !== null"
          class="flex-col gap-1.5 rounded-md border border-dashed border-input p-3 text-muted-foreground"
          :class="showLater || !nextMilestone ? 'flex' : 'hidden md:flex'"
        >
          <span class="text-heading-sm font-semibold">Level {{ stations.open }}</span>
          <span class="text-body">No milestone yet.</span>
          <AppButton to="/party" variant="link" size="inline-caption" label="Set one" class="self-start" />
        </div>

        <!-- A phone shows the next level; the later ones open below it (canvas frame 03). -->
        <AppButton
          v-if="nextMilestone && (afterNext || stations.open !== null) && !showLater"
          variant="link"
          size="inline-caption"
          class="justify-self-start md:hidden"
          :label="laterLabel"
          @click="showLater = true"
        />
      </div>
    </template>
  </section>
</template>

<script setup lang="ts">
import { computed, ref } from "vue";
import { IconChevronDown, IconChevronUp } from "@/lib/icons";
import AppButton from "@/components/common/controls/AppButton.vue";
import QuestLevelStation from "./QuestLevelStation.vue";
import QuestLevelFlags from "./QuestLevelFlags.vue";
import QuestLevelExperience from "./QuestLevelExperience.vue";
import { useIsRuleEnabled } from "@/composables/rules/useOptionalRules";
import { useLevelMilestones, type LevelMilestone } from "@/composables/party/useLevelMilestones";
import { useActiveParty } from "@/composables/party/useActiveParty";
import { useQuests } from "@/composables/quests/useQuests";
import { useCampaignStore } from "@/stores/campaign";
import { useQuestsUiStore } from "@/stores/ui/quests";
import { levelStations } from "@/lib/quests/levelPlan";

/**
 * The Level Plan on the Quests page (#1021 row 27; canvas "Level Plan", frames 01 to 03, approved 19 Nov 2026): where
 * the party is, what its next levels wait on, and which prepared fight will be wrong for the level it will have by
 * then. It reads the milestones the Party page's Levels card sets (or the quests' worth, by experience) and edits
 * nothing. The DM's alone: the parent mounts it only for the DM.
 */
const campaign = useCampaignStore();
const questsUi = useQuestsUiStore();
const xpLevelling = useIsRuleEnabled("xp_levelling");
const { data: milestones } = useLevelMilestones();
const { data: quests } = useQuests();

const partyLevel = computed(() => campaign.activeCampaign?.party_level ?? null);
const stations = computed(() => levelStations(milestones.value ?? [], partyLevel.value));
const nextMilestone = computed(() => stations.value.upcoming[0] ?? null);
const afterNext = computed(() => stations.value.upcoming[1] ?? null);

// The party is read only where it is used: by experience, or for the next milestone's fight warnings.
const { data: party } = useActiveParty(() => xpLevelling.value || nextMilestone.value !== null);

const folded = computed({
  get: () => (campaign.activeCampaignId ? questsUi.levelPlanFoldedFor(campaign.activeCampaignId).value : false),
  set: (value: boolean) => {
    if (campaign.activeCampaignId) questsUi.levelPlanFoldedFor(campaign.activeCampaignId).value = value;
  },
});
const showLater = ref(false);
const laterLabel = computed(() => {
  const levels = [afterNext.value?.level, stations.value.open].filter((n): n is number => n !== null && n !== undefined);
  return levels.length === 2 ? `Levels ${levels[0]} and ${levels[1]}` : `Level ${levels[0]}`;
});

function doneOf(m: LevelMilestone): number {
  return Math.min(m.items.filter((i) => i.done).length, m.needs);
}

/** The quests a milestone waits on: whole quests, and the quests of its objectives (their fights are those quests'). */
function questIdsOf(m: LevelMilestone): string[] {
  return [...new Set(m.items.flatMap((i) => (i.inQuestId === null ? [] : [i.inQuestId])))];
}
</script>
