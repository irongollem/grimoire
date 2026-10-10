<template>
  <div class="mx-auto w-full max-w-xl pb-8 lg:max-w-6xl">
    <header class="mb-4 px-1">
      <!-- The phone header already names the page; wider screens have no such title. -->
      <p class="hidden text-eyebrow text-muted-foreground md:block">Hearth</p>
      <h1 class="hearth-title text-heading-lg leading-tight md:text-display">{{ campaignName }}</h1>
    </header>

    <!-- DM preview with nobody picked: the same note the character sheet gives. -->
    <p
      v-if="!member && appUi.dmPreviewMode"
      class="py-12 text-center text-body italic text-muted-foreground"
    >
      Select a character above to preview their Hearth.
    </p>

    <!-- Not settled yet: a returning player must not see the welcome page flash
         before their own Hearth, nor the between-sessions page before the table. -->
    <BannerLoader v-else-if="isSettling" class="mx-auto my-12 h-8" />

    <p
      v-else-if="memberId && partyFailed"
      class="py-12 text-center text-body italic text-muted-foreground"
      role="alert"
    >
      Your character did not load. Reload to try again.
    </p>

    <HearthFirstVisit v-else-if="!member" />

    <!-- At the table. DOM order is the phone's reading order; from lg the
         three wrappers are columns: [vitals, spellcasting] [checks]
         [waiting, right now, session note]. -->
    <div v-else-if="isRunning" class="hearth-stack hearth-live">
      <HearthLiveBanner :started-at="startedAt" :member-id="member.id" :number="session?.number ?? null" :title="session?.title ?? null" />
      <div class="hearth-col">
        <HearthVitals :member="member" />
        <HearthSpellcasting :member="member" />
      </div>
      <div class="hearth-col">
        <HearthChecks :member="member" />
      </div>
      <div class="hearth-col">
        <HearthWaiting :started-at="startedAt" />
        <HearthRightNow />
        <HearthQuickNote :started-at="startedAt" />
      </div>
    </div>

    <!-- Between sessions: [date, character] [next session, new for you]
         [quests, notes], which read top to bottom as the phone order. -->
    <div v-else class="hearth-stack">
      <div class="hearth-col">
        <HearthDateStrip />
        <HearthCharacterCard :member="member" />
      </div>
      <div class="hearth-col">
        <HearthNextSession />
        <HearthNewForYou />
      </div>
      <div class="hearth-col">
        <HearthQuests />
        <HearthNotes />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import BannerLoader from "@/components/brand/BannerLoader.vue";
import HearthChecks from "@/components/player/hearth/HearthChecks.vue";
import HearthCharacterCard from "@/components/player/hearth/HearthCharacterCard.vue";
import HearthDateStrip from "@/components/player/hearth/HearthDateStrip.vue";
import HearthFirstVisit from "@/components/player/hearth/HearthFirstVisit.vue";
import HearthLiveBanner from "@/components/player/hearth/HearthLiveBanner.vue";
import HearthNewForYou from "@/components/player/hearth/HearthNewForYou.vue";
import HearthNextSession from "@/components/player/hearth/HearthNextSession.vue";
import HearthNotes from "@/components/player/hearth/HearthNotes.vue";
import HearthQuests from "@/components/player/hearth/HearthQuests.vue";
import HearthQuickNote from "@/components/player/hearth/HearthQuickNote.vue";
import HearthRightNow from "@/components/player/hearth/HearthRightNow.vue";
import HearthSpellcasting from "@/components/player/hearth/HearthSpellcasting.vue";
import HearthVitals from "@/components/player/hearth/HearthVitals.vue";
import HearthWaiting from "@/components/player/hearth/HearthWaiting.vue";
import { useCampaignMembers } from "@/composables/campaign/useCampaignMembers";
import { usePlayerCalendarEventsRange } from "@/composables/calendar/useCalendarEvents";
import { useAllSessionAvailability, useSessionProposals } from "@/composables/calendar/useScheduling";
import { useMyRecentNotes } from "@/composables/notes/useMyRecentNotes";
import { useArmorClass } from "@/composables/party/useArmorClass";
import { useCharacterClasses } from "@/composables/party/useCharacterClasses";
import { usePlayerQuestBeats } from "@/composables/quests/useQuestFlow";
import { usePlayerVisibleQuests } from "@/composables/quests/useQuests";
import { usePlayerSessionState } from "@/composables/campaign/useCampaignSession";
import { useActiveParty } from "@/composables/party/useActiveParty";
import { useAuthStore } from "@/stores/auth";
import { useCampaignStore } from "@/stores/campaign";
import { useAppUiStore } from "@/stores/ui/app";
import type { PartyMember } from "@/types/party.types";

/**
 * The player's home: three states picked for them, never toggled. No character
 * yet is the first-visit page; a running session is the at-the-table page; any
 * other time is between sessions. Phones get one column; from `lg` (tablets,
 * which players mostly hold in landscape) the same sections form three
 * columns. The columns are grouped so that reading them in DOM order is the
 * phone's order too: focus and screen-reader order never differ from what is
 * on screen, which an `order`-based reshuffle would break.
 */
const auth = useAuthStore();
const appUi = useAppUiStore();
const campaign = useCampaignStore();

const campaignName = computed(() => campaign.activeCampaign?.name ?? "Hearth");

// Resolved exactly as the character sheet does, so preview mode shows the
// previewed player's Hearth.
const { data: party, isError: partyFailed } = useActiveParty();
const memberId = computed(() => (appUi.dmPreviewMode ? appUi.dmPreviewPartyMemberId : auth.linkedPartyMemberId));
const member = computed<PartyMember | null>(() =>
  memberId.value && party.value ? (party.value.find((m) => m.id === memberId.value) ?? null) : null,
);

const { data: session, isError: sessionFailed } = usePlayerSessionState(() => campaign.activeCampaignId);
// Settled means answered: first visit is only true of a loaded party with no
// character in it, and the table view only of a loaded session state.
const isSettling = computed(
  () =>
    (!!memberId.value && !party.value && !partyFailed.value) ||
    (!!member.value && !!campaign.activeCampaignId && !session.value && !sessionFailed.value),
);

// Start the sections' reads with the view, not when the sections mount. The
// sections wait behind `isSettling` (party, then session), which put these a
// full round late although each needs only the campaign, the member id or the
// calendar year, all known from the first round. The sections call the same
// hooks with the same arguments and so read these cache entries; this only
// moves when the requests start. Reads whose arguments come from the late
// responses (species by id, the wild-shape beast, stored item refs resolved
// from the inventory, unread markers over the quests) stay in their sections.
useCharacterClasses(memberId);
useArmorClass();
usePlayerVisibleQuests();
usePlayerQuestBeats();
useSessionProposals();
useAllSessionAvailability();
useCampaignMembers();
usePlayerCalendarEventsRange(
  computed(() => campaign.todayYear),
  computed(() => campaign.todayYear + 1),
);
// The Hearth does not mount the notes list in DM preview (they are the
// player's private notes), so neither may this read.
useMyRecentNotes(3, () => !appUi.dmPreviewMode);
const isRunning = computed(() => session.value?.isRunning === true);
const startedAt = computed(() => session.value?.startedAt ?? null);
</script>

<style scoped>
.hearth-title {
  margin: 0;
  font-family: "Cinzel", Georgia, serif;
}

/* Phone: the column wrappers vanish and every section is an item of one flex
   column, in DOM order. From lg the wrappers become real columns. */
.hearth-stack {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}
.hearth-col {
  display: contents;
}

@media (min-width: 64rem) {
  .hearth-stack {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    align-items: start;
  }
  .hearth-col {
    display: flex;
    flex-direction: column;
    gap: 1rem;
    min-width: 0;
  }
  .hearth-live > :first-child {
    grid-column: 1 / -1;
  }
}
</style>
