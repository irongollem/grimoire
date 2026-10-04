<template>
  <!-- h-dvh (dynamic viewport height) tracks mobile browser chrome as it
       shows/hides, preventing the bottom of the layout from being hidden
       below Safari's URL bar. h-screen would overflow on mobile Safari. -->
  <div class="flex h-dvh overflow-hidden bg-background">
    <AppSidebar />

    <div class="flex-1 flex flex-col min-w-0">
      <!-- Account-frozen notice (chargeback/fraud or admin freeze) -->
      <SuspensionBanner />

      <!-- Suppressed on mobile full-screen takeover routes (NPC detail/edit),
           which render their own top app bar — avoids two stacked top bars. -->
      <AppTopBar v-if="!fullscreenMobile" />

      <!-- Bottom padding reserves room for the docked DM bottom nav so
           page/list bottoms aren't hidden behind it; reset whenever the
           sidebar (not the bottom bar) is the nav chrome, and dropped
           entirely on full-screen takeover routes (which own their full
           viewport). The bar/sidebar boundary is pointer-driven, not just
           width-driven — see the `barnav:`/`sidenav:` custom variants in
           src/assets/main.css. -->
      <main
        ref="mainEl"
        class="flex flex-1 min-h-0 flex-col overflow-y-auto sidenav:pb-0"
        :class="fullscreenMobile ? '' : 'pb-[calc(4.5rem+env(safe-area-inset-bottom))]'"
      >
        <div v-if="returnTo" class="border-b border-border bg-card px-3 py-2">
          <AppButton :to="returnTo" label="Back to quest beat" size="sm" variant="subtle" />
        </div>
        <AnnouncementBanner />
        <DmCampaignGate>
          <slot />
        </DmCampaignGate>
      </main>
    </div>

    <!-- Docked, mode-aware DM bottom navigation — shown whenever the bar (not
         the sidebar) is the nav chrome: touch-first devices and narrow
         windows alike, see the `barnav:`/`sidenav:` custom variants in
         src/assets/main.css. Hidden on full-screen takeover routes so it
         doesn't collide with the screen's own bottom action bar. -->
    <DmBottomNav v-if="!fullscreenMobile" />

    <CampaignChat />

    <!-- Asked once per load, and only of a DM: a session left running for days
         is still broadcasting reveals at players who are not at the table. -->
    <StaleSessionPrompt v-if="isDm" />

    <!--
      Generator panels are always mounted (see AiGeneratorPanels.vue) so that
      background generation (started when the panel is open then dismissed)
      survives navigation. Each renders nothing visually when its open flag
      is false. To add a new generator, edit AiGeneratorPanels.vue.
    -->
    <AiGeneratorPanels />

    <!-- Shows a pill for every active/completed/errored AI generation -->
    <AiGenerationBadge />

    <!-- Soundboard floating widget — always mounted so audio survives navigation -->
    <SoundboardWidget />

    <!-- App-wide shortcuts: the sound palette and the shortcut cheat sheet -->
    <GlobalHotkeys />

    <!-- Shown when the account has more active campaigns than its limit allows,
         e.g. after a downgrade, or when a young player's inherited limits lapse -->
    <DowngradeCampaignPickerModal
      v-if="campaignQuota"
      :show="showDowngradePicker"
      :campaign-limit="campaignQuota.limit"
      :child-account="auth.isChildAccount"
    />

    <!-- EU AI Act Art 50(1) consent gate — once-per-account notice for
         campaigns where AI was already on before this account acknowledged it -->
    <AiUseNoticeGate />

    <!-- EU AI Act Art 50(1) likeness consent gate — opened by useLikenessGate
         before any portrait-bearing generation (Simulacrum, chronicle scene
         references, group portrait, NPC disguise) -->
    <LikenessNoticeGate />

    <!-- Blocking re-consent gate for an account whose terms_version predates
         the current one (#919) — also the only path by which a pre-existing
         account discovers it needs to become parent-managed. -->
    <TermsGate />
  </div>
</template>

<script setup lang="ts">
import { computed, defineAsyncComponent, useTemplateRef, watch } from "vue";
import { useRoute } from "vue-router";
import { useIsMobile } from "@/composables/useBreakpoint";
import AppSidebar from "@/components/layout/AppSidebar.vue";
import AppTopBar from "@/components/layout/AppTopBar.vue";
import DmBottomNav from "@/components/layout/DmBottomNav.vue";
import StaleSessionPrompt from "@/components/layout/StaleSessionPrompt.vue";
import DmCampaignGate from "@/components/campaign/DmCampaignGate.vue";
import CampaignChat from "@/components/chat/CampaignChat.vue";
import AiGenerationBadge from "@/components/common/AiGenerationBadge.vue";
import SoundboardWidget from "@/components/soundboard/SoundboardWidget.vue";
import GlobalHotkeys from "@/components/layout/GlobalHotkeys.vue";
import DowngradeCampaignPickerModal from "@/components/billing/DowngradeCampaignPickerModal.vue";
import SuspensionBanner from "@/components/billing/SuspensionBanner.vue";
import AiUseNoticeGate from "@/components/campaign/AiUseNoticeGate.vue";
import AnnouncementBanner from "@/components/announcements/AnnouncementBanner.vue";
import LikenessNoticeGate from "@/components/campaign/LikenessNoticeGate.vue";
import TermsGate from "@/components/account/TermsGate.vue";
import { useAudioThemeTriggers } from "@/composables/soundboard/useAudioThemeTriggers";
import { usePartyAmbience } from "@/composables/campaign/usePartyAmbience";
import { useAuthStore } from "@/stores/auth";
import { useCampaignPresence } from "@/composables/campaign/useCampaignPresence";
import { useCampaignLiveSync } from "@/composables/campaign/useCampaignLiveSync";
import { useDueConsequences } from "@/composables/quests/useDueConsequences";
import { usePartyLive } from "@/composables/party/useParty";
import { isOverQuota, useQuota } from "@/composables/billing/useQuota";
import { initPlaceholderFocalPoints } from "@/lib/placeholderFocalPoints";
import { safeQuestReturnTo } from "@/lib/quests/navigation";
import AppButton from "@/components/common/AppButton.vue";

// Async, and it must stay async: statically importing the generator panels
// dragged them — plus their forms, template data and PaywallModal — into the
// entry chunk, which no cold page load can use. They still mount permanently
// (the wrapper resolves moments after boot, long before a generation can be
// started), so the always-mounted invariant that keeps a dismissed generation
// alive across navigation is unchanged. Do NOT convert this to a `v-if` on the
// open flag: generateAndCreate() lives in the panel component, so unmounting a
// dismissed panel would strand an in-flight generation before it creates the
// entity. (Inside the wrapper each panel mounts on its first open and then
// stays: a latch, never a mirror, so the guarantee holds and a closed panel's
// credit, provider and party reads stay off the boot.)
const AiGeneratorPanels = defineAsyncComponent(
  () => import("@/components/common/AiGeneratorPanels.vue"),
);

// Eagerly pre-fetch admin-configured placeholder focal points so FocalImage
// has the data available before it runs smartcrop as a fallback.
void initPlaceholderFocalPoints();

// Full-screen mobile takeover routes (e.g. NPC detail/edit) render their own
// top + bottom bars, so the global AppTopBar / DmBottomNav are suppressed and
// the <main> bottom padding dropped. Only below md — desktop is never affected.
// This is deliberately phone-width-only regardless of pointer type: tablets
// get desktop-style detail views plus the bar, never the full-screen takeover.
const route = useRoute();
const auth = useAuthStore();
const isDm = computed(() => auth.currentRole === "dm");
const isMobile = useIsMobile();
const fullscreenMobile = computed(() => isMobile.value && !!route.meta.fullscreenMobile);

// A new page starts at its top. The router's `scrollBehavior` scrolls
// `window`, but this shell is pinned to `h-dvh` and `<main>` is what scrolls
// below lg, so a page used to open at whatever depth the previous one was left
// at: the Atlas landing halfway down a place on a phone (4 Oct 2026).
// Keyed on the top-level route record rather than the path, so a child route
// that keeps its list mounted underneath (an NPC sheet over `/npcs`, see
// `useDetailModal`) does not throw the list's place away. Lists that restore
// their own depth (`useScrollRestore`) do it on mount, after this.
const mainEl = useTemplateRef<HTMLElement>("mainEl");
watch(
  () => route.matched[0],
  (record, previous) => {
    if (record !== previous && mainEl.value) mainEl.value.scrollTop = 0;
  },
);
const returnTo = computed(() => typeof route.query.returnTo === "string"
  ? safeQuestReturnTo(route.query.returnTo, "")
  : "");

useCampaignPresence();
useCampaignLiveSync();
usePartyLive();

// Fires any quest consequence whose in-world date has arrived, whichever of
// the campaign's two "today" writers moved it there (#794).
useDueConsequences();

// Listens for encounters and locations asking for a theme. Mounted here rather
// than on the soundboard page because the DM is looking at the encounter when
// it fires, not at the board.
useAudioThemeTriggers();

// Keeps ambience following the party's actual position for the length of a
// session (#790), rather than whatever the DM has open in the Atlas. App-level
// like the listener above: the party's position is campaign-wide state, not a
// per-route concern.
usePartyAmbience();

// The database's own count and limit (`check_quota`), so the picker follows
// whatever limits the account really has, including a young player's inherited
// ones. It already leaves out archived campaigns and the demo campaign (#912),
// which occupies no slot, so loading it never sends anyone to the picker.
const { quota: campaignQuota } = useQuota("campaigns");

const showDowngradePicker = computed(() => isOverQuota(campaignQuota.value));
</script>
