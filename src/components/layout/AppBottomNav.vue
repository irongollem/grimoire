<template>
  <nav
    class="md:hidden fixed bottom-0 inset-x-0 z-40 bg-card border-t border-border"
    aria-label="Main navigation"
  >
    <div
      class="flex items-stretch justify-around"
      :style="{ paddingBottom: 'env(safe-area-inset-bottom)', paddingLeft: 'env(safe-area-inset-left)', paddingRight: 'env(safe-area-inset-right)' }"
    >
      <RouterLink
        v-for="item in PINNED"
        :key="item.to"
        :to="item.to"
        class="flex flex-col items-center justify-center gap-0.5 flex-1 py-2.5 transition-colors"
        :class="isActive(item.to) ? 'text-primary' : 'text-muted-foreground hover:text-foreground'"
      >
        <component :is="item.icon" class="h-5 w-5 shrink-0" />
        <span class="font-cinzel text-[9px] tracking-wider">{{ item.label }}</span>
      </RouterLink>

      <button
        type="button"
        class="flex flex-col items-center justify-center gap-0.5 flex-1 py-2.5 transition-colors"
        :class="ui.mobileNavOpen ? 'text-primary' : 'text-muted-foreground hover:text-foreground'"
        aria-label="More navigation options"
        @click="ui.toggleMobileNav()"
      >
        <IconGridView class="h-5 w-5 shrink-0" />
        <span class="font-cinzel text-[9px] tracking-wider">More</span>
      </button>
    </div>
  </nav>
</template>

<script setup lang="ts">
import { useRoute } from "vue-router";
import { IconDashboard, IconEncounter, IconFaction, IconGridView, IconParty } from "@/lib/icons";
import { useUiStore } from "@/stores/ui";

const route = useRoute();
const ui = useUiStore();

const PINNED = [
  { label: "Home",       to: "/dashboard",  icon: IconDashboard  },
  { label: "NPCs",       to: "/npcs",       icon: IconParty      },
  { label: "Encounters", to: "/encounters", icon: IconEncounter  },
  { label: "Atlas",      to: "/locations",  icon: IconFaction    },
] as const;

function isActive(to: string): boolean {
  return to === "/dashboard" ? route.path === "/dashboard" : route.path.startsWith(to);
}
</script>
