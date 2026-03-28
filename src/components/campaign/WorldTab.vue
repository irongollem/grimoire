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

    <!-- Immersive Rolls -->
    <div class="rounded-lg border border-border bg-card overflow-hidden">
      <div class="px-4 py-3 border-b border-border bg-muted/20">
        <span class="font-cinzel text-xs font-semibold text-muted-foreground tracking-wider">Gameplay</span>
      </div>
      <div class="p-4">
        <label class="flex items-start gap-3 cursor-pointer group">
          <div class="shrink-0 mt-0.5">
            <div
              class="h-5 w-9 rounded-full border-2 transition-colors relative"
              :class="immersiveRolls ? 'bg-primary border-primary' : 'bg-muted border-border'"
              @click="toggleImmersiveRolls"
            >
              <div
                class="absolute top-0.5 h-3 w-3 rounded-full bg-white shadow transition-transform"
                :class="immersiveRolls ? 'translate-x-4' : 'translate-x-0.5'"
              />
            </div>
          </div>
          <div class="flex-1 min-w-0" @click="toggleImmersiveRolls">
            <p class="font-cinzel text-sm font-semibold text-foreground">Immersive Rolls</p>
            <p class="font-fell text-xs text-muted-foreground mt-0.5">
              When enabled, certain player skill checks (stealth, knowledge checks, insight, etc.) post only flavor text to public chat. The full result is whispered privately to the DM — the player does not see their own dice outcome.
            </p>
          </div>
        </label>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { Check } from "lucide-vue-next";
import { useTheme } from "@/composables/useTheme";
import { useUpdateCampaign } from "@/composables/useCampaigns";
import { useCampaignStore } from "@/stores/campaign";

const { themes, activeThemeId, setTheme } = useTheme();
const { mutateAsync: updateCampaign } = useUpdateCampaign();
const campaign = useCampaignStore();

const immersiveRolls = computed(() => campaign.activeCampaign?.immersive_rolls ?? false);

async function toggleImmersiveRolls() {
  if (!campaign.activeCampaignId || !campaign.activeCampaign) return;
  const next = !immersiveRolls.value;
  await updateCampaign({ id: campaign.activeCampaignId, update: { immersive_rolls: next } });
  campaign.activeCampaign.immersive_rolls = next;
}

async function pick(id: string) {
  setTheme(id);
  if (campaign.activeCampaignId) {
    await updateCampaign({ id: campaign.activeCampaignId, update: { theme: id } });
    // Keep local activeCampaign in sync so switchToCampaign won't revert it
    if (campaign.activeCampaign) campaign.activeCampaign.theme = id;
  }
}
</script>
