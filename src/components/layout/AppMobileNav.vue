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
          <X class="h-5 w-5" />
        </button>
      </div>

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
            class="hover:text-foreground transition-colors"
            title="Sign out"
            @click="handleSignOut"
          >
            <LogOut class="h-4 w-4" />
          </button>
        </div>
      </div>
    </aside>
  </Transition>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { useRouter } from "vue-router";
import { X, LogOut } from "lucide-vue-next";
import { useAuthStore } from "@/stores/auth";
import { useUiStore } from "@/stores/ui";
import { NAV_GROUPS } from "@/lib/nav";
import { useOptionalRules, isRuleEffectivelyEnabled } from "@/composables/useOptionalRules";
import NavItem from "./NavItem.vue";

const auth = useAuthStore();
const ui = useUiStore();
const router = useRouter();

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
