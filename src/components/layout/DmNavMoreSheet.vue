<template>
  <MobileSheet :open="open" title="All sections" @update:open="emit('update:open', $event)">
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
    <div
      class="mb-4 flex w-full overflow-hidden rounded-md border border-border"
    >
      <button
        v-for="m in modes"
        :key="m.value"
        type="button"
        class="flex-1 px-3 py-2 font-cinzel text-xs font-bold tracking-widest transition-colors"
        :class="ui.dmMode === m.value
          ? 'bg-primary/15 text-primary'
          : 'text-muted-foreground hover:bg-secondary/60'"
        @click="setMode(m.value)"
      >
        {{ m.label }}
      </button>
    </div>

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

    <p class="mt-4 px-1 text-center text-2xs font-fell text-muted-foreground/60">
      Dot = currently pinned to the {{ ui.dmMode }} bar.
    </p>

    <button
      v-if="updateAvailable"
      type="button"
      class="mt-4 flex w-full items-center justify-center gap-2 rounded-md border border-primary/40 bg-primary/10 px-3 py-3 font-cinzel text-xs font-bold tracking-wider text-primary transition-colors hover:bg-primary/20"
      @click="reloadApp"
    >
      <IconRefresh class="h-4 w-4 shrink-0" />
      Reload to update
    </button>
  </MobileSheet>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { useRoute, useRouter } from "vue-router";
import MobileSheet from "@/components/common/MobileSheet.vue";
import { IconAdd, IconRefresh } from "@/lib/icons";
import { NAV_GROUPS, type NavItem } from "@/lib/nav";
import { updateAvailable, reloadApp } from "@/composables/useAppUpdate";
import { useUiStore } from "@/stores/ui";
import { useCampaignStore } from "@/stores/campaign";
import { useOptionalRules, isRuleEffectivelyEnabled } from "@/composables/useOptionalRules";

const { open = false, barRoutes = [], create = null } = defineProps<{
  open?: boolean;
  /** Routes pinned to the bottom bar for the current mode (gets a gold dot). */
  barRoutes?: string[];
  /** Context-aware create action for the current section, or null if none. */
  create?: { to: string; label: string } | null;
}>();

const emit = defineEmits<{ "update:open": [boolean] }>();

const route = useRoute();
const router = useRouter();
const ui = useUiStore();
const campaignStore = useCampaignStore();

const hasCampaign = computed(() => !!campaignStore.activeCampaignId);

const modes = [
  { value: "prep", label: "Prep mode" },
  { value: "play", label: "Play mode" },
] as const;

function setMode(m: "prep" | "play") {
  ui.dmMode = m;
}

const { data: campaignRules } = useOptionalRules();

// Drive the grid off the real nav registry. `desktopOnly` groups (A4/letter
// output tools) stay desktop-only; rule-gated items follow their campaign rule.
const groups = computed(() =>
  NAV_GROUPS
    .filter((g) => !g.desktopOnly)
    .map((group) => ({
      ...group,
      items: group.items.filter(
        (item) => !item.ruleKey || isRuleEffectivelyEnabled(campaignRules.value, item.ruleKey),
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
  router.push(create.to);
}
</script>
