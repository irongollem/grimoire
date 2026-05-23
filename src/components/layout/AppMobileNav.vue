<template>
  <!-- Backdrop -->
  <Transition name="fade">
    <div
      v-if="ui.mobileNavOpen"
      class="md:hidden fixed inset-0 bg-black/60 z-40"
      @click="ui.toggleMobileNav()"
    />
  </Transition>

  <!-- Drawer -->
  <Transition name="slide">
    <aside
      v-if="ui.mobileNavOpen"
      class="md:hidden fixed left-0 top-0 bottom-0 w-64 bg-card border-r border-border z-50 flex flex-col"
    >
      <!-- Header -->
      <div class="flex items-center justify-between px-4 py-5 border-b border-border">
        <h1 class="font-cinzel text-xl font-bold text-gold-500 tracking-widest">Grimoire</h1>
        <button class="text-muted-foreground hover:text-foreground" @click="ui.toggleMobileNav()">
          <IconClose class="h-5 w-5" />
        </button>
      </div>

      <!-- Campaign switcher -->
      <CampaignSwitcher />

      <!-- Navigation — `desktopOnly` groups (e.g. "Publish") are filtered
           out because their tools target letter/A4 output that's unusable
           on a phone. The desktop sidebar still shows them. -->
      <nav class="flex-1 overflow-y-auto px-2 py-4">
        <template v-for="group in mobileNavGroups" :key="group.label">
          <p
            class="px-2 pt-4 pb-1 font-cinzel text-[10px] font-bold tracking-widest text-muted-foreground/60 uppercase first:pt-0"
          >
            {{ group.label }}
          </p>
          <NavItem
            v-for="item in group.items"
            :key="item.to"
            :item="item"
            @navigate="ui.toggleMobileNav()"
          />
        </template>
      </nav>

      <!-- Admin link -->
      <template v-if="auth.isAppAdmin">
        <div class="gold-divider mx-3" />
        <div class="px-2 py-2">
          <p class="px-2 pb-1 font-cinzel text-[10px] font-bold tracking-widest text-muted-foreground/60 uppercase">System</p>
          <RouterLink
            to="/admin"
            class="flex items-center gap-2.5 px-3 py-2 rounded-md text-xs font-fell transition-colors"
            :class="$route.path.startsWith('/admin') ? 'bg-secondary text-foreground' : 'text-muted-foreground hover:bg-secondary/60 hover:text-foreground'"
            @click="ui.toggleMobileNav()"
          >
            <IconShieldCheck class="h-4 w-4 shrink-0" />
            Admin
          </RouterLink>
        </div>
      </template>

      <!-- User -->
      <div class="gold-divider mx-3" />
      <div class="px-3 py-4">
        <div class="flex items-center gap-2 px-2 py-2 text-sm text-muted-foreground">
          <div class="h-7 w-7 rounded-full bg-secondary flex items-center justify-center shrink-0">
            <span class="font-cinzel text-xs text-foreground font-semibold">
              {{ userInitial }}
            </span>
          </div>
          <span class="flex-1 truncate font-fell text-xs">{{ userEmail }}</span>
          <button
            v-if="canInstall"
            class="hover:text-foreground transition-colors"
            :title="hasNativePrompt ? 'Install app' : 'Open your browser menu → Add to Home Screen'"
            @click="hasNativePrompt && install()"
          >
            <IconDownload class="h-4 w-4" />
          </button>
          <button
            class="hover:text-foreground transition-colors"
            title="Sign out"
            @click="handleSignOut"
          >
            <IconLogOut class="h-4 w-4" />
          </button>
        </div>
      </div>
    </aside>
  </Transition>
</template>

<script setup lang="ts">
import { computed, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import { IconClose, IconDownload, IconLogOut, IconShieldCheck } from '@/lib/icons';
import { usePwaInstall } from "@/composables/usePwaInstall";
import { useAuthStore } from "@/stores/auth";
import { useUiStore } from "@/stores/ui";
import { NAV_GROUPS } from "@/lib/nav";
import { useOptionalRules, isRuleEffectivelyEnabled } from "@/composables/useOptionalRules";
import NavItem from "./NavItem.vue";
import CampaignSwitcher from "./CampaignSwitcher.vue";

const auth = useAuthStore();
const ui = useUiStore();
const router = useRouter();
const route = useRoute();
const { canInstall, hasNativePrompt, install } = usePwaInstall();

// Close drawer on any navigation (handles campaign switcher, settings link, etc.)
watch(() => route.path, () => { if (ui.mobileNavOpen) ui.toggleMobileNav(); });

const userEmail = computed(() => auth.userEmail ?? "");
const userInitial = computed(() => userEmail.value.charAt(0).toUpperCase() || "?");

const { data: campaignRules } = useOptionalRules();
const mobileNavGroups = computed(() =>
  NAV_GROUPS
    .filter((g) => !g.desktopOnly)
    .map((group) => ({
      ...group,
      items: group.items.filter((item) =>
        !item.ruleKey || isRuleEffectivelyEnabled(campaignRules.value, item.ruleKey),
      ),
    }))
    .filter((group) => group.items.length > 0),
);

async function handleSignOut() {
  ui.toggleMobileNav();
  await auth.signOut();
  router.push({ name: "login" });
}
</script>

<style scoped>
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.2s ease;
}
.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}

.slide-enter-active,
.slide-leave-active {
  transition: transform 0.25s ease;
}
.slide-enter-from,
.slide-leave-to {
  transform: translateX(-100%);
}
</style>
