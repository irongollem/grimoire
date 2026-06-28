<template>
  <aside
    class="hidden md:flex flex-col w-60 shrink-0 border-r border-border bg-card h-dvh sticky top-0"
  >
    <!-- Logo -->
    <div class="px-4 py-4 border-b border-border space-y-2.5">
      <!-- Brand row: title left, status indicators right -->
      <div class="flex items-start justify-between gap-2">
        <RouterLink to="/dashboard" class="block min-w-0">
          <h1 class="font-cinzel text-xl font-bold text-gold-500 tracking-widest leading-none">Grimoire</h1>
          <p class="font-fell text-xs text-muted-foreground italic mt-1">Campaign Companion</p>
        </RouterLink>
        <div class="flex items-center gap-1 shrink-0 pt-0.5">
          <DiceRoller />
          <!-- AI generation in-progress spinner -->
          <button
            v-if="isAnyAiGenerating && activeGenerator"
            class="flex items-center gap-1 px-1.5 py-0.5 rounded bg-primary/15 border border-primary/30 hover:bg-primary/25 transition-colors"
            :title="currentLoadingQuote"
            @click="activeGenerator.openPanel()"
          >
            <IconLoading class="h-3 w-3 text-primary animate-spin" />
            <span class="font-cinzel text-[9px] text-primary tracking-wider">AI</span>
          </button>
          <!-- Live encounter indicator -->
          <RouterLink
            v-if="anyRunning && firstRunning"
            :to="`/encounters/${firstRunning.encounter_id}/run`"
            class="flex items-center gap-1 px-1.5 py-0.5 rounded bg-green-500/15 border border-green-500/30 hover:bg-green-500/25 transition-colors"
            title="Encounter in progress"
          >
            <span class="h-1.5 w-1.5 rounded-full bg-green-400 animate-pulse" />
            <span class="font-cinzel text-[9px] text-green-400 tracking-wider">Live</span>
          </RouterLink>
        </div>
      </div>

      <!-- DM Prep/Play segmented control — DM-only, full-width below the brand.
           In Play mode, visibility changes auto-broadcast to chat.
           In Prep mode (default) that side-effect is silent. -->
      <button
        v-if="isDm"
        type="button"
        :title="ui.dmMode === 'play'
          ? 'Play mode — visibility changes broadcast to chat. Click to stop broadcasting.'
          : 'Prep mode — visibility changes are silent. Click to start broadcasting.'"
        class="w-full flex items-center rounded border overflow-hidden font-cinzel text-[9px] tracking-widest font-bold transition-colors"
        :class="ui.dmMode === 'play' ? 'border-primary/50' : 'border-border'"
        @click="ui.toggleDmMode()"
      >
        <span
          class="flex-1 text-center py-1 transition-colors"
          :class="ui.dmMode === 'prep' ? 'bg-muted text-foreground' : 'text-muted-foreground'"
        >PREP</span>
        <span
          class="flex-1 text-center py-1 border-l transition-colors"
          :class="ui.dmMode === 'play'
            ? 'bg-primary/15 text-primary border-primary/30'
            : 'text-muted-foreground border-border'"
        >PLAY</span>
      </button>
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
          class="px-2 pt-4 pb-1 font-cinzel text-[10px] font-bold tracking-widest text-muted-foreground/60 uppercase first:pt-0"
        >
          {{ group.label }}
        </p>
        <NavItem v-for="item in group.items" :key="item.to" :item="item" />
      </template>
      <!-- Admin link — only visible to app admins -->
      <template v-if="auth.isAppAdmin">
        <p class="px-2 pt-4 pb-1 font-cinzel text-[10px] font-bold tracking-widest text-muted-foreground/60 uppercase">
          System
        </p>
        <RouterLink
          to="/admin"
          class="flex items-center gap-2.5 px-3 py-2 rounded-md text-xs font-fell transition-colors"
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
            <input
              v-model="nameInput"
              class="flex-1 min-w-0 bg-background border border-border rounded px-1.5 py-0.5 font-fell text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-gold-500"
              placeholder="Your name"
              @keydown.enter="saveName"
              @keydown.esc="editingName = false"
            />
            <button class="hover:text-foreground transition-colors shrink-0 text-muted-foreground" :disabled="nameSaving" @click="saveName">
              <IconCheck class="h-3.5 w-3.5" />
            </button>
            <button class="hover:text-foreground transition-colors shrink-0 text-muted-foreground" @click="editingName = false">
              <IconClose class="h-3.5 w-3.5" />
            </button>
          </div>
          <button
            v-else
            class="w-full flex items-center gap-2 px-3 py-2 text-xs text-muted-foreground hover:text-foreground hover:bg-secondary/60 transition-colors"
            @click="startEdit"
          >
            <IconEdit class="h-3.5 w-3.5 shrink-0" />
            <span class="font-fell">Edit display name</span>
          </button>

          <!-- Billing (DM only) -->
          <RouterLink
            v-if="auth.isDM"
            to="/billing"
            class="flex items-center gap-2 px-3 py-2 text-xs text-muted-foreground hover:text-foreground hover:bg-secondary/60 transition-colors"
            @click="menuOpen = false"
          >
            <IconBilling class="h-3.5 w-3.5 shrink-0" />
            <span class="font-fell">Billing</span>
            <span v-if="isPro" class="ml-auto font-cinzel text-[9px] font-semibold tracking-wider text-amber-400 uppercase">Pro</span>
          </RouterLink>

          <div class="border-t border-border my-1" />

          <!-- Install PWA -->
          <button
            v-if="canInstall"
            class="w-full flex items-center gap-2 px-3 py-2 text-xs text-muted-foreground hover:text-foreground hover:bg-secondary/60 transition-colors"
            :title="hasNativePrompt ? 'Add to home screen' : 'Open your browser menu → Add to Home Screen'"
            @click="hasNativePrompt ? (install(), menuOpen = false) : undefined"
          >
            <IconDownload class="h-3.5 w-3.5 shrink-0" />
            <span class="font-fell">Install app</span>
          </button>

          <!-- Bug report -->
          <button
            class="w-full flex items-center gap-2 px-3 py-2 text-xs text-muted-foreground hover:text-foreground hover:bg-secondary/60 transition-colors"
            @click="bugReportOpen = true; menuOpen = false"
          >
            <IconBug class="h-3.5 w-3.5 shrink-0" />
            <span class="font-fell">Report a bug</span>
          </button>

          <!-- Sign out -->
          <button
            class="w-full flex items-center gap-2 px-3 py-2 text-xs text-red-400/80 hover:text-red-400 hover:bg-secondary/60 transition-colors"
            @click="handleSignOut"
          >
            <IconLogOut class="h-3.5 w-3.5 shrink-0" />
            <span class="font-fell">Sign out</span>
          </button>

          <!-- Legal -->
          <div class="border-t border-border my-1" />
          <div class="px-3 py-2" @click="menuOpen = false">
            <LegalFooterLinks />
          </div>
        </div>
      </Transition>

      <!-- Trigger button -->
      <button
        class="w-full flex items-center gap-2 px-2 py-2 rounded-md hover:bg-secondary/60 transition-colors"
        :class="menuOpen ? 'bg-secondary/60' : ''"
        @click="menuOpen = !menuOpen"
      >
        <div class="h-7 w-7 rounded-full bg-secondary flex items-center justify-center shrink-0">
          <span class="font-cinzel text-xs text-foreground font-semibold">{{ userInitial }}</span>
        </div>
        <span class="flex-1 truncate font-fell text-xs text-muted-foreground text-left">{{ shownName }}</span>
        <IconSort class="h-3 w-3 text-muted-foreground/60 shrink-0" />
      </button>

      <BugReportModal v-model="bugReportOpen" />
    </div>

  </aside>
</template>

<script setup lang="ts">
import { ref, computed } from "vue";
import { useRouter } from "vue-router";
import { IconBilling, IconBug, IconCheck, IconClose, IconDownload, IconEdit, IconLoading, IconLogOut, IconShieldCheck, IconSort } from '@/lib/icons';
import { usePwaInstall } from "@/composables/usePwaInstall";
import { onClickOutside } from "@vueuse/core";
import { isAnyAiGenerating, getAiGeneratorRegistry } from "@/ai/aiGeneratorRegistry";
import { currentLoadingQuote } from "@/ai/aiGenerationState";
import { useAuthStore } from "@/stores/auth";
import { useUiStore } from "@/stores/ui";
import { useUpdateCampaignMember } from "@/composables/useCampaignMembers";
import LegalFooterLinks from "@/components/common/LegalFooterLinks.vue";
import { NAV_GROUPS } from "@/lib/nav";
import { useRunningEncounters } from "@/composables/useEncounterLive";
import { useOptionalRules, isRuleEffectivelyEnabled } from "@/composables/useOptionalRules";
import { useSubscription } from "@/composables/useSubscription";
import NavItem from "./NavItem.vue";
import CampaignSwitcher from "./CampaignSwitcher.vue";
import GlobalSearch from "./GlobalSearch.vue";
import DiceRoller from "@/components/common/DiceRoller.vue";
import BugReportModal from "@/components/common/BugReportModal.vue";

const auth = useAuthStore();
const ui = useUiStore();
const router = useRouter();
const { canInstall, hasNativePrompt, install } = usePwaInstall();
const bugReportOpen = ref(false);
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
const visibleNavGroups = computed(() =>
  NAV_GROUPS.map((group) => ({
    ...group,
    items: group.items.filter((item) =>
      !item.ruleKey || isRuleEffectivelyEnabled(campaignRules.value, item.ruleKey),
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
