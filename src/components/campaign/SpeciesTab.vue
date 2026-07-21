<template>
  <div class="flex flex-col gap-4">
    <p class="font-fell text-sm text-muted-foreground">
      Toggle which species are available when creating party members. Disabled species are hidden from the race picker.
      Campaign-only species (marked exclusively for this campaign) are always available here.
    </p>

    <!-- Campaign-only species (informational) -->
    <div v-if="campaignSpecies.length > 0" class="rounded-lg border border-border bg-card overflow-hidden">
      <div class="px-4 py-3 border-b border-border bg-muted/20 flex items-center gap-2">
        <span class="text-label-lg font-semibold text-muted-foreground">CAMPAIGN-ONLY SPECIES</span>
        <span class="text-label text-primary/70">exclusive to this campaign</span>
      </div>
      <div class="divide-y divide-border">
        <div
          v-for="sp in campaignSpecies"
          :key="sp.id"
          class="flex items-center gap-3 px-4 py-2.5"
        >
          <div class="h-4 w-4 shrink-0 flex items-center justify-center">
            <div class="h-2 w-2 rounded-full bg-primary/60" />
          </div>
          <span class="font-fell text-sm text-foreground flex-1">{{ sp.name }}</span>
          <span class="text-label text-primary/60 shrink-0">campaign-only</span>
        </div>
      </div>
    </div>

    <!-- Universal species with enable/disable toggles -->
    <div v-if="universalSpecies.length > 0" class="rounded-lg border border-border bg-card overflow-hidden">
      <div class="px-4 py-3 border-b border-border bg-muted/20">
        <span class="text-label-lg font-semibold text-muted-foreground">UNIVERSAL SPECIES</span>
      </div>
      <div class="divide-y divide-border">
        <label
          v-for="sp in universalSpecies"
          :key="sp.id"
          class="flex items-center gap-3 px-4 py-2.5 cursor-pointer hover:bg-muted/20 transition-colors"
        >
          <input
            type="checkbox"
            :checked="!disabled.has(sp.id)"
            class="h-4 w-4 rounded border-border bg-background shrink-0"
            @change="toggle(sp.id)"
          />
          <span class="font-fell text-sm text-foreground flex-1">{{ sp.name }}</span>
          <span
            v-if="disabled.has(sp.id)"
            class="text-label text-muted-foreground/60 shrink-0"
          >hidden</span>
        </label>
      </div>
    </div>

    <div v-if="disabled.size > 0" class="flex items-center justify-between">
      <p class="font-fell text-xs text-muted-foreground italic">
        {{ disabled.size }} species hidden from party member picker.
      </p>
      <button
        type="button"
        class="text-label text-primary/70 hover:text-primary transition-colors"
        @click="enableAll"
      >
        Enable all
      </button>
    </div>

    <p v-if="universalSpecies.length === 0 && campaignSpecies.length === 0" class="font-fell text-sm text-muted-foreground italic">
      No species found. Create some in the Species codex first.
    </p>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch } from "vue";
import { useCampaignStore } from "@/stores/campaign";
import { useUpdateCampaign } from "@/composables/useCampaigns";
import { useAllSpecies } from "@/composables/useSpecies";

const campaign = useCampaignStore();
const { mutate: updateCampaign } = useUpdateCampaign();
const { data: allSpecies } = useAllSpecies();

const campaignSpecies = computed(() =>
  (allSpecies.value ?? []).filter((s) => s.campaign_id === campaign.activeCampaignId),
);

const universalSpecies = computed(() =>
  (allSpecies.value ?? []).filter((s) => s.campaign_id === null),
);

const disabled = ref(new Set<string>(campaign.activeCampaign?.disabled_species_ids ?? []));

watch(
  () => campaign.activeCampaign?.disabled_species_ids,
  (val) => { disabled.value = new Set(val ?? []); },
);

function persist() {
  if (!campaign.activeCampaignId) return;
  updateCampaign({ id: campaign.activeCampaignId, update: { disabled_species_ids: [...disabled.value] } });
}

function toggle(speciesId: string) {
  if (disabled.value.has(speciesId)) disabled.value.delete(speciesId);
  else disabled.value.add(speciesId);
  disabled.value = new Set(disabled.value);
  persist();
}

function enableAll() {
  disabled.value = new Set();
  persist();
}
</script>
