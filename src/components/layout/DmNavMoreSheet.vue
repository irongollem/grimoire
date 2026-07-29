<template>
  <MobileSheet :open="open" title="All sections" @update:open="emit('update:open', $event)">
    <!-- Active campaign + switcher — the desktop sidebar (hidden sidenav:flex)
         is the only other place this lives, so mobile/PWA DMs get it here.
         Full-bleed to align with the sheet's title divider. -->
    <CampaignSwitcher class="-mx-4 mb-4" />

    <!-- Context-aware create — the create path in Play mode (whose center FAB
         is the dice roller, not "+"). Shown whenever the current section has a
         create route. -->
    <button
      v-if="create"
      type="button"
      class="mb-4 flex w-full items-center justify-center gap-2 rounded-md bg-primary px-3 py-3 font-cinzel text-sm font-bold tracking-wider text-primary-foreground transition-opacity hover:opacity-90"
      @click="onCreate"
    >
      <IconAdd class="h-4 w-4 shrink-0" />
      {{ create.label }}
    </button>

    <!-- Prep / Play mode toggle -->
    <DmModeToggle size="md" :labels="['Prep mode', 'Play mode']" class="mb-4" />

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
      Dot = currently pinned to the {{ ui.dmMode }} bar.
    </p>

    <button
      v-if="updateAvailable"
      type="button"
      class="mt-4 flex w-full items-center justify-center gap-2 rounded-md border border-primary/40 bg-primary/10 px-3 py-3 text-label-lg font-bold text-primary transition-colors hover:bg-primary/20"
      @click="reloadApp"
    >
      <IconRefresh class="h-4 w-4 shrink-0" />
      Reload to update
    </button>

    <button
      type="button"
      class="mt-2 flex w-full items-center justify-center gap-2 rounded-md border border-border px-3 py-2.5 text-label-lg text-muted-foreground transition-colors hover:text-foreground"
      @click="emit('update:open', false); bugReportOpen = true"
    >
      <IconBug class="h-4 w-4 shrink-0" />
      Report a bug
    </button>
    <BugReportModal v-model="bugReportOpen" />
  </MobileSheet>
</template>

<script setup lang="ts">
import { computed, ref } from "vue";
import { useRoute, useRouter } from "vue-router";
import MobileSheet from "@/components/common/MobileSheet.vue";
import CampaignSwitcher from "@/components/layout/CampaignSwitcher.vue";
import BugReportModal from "@/components/common/BugReportModal.vue";
import DmModeToggle from "./DmModeToggle.vue";
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

const bugReportOpen = ref(false);

const route = useRoute();
const router = useRouter();
const ui = useUiStore();
const campaignStore = useCampaignStore();

const hasCampaign = computed(() => !!campaignStore.activeCampaignId);

const { data: campaignRules } = useOptionalRules();
const { mode: simulacrumMode } = useSimulacrumConfig();

// Drive the grid off the real nav registry. `desktopOnly` groups (A4/letter
// output tools) are impractical on phone-sized viewports but a tablet has the
// room — and in bar mode this sheet is a tablet's ONLY path to them (no
// sidebar) — so they're included at md+. Rule-gated items follow their
// campaign rule.
const wideEnough = useAbove("md");
const groups = computed(() =>
  NAV_GROUPS
    .filter((g) => !g.desktopOnly || wideEnough.value)
    .map((group) => ({
      ...group,
      items: group.items.filter(
        (item) =>
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
