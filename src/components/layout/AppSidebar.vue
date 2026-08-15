<template>
  <aside
    class="hidden sidenav:flex flex-col w-60 shrink-0 border-r border-border bg-card h-dvh sticky top-0"
  >
    <!-- Logo -->
    <div class="px-4 py-4 border-b border-border space-y-2.5">
      <!-- Brand row: title left, status indicators right -->
      <div class="flex items-start justify-between gap-2">
        <RouterLink to="/dashboard" class="block min-w-0">
          <h1 class="font-cinzel text-xl font-bold text-gold-500 tracking-widest leading-none">Grimoire</h1>
          <p class="text-caption text-muted-foreground italic mt-1">Campaign Companion</p>
        </RouterLink>
        <div class="flex items-center gap-1 shrink-0 pt-0.5">
          <DiceRoller />
          <!-- AI generation in-progress spinner -->
          <AppButton
            v-if="isAnyAiGenerating && activeGenerator"
            variant="tinted"
            tone="primary"
            emphasis="soft"
            size="xs"
            class="px-1.5"
            aria-label="AI generation in progress"
            :tooltip="currentLoadingQuote"
            @click="activeGenerator.openPanel()"
          >
            <template #icon>
              <IconLoading class="h-3 w-3 shrink-0 animate-spin" aria-hidden="true" />
            </template>
            AI
          </AppButton>
          <!-- Live encounter indicator -->
          <AppButton
            v-if="anyRunning && firstRunning"
            :to="`/encounters/${firstRunning.encounter_id}/run`"
            variant="tinted"
            tone="success"
            emphasis="soft"
            size="xs"
            class="px-1.5"
            aria-label="Live"
            tooltip="Encounter in progress"
          >
            <template #icon>
              <span class="h-1.5 w-1.5 shrink-0 rounded-full bg-current animate-pulse" />
            </template>
            Live
          </AppButton>
        </div>
      </div>

      <!-- DM Prep/Play segmented control — DM-only, full-width below the brand. -->
      <DmModeToggle v-if="isDm" />
    </div>

    <!-- Campaign switcher -->
    <CampaignSwitcher />

    <!-- Global search -->
    <div class="px-3 py-2 border-b border-border">
      <GlobalSearch />
    </div>

    <!-- Navigation -->
    <nav class="flex-1 overflow-y-auto px-2 py-4">
      <template v-for="group in visibleNavGroups" :key="group.label">
        <p
          class="px-2 pt-4 pb-1 font-cinzel text-2xs font-bold tracking-widest text-muted-foreground/60 uppercase first:pt-0"
        >
          {{ group.label }}
        </p>
        <NavItem v-for="item in group.items" :key="item.to" :item="item" />
      </template>
      <!-- Admin link — only visible to app admins -->
      <template v-if="auth.isAppAdmin">
        <p class="px-2 pt-4 pb-1 font-cinzel text-2xs font-bold tracking-widest text-muted-foreground/60 uppercase">
          System
        </p>
        <RouterLink
          to="/admin"
          class="flex items-center gap-2.5 px-3 py-2 rounded-md text-caption transition-colors"
          :class="$route.path.startsWith('/admin') ? 'bg-secondary text-foreground' : 'text-muted-foreground hover:bg-secondary/60 hover:text-foreground'"
        >
          <IconShieldCheck class="h-4 w-4 shrink-0" />
          Admin
        </RouterLink>
      </template>
    </nav>

    <!-- Gold divider -->
    <div class="gold-divider mx-3" />

    <!-- User row — click to open account menu -->
    <div class="px-3 py-3 relative" ref="userMenuRef">
      <!-- Account popover (opens above) -->
      <Transition
        enter-active-class="transition-all duration-150"
        leave-active-class="transition-all duration-100"
        enter-from-class="opacity-0 translate-y-1"
        leave-to-class="opacity-0 translate-y-1"
      >
        <div
          v-if="menuOpen"
          class="absolute bottom-full left-0 right-0 mb-1 rounded-xl border border-border bg-popover shadow-lg overflow-hidden py-1"
        >
          <!-- Edit name -->
          <div v-if="editingName" class="flex items-center gap-1.5 px-3 py-2">
            <AppInput
              v-model="nameInput"
              size="xs"
              :block="false"
              class="flex-1 min-w-0 text-caption"
              placeholder="Your name"
              @keydown.enter="saveName"
              @keydown.esc="editingName = false"
            />
            <AppButton
              variant="ghost"
              size="inline"
              class="shrink-0"
              :icon="IconCheck"
              aria-label="Save display name"
              :disabled="nameSaving"
              @click="saveName"
            />
            <AppButton
              variant="ghost"
              size="inline"
              class="shrink-0"
              :icon="IconClose"
              aria-label="Cancel"
              @click="editingName = false"
            />
          </div>
          <AccountMenuItem
            v-else
            :icon="IconEdit"
            label="Edit display name"
            @click="startEdit"
          />

          <div class="border-y border-border py-1">
            <ModeToggle />
          </div>

          <AccountMenuItem
            :icon="IconUserCircle"
            label="Account"
            to="/account"
            @click="menuOpen = false"
          />

          <!-- Billing (DM only) -->
          <AccountMenuItem
            v-if="auth.isDM"
            :icon="IconBilling"
            label="Billing"
            to="/billing"
            @click="menuOpen = false"
          >
            <template #trailing>
              <span v-if="isPro" class="ml-auto text-eyebrow font-semibold text-amber-400">Pro</span>
            </template>
          </AccountMenuItem>

          <div class="border-t border-border my-1" />

          <AccountMenuItem
            v-if="canInstall"
            :icon="IconDownload"
            label="Install app"
            :tooltip="hasNativePrompt ? 'Add to home screen' : 'Open your browser menu → Add to Home Screen'"
            @click="hasNativePrompt ? (install(), menuOpen = false) : undefined"
          />

          <AccountMenuItem
            :icon="IconBug"
            label="Report a bug"
            @click="bugReportOpen = true; menuOpen = false"
          />

          <AccountMenuItem
            :icon="IconLogOut"
            label="Sign out"
            danger
            @click="handleSignOut"
          />

          <!-- Legal -->
          <div class="border-t border-border my-1" />
          <div class="px-3 py-2" @click="menuOpen = false">
            <LegalFooterLinks />
          </div>
        </div>
      </Transition>

      <!-- Trigger button. Not `active`: that variant paints the row gold, and this
           only needs to look pressed while the popover is open. -->
      <AppButton
        variant="ghost"
        size="inline"
        block
        data-tour="account-menu"
        :class="cn('justify-start gap-2 px-2 py-2 rounded-md hover:bg-secondary/60', menuOpen && 'bg-secondary/60')"
        :aria-label="`Account menu for ${shownName}`"
        :aria-expanded="menuOpen"
        @click="menuOpen = !menuOpen"
      >
        <div class="h-7 w-7 rounded-full bg-secondary flex items-center justify-center shrink-0">
          <span class="font-cinzel text-xs text-foreground font-semibold">{{ userInitial }}</span>
        </div>
        <span class="flex-1 truncate text-caption text-muted-foreground text-left">{{ shownName }}</span>
        <IconSort class="h-3 w-3 text-muted-foreground/60 shrink-0" />
      </AppButton>

      <BugReportModal v-if="bugReportMounted" v-model="bugReportOpen" />
    </div>

  </aside>
</template>

<script setup lang="ts">
import { ref, computed, defineAsyncComponent } from "vue";
import { useRouter } from "vue-router";
import { IconBilling, IconBug, IconCheck, IconClose, IconDownload, IconEdit, IconLoading, IconLogOut, IconShieldCheck, IconSort, IconUserCircle } from '@/lib/icons';
import { usePwaInstall } from "@/composables/usePwaInstall";
import { onClickOutside } from "@vueuse/core";
import { isAnyAiGenerating, getAiGeneratorRegistry } from "@/ai/aiGeneratorRegistry";
import { currentLoadingQuote } from "@/ai/aiGenerationState";
import { useAuthStore } from "@/stores/auth";
import { useUpdateCampaignMember } from "@/composables/useCampaignMembers";
import LegalFooterLinks from "@/components/common/LegalFooterLinks.vue";
import { NAV_GROUPS, navItemHiddenByFlag } from "@/lib/nav";
import { useRunningEncounters } from "@/composables/useEncounterLive";
import { useOptionalRules, isRuleEffectivelyEnabled } from "@/composables/useOptionalRules";
import { useSubscription } from "@/composables/useSubscription";
import { useSimulacrumConfig } from "@/composables/useSimulacrumConfig";
import AppButton from "@/components/common/AppButton.vue";
import AppInput from "@/components/common/AppInput.vue";
import { cn } from "@/lib/utils";
import AccountMenuItem from "./AccountMenuItem.vue";
import NavItem from "./NavItem.vue";
import CampaignSwitcher from "./CampaignSwitcher.vue";
import GlobalSearch from "./GlobalSearch.vue";
import DiceRoller from "@/components/common/DiceRoller.vue";
import { useLazyMount } from "@/composables/useLazyMount";
import DmModeToggle from "./DmModeToggle.vue";
import ModeToggle from "./ModeToggle.vue";

const auth = useAuthStore();
const router = useRouter();
const { canInstall, hasNativePrompt, install } = usePwaInstall();
// Deferred — a dialog most sessions never open should not be entry-chunk
// weight. Latched rather than mirrored so a half-typed report survives a
// close/reopen, exactly as the always-mounted version did.
const BugReportModal = defineAsyncComponent(
  () => import("@/components/common/BugReportModal.vue"),
);

const bugReportOpen = ref(false);
const bugReportMounted = useLazyMount(bugReportOpen);
const menuOpen = ref(false);
const userMenuRef = ref<HTMLElement | null>(null);

const isDm = computed(() => auth.currentRole === "dm");
const { isPro } = useSubscription();
const { anyRunning, firstRunning } = useRunningEncounters();

onClickOutside(userMenuRef, (e) => {
  // Ignore clicks inside a teleported modal (fixed inset-0 backdrop)
  if ((e.target as Element).closest(".fixed.inset-0")) return;
  menuOpen.value = false;
});

const { data: campaignRules } = useOptionalRules();
const { mode: simulacrumMode } = useSimulacrumConfig();
const visibleNavGroups = computed(() =>
  NAV_GROUPS.map((group) => ({
    ...group,
    items: group.items.filter((item) =>
      (!item.ruleKey || isRuleEffectivelyEnabled(campaignRules.value, item.ruleKey)) &&
      !navItemHiddenByFlag(item, simulacrumMode.value === "hidden"),
    ),
  })).filter((group) => group.items.length > 0),
);
const activeGenerator = computed(() =>
  getAiGeneratorRegistry().find((e) => e.isGenerating.value) ?? null,
);
const { mutateAsync: updateMember } = useUpdateCampaignMember();

const userEmail   = computed(() => auth.userEmail ?? "");
const displayName = computed(() => auth.membership?.display_name ?? "");
const shownName   = computed(() => displayName.value || userEmail.value);
const userInitial = computed(() => (displayName.value || userEmail.value).charAt(0).toUpperCase() || "?");

const editingName = ref(false);
const nameInput   = ref("");
const nameSaving  = ref(false);

function startEdit() {
  nameInput.value   = displayName.value;
  editingName.value = true;
}

async function saveName() {
  const id = auth.membership?.id;
  if (!id) return;
  nameSaving.value = true;
  try {
    await updateMember({ id, update: { display_name: nameInput.value.trim() || null } });
    await auth.refreshMembership();
  } finally {
    nameSaving.value  = false;
    editingName.value = false;
  }
}

async function handleSignOut() {
  await auth.signOut();
  router.push({ name: "login" });
}
</script>
