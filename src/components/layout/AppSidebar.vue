<template>
  <aside
    class="hidden md:flex flex-col w-60 shrink-0 border-r border-border bg-card h-dvh sticky top-0"
  >
    <!-- Logo -->
    <div class="px-4 py-5 border-b border-border">
      <div class="flex items-center justify-between gap-2">
        <RouterLink to="/dashboard" class="block min-w-0">
          <h1 class="font-cinzel text-xl font-bold text-gold-500 tracking-widest">Grimoire</h1>
          <p class="font-fell text-xs text-muted-foreground italic mt-0.5">Campaign Companion</p>
        </RouterLink>
        <div class="flex items-center gap-1.5 shrink-0">
          <!-- DM Prep/Play mode toggle (issue #133) — DM-only segmented pill.
               In Play mode, flipping an entity's visibility-to-player auto-
               broadcasts a narrative chat event. In Prep mode (default) that
               side-effect is silent so the DM can set up sessions freely. -->
          <button
            v-if="isDm"
            type="button"
            :title="ui.dmMode === 'play'
              ? 'Play mode — visibility changes broadcast to chat. Click to stop broadcasting.'
              : 'Prep mode — visibility changes are silent. Click to start broadcasting.'"
            class="flex items-center gap-0.5 rounded border px-1 py-0.5 font-cinzel text-[9px] tracking-widest font-bold transition-colors"
            :class="ui.dmMode === 'play'
              ? 'border-primary/60 bg-primary/15 text-primary hover:bg-primary/25'
              : 'border-border text-muted-foreground hover:text-foreground hover:border-muted-foreground/50'"
            @click="ui.toggleDmMode()"
          >
            <span class="px-1" :class="ui.dmMode === 'prep' ? '' : 'opacity-50'">PREP</span>
            <span class="px-1" :class="ui.dmMode === 'play' ? '' : 'opacity-50'">PLAY</span>
          </button>

          <!-- AI generation in-progress spinner -->
          <button
            v-if="isAnyAiGenerating && activeGenerator"
            class="flex items-center gap-1 px-1.5 py-0.5 rounded bg-primary/15 border border-primary/30 hover:bg-primary/25 transition-colors"
            :title="currentLoadingQuote"
            @click="activeGenerator.openPanel()"
          >
            <Loader2 class="h-3 w-3 text-primary animate-spin" />
            <span class="font-cinzel text-[9px] text-primary tracking-wider">AI</span>
          </button>
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
    </nav>

    <!-- Gold divider -->
    <div class="gold-divider mx-3" />

    <!-- User section -->
    <div class="px-3 py-4 space-y-1">
      <AppInvitePanel v-if="auth.isAppAdmin" />
      <SoundboardWidgetToggle />
      <button
        v-if="auth.isDM"
        class="w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-xs text-muted-foreground hover:text-foreground hover:bg-secondary/60 transition-colors"
        title="Preview the player portal as your players see it"
        @click="handlePreviewAsPlayer"
      >
        <Eye class="h-3.5 w-3.5 shrink-0" />
        <span class="font-fell">View as Player</span>
      </button>
      <div class="flex items-center gap-2 px-2 py-2 rounded-md text-sm text-muted-foreground">
        <div class="h-7 w-7 rounded-full bg-secondary flex items-center justify-center shrink-0">
          <span class="font-cinzel text-xs text-foreground font-semibold">
            {{ userInitial }}
          </span>
        </div>
        <template v-if="editingName">
          <input
            v-model="nameInput"
            class="flex-1 min-w-0 bg-background border border-border rounded px-1.5 py-0.5 font-fell text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-gold-500"
            placeholder="Your name"
            @keydown.enter="saveName"
            @keydown.esc="editingName = false"
          />
          <button
            class="hover:text-foreground transition-colors shrink-0"
            title="Save name"
            :disabled="nameSaving"
            @click="saveName"
          >
            <Check class="h-3.5 w-3.5" />
          </button>
        </template>
        <template v-else>
          <span class="flex-1 truncate font-fell text-xs">{{ shownName }}</span>
          <button
            class="hover:text-foreground transition-colors shrink-0"
            title="Edit display name"
            @click="startEdit"
          >
            <Pencil class="h-3 w-3" />
          </button>
        </template>
        <button
          class="hover:text-foreground transition-colors shrink-0"
          title="Sign out"
          @click="handleSignOut"
        >
          <LogOut class="h-4 w-4" />
        </button>
      </div>
    </div>

  </aside>
</template>

<script setup lang="ts">
import { ref, computed } from "vue";
import { useRouter } from "vue-router";
import { LogOut, Pencil, Check, Eye, Loader2 } from "lucide-vue-next";
import { isAnyAiGenerating, getAiGeneratorRegistry } from "@/ai/aiGeneratorRegistry";
import { currentLoadingQuote } from "@/ai/aiGenerationState";
import { useAuthStore } from "@/stores/auth";
import { useUiStore } from "@/stores/ui";
import { useUpdateCampaignMember } from "@/composables/useCampaignMembers";
import { NAV_GROUPS } from "@/lib/nav";
import { useRunningEncounters } from "@/composables/useEncounterLive";
import { useOptionalRules, isRuleEffectivelyEnabled } from "@/composables/useOptionalRules";
import NavItem from "./NavItem.vue";
import CampaignSwitcher from "./CampaignSwitcher.vue";
import GlobalSearch from "./GlobalSearch.vue";
import AppInvitePanel from "@/components/admin/AppInvitePanel.vue";
import SoundboardWidgetToggle from "@/components/soundboard/SoundboardWidgetToggle.vue";

const auth = useAuthStore();
const ui = useUiStore();
const router = useRouter();
// DM detection — the prep/play toggle is the only DM-only sidebar control
// so far; gate its visibility so players never see it (issue #133 acceptance).
const isDm = computed(() => auth.currentRole === "dm");
const { anyRunning, firstRunning } = useRunningEncounters();

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
  nameInput.value  = displayName.value;
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

function handlePreviewAsPlayer() {
  ui.enterDmPreview();
  router.push({ name: "play" });
}

async function handleSignOut() {
  await auth.signOut();
  router.push({ name: "login" });
}
</script>
