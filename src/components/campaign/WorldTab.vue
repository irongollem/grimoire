<template>
  <!-- World Settings: theme, calendar, locations, and other campaign-wide config -->
  <div class="max-w-md flex flex-col gap-6">
    <div class="rounded-lg border border-border bg-card overflow-hidden">
      <div class="px-4 py-3 border-b border-border bg-muted/20">
        <span class="font-cinzel text-xs font-semibold text-muted-foreground tracking-wider">Theme</span>
      </div>
      <div class="p-4 flex flex-col gap-3">
        <button
          v-for="theme in themes"
          :key="theme.id"
          type="button"
          class="flex items-center gap-3 rounded-lg border px-4 py-3 transition-colors text-left"
          :class="activeThemeId === theme.id
            ? 'border-primary bg-primary/10'
            : 'border-border hover:border-border/80 hover:bg-muted/40'"
          @click="pick(theme.id)"
        >
          <!-- Colour swatch -->
          <div class="shrink-0 flex gap-1">
            <span class="block h-5 w-5 rounded-full border border-black/10" :style="{ background: theme.vars['--background'] }" />
            <span class="block h-5 w-5 rounded-full border border-black/10" :style="{ background: theme.vars['--primary'] }" />
            <span class="block h-5 w-5 rounded-full border border-black/10" :style="{ background: theme.vars['--card'] }" />
          </div>

          <p class="flex-1 font-cinzel text-sm font-semibold text-foreground tracking-wide">{{ theme.label }}</p>

          <Check v-if="activeThemeId === theme.id" class="h-4 w-4 text-primary shrink-0" />
        </button>
      </div>
    </div>

    <p class="font-fell text-xs text-muted-foreground/60 italic">
      Applies to all players in this campaign immediately on their next page load.
    </p>
  </div>
</template>

<script setup lang="ts">
import { Check } from "lucide-vue-next";
import { useTheme } from "@/composables/useTheme";
import { useUpdateCampaign } from "@/composables/useCampaigns";
import { useCampaignStore } from "@/stores/campaign";

const { themes, activeThemeId, setTheme } = useTheme();
const { mutateAsync: updateCampaign } = useUpdateCampaign();
const campaign = useCampaignStore();

async function pick(id: string) {
  setTheme(id);
  if (campaign.activeCampaignId) {
    await updateCampaign({ id: campaign.activeCampaignId, update: { theme: id } });
    // Keep local activeCampaign in sync so switchToCampaign won't revert it
    if (campaign.activeCampaign) campaign.activeCampaign.theme = id;
  }
}
</script>
