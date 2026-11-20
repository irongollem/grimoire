<template>
  <div class="space-y-4">
    <p class="text-body text-muted-foreground">
      A party's speed is a creature's speed in feet divided by ten, in miles an hour. The pace, the ground and
      whether the way of travelling is at home on that ground do the rest. Every number here starts as the
      books', and anything you change is yours alone: put the book's back whenever you like.
    </p>

    <section class="rounded-lg border border-border bg-card p-4 space-y-2">
      <label class="block">
        <span class="text-label-lg font-semibold text-foreground">Land with no road is</span>
        <AppSelect v-model="openLand" class="mt-1" block data-testid="open-land-select" :disabled="saving">
          <option v-for="t in terrains" :key="t.key" :value="t.key">{{ t.name }}</option>
        </AppSelect>
      </label>
      <p class="text-caption text-muted-foreground">
        A journey measured across a map goes over it. Icewind Dale: Snow.
      </p>
    </section>

    <TravelTerrainsSection />
    <TravelWaysSection />
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import AppSelect from "@/components/common/controls/AppSelect.vue";
import { useUpdateCampaign } from "@/composables/campaign/useCampaigns";
import { useTravel } from "@/composables/locations/useTravel";
import { useToast } from "@/composables/useToast";
import { useCampaignStore } from "@/stores/campaign";
import TravelTerrainsSection from "./TravelTerrainsSection.vue";
import TravelWaysSection from "./TravelWaysSection.vue";

const campaign = useCampaignStore();
const toast = useToast();
const { terrains, openLand: stored } = useTravel();
const update = useUpdateCampaign();
const saving = computed(() => update.isPending.value);

const openLand = computed({
  get: () => stored.value,
  set: (terrain: string) => {
    const id = campaign.activeCampaignId;
    if (!id) return;
    update.mutate({ id, update: { open_land_terrain: terrain } }, { onError: (e) => toast.error(toast.fromError(e)) });
  },
});
</script>
