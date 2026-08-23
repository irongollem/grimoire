<template>
  <MobileSheet :open="open" title="All sections" @update:open="emit('update:open', $event)">
    <!-- Active campaign + switcher — the desktop sidebar (hidden sidenav:flex)
         is the only other place this lives, so mobile/PWA DMs get it here.
         Full-bleed to align with the sheet's title divider. -->
    <CampaignSwitcher class="-mx-4 mb-4" />

    <!-- Context-aware create — the create path in Play mode (whose center FAB
         is the dice roller, not "+"). Shown whenever the current section has a
         create route. -->
    <AppButton
      v-if="create"
      variant="primary"
      size="lg"
      block
      class="mb-4 font-bold"
      :icon="IconAdd"
      icon-size="md"
      :label="create.label"
      @click="onCreate"
    />

    <!-- The campaign session -->
    <SessionRail size="md" class="mb-4" />

    <!-- All sections as icon tiles, grouped by area -->
    <div class="flex flex-col gap-4">
      <div v-for="group in groups" :key="group.label">
        <p
          class="px-1 pb-2 font-cinzel text-2xs font-bold uppercase tracking-widest text-muted-foreground/60"
        >
          {{ group.label }}
        </p>
        <div class="grid grid-cols-4 gap-2">
          <button
            v-for="item in group.items"
            :key="item.to"
            type="button"
            class="relative flex flex-col items-center gap-1.5 rounded-xl border px-1 py-3 text-center transition-colors"
            :class="[
              isActive(item.to)
                ? 'border-primary/50 bg-primary/10 text-primary'
                : 'border-border bg-card text-muted-foreground hover:bg-secondary/60 hover:text-foreground',
              item.requiresCampaign && !hasCampaign ? 'pointer-events-none opacity-40' : '',
            ]"
            @click="navigate(item)"
          >
            <component :is="item.icon" class="h-5 w-5 shrink-0" />
            <span class="font-cinzel text-2xs leading-tight">{{ item.label }}</span>
            <!-- Gold dot: pinned to the bar for the active mode -->
            <span
              v-if="barRoutes.includes(item.to)"
              class="absolute right-1.5 top-1.5 h-1.5 w-1.5 rounded-full bg-primary"
              title="On the bar"
            />
          </button>
        </div>
      </div>
    </div>

    <p class="mt-4 px-1 text-center text-caption-sm text-muted-foreground/60">
      Dot = currently pinned to the {{ ui.dmMode === "play" ? "session" : "prep" }} bar.
    </p>

    <AppButton
      v-if="updateAvailable"
      variant="menu"
      size="md"
      block
      class="mt-4 gap-3 text-primary font-bold"
      :icon="IconRefresh"
      icon-size="md"
      label="Reload to update"
      @click="reloadApp"
    />

    <AppButton
      variant="menu"
      size="md"
      block
      class="mt-2 gap-3"
      :icon="IconBug"
      icon-size="md"
      label="Report a bug"
      @click="emit('update:open', false); bugReportOpen = true"
    />
    <BugReportModal v-if="bugReportMounted" v-model="bugReportOpen" />
  </MobileSheet>
</template>

<script setup lang="ts">
import { computed, ref, defineAsyncComponent } from "vue";
import { useRoute, useRouter } from "vue-router";
import AppButton from "@/components/common/AppButton.vue";
import MobileSheet from "@/components/common/MobileSheet.vue";
import CampaignSwitcher from "@/components/layout/CampaignSwitcher.vue";
import { useLazyMount } from "@/composables/useLazyMount";
import SessionRail from "./SessionRail.vue";
import { IconAdd, IconBug, IconRefresh } from "@/lib/icons";
import { NAV_GROUPS, navItemHiddenByFlag, type NavItem } from "@/lib/nav";
import { updateAvailable, reloadApp } from "@/composables/useAppUpdate";
import { useUiStore } from "@/stores/ui";
import { useCampaignStore } from "@/stores/campaign";
import { useOptionalRules, isRuleEffectivelyEnabled } from "@/composables/useOptionalRules";
import { useSimulacrumConfig } from "@/composables/useSimulacrumConfig";
import { useAbove } from "@/composables/useBreakpoint";

const { open = false, barRoutes = [], create = null } = defineProps<{
  open?: boolean;
  /** Routes pinned to the bottom bar for the current mode (gets a gold dot). */
  barRoutes?: string[];
  /** Context-aware create action for the current section, or null if none. */
  create?: { to?: string; act?: () => void; label: string } | null;
}>();

const emit = defineEmits<{ "update:open": [boolean] }>();

// Deferred — a dialog most sessions never open should not be entry-chunk
// weight. Latched rather than mirrored so a half-typed report survives a
// close/reopen, exactly as the always-mounted version did.
const BugReportModal = defineAsyncComponent(
  () => import("@/components/common/BugReportModal.vue"),
);

const bugReportOpen = ref(false);
const bugReportMounted = useLazyMount(bugReportOpen);

const route = useRoute();
const router = useRouter();
const ui = useUiStore();
const campaignStore = useCampaignStore();

const hasCampaign = computed(() => !!campaignStore.activeCampaignId);

const { data: campaignRules } = useOptionalRules();
const { mode: simulacrumMode } = useSimulacrumConfig();

// Drive the grid off the real nav registry. `desktopOnly` items (A4/letter
// output tools) are impractical on phone-sized viewports but a tablet has the
// room — and in bar mode this sheet is a tablet's ONLY path to them (no
// sidebar) — so they're included at md+. Rule-gated items follow their
// campaign rule.
//
// Filtered per item rather than per group: Publish is no longer uniformly
// A4-bound now that Gallery lives there, and Gallery is a list of images that a
// phone handles fine. A group left with nothing after filtering drops out
// entirely, so a heading never appears over an empty grid.
const wideEnough = useAbove("md");
const groups = computed(() =>
  NAV_GROUPS
    .map((group) => ({
      ...group,
      items: group.items.filter(
        (item) =>
          (!item.desktopOnly || wideEnough.value) &&
          (!item.ruleKey || isRuleEffectivelyEnabled(campaignRules.value, item.ruleKey)) &&
          !navItemHiddenByFlag(item, simulacrumMode.value === "hidden"),
      ),
    }))
    .filter((group) => group.items.length > 0),
);

function isActive(to: string): boolean {
  return route.path === to || route.path.startsWith(to + "/");
}

function navigate(item: NavItem) {
  emit("update:open", false);
  router.push(item.to);
}

function onCreate() {
  if (!create) return;
  emit("update:open", false);
  if (create.act) create.act();
  else if (create.to) router.push(create.to);
}
</script>
