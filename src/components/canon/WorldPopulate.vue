<template>
  <div v-if="populateSetting" class="space-y-2 rounded-md border border-border bg-muted/40 px-3 py-3" data-testid="world-populate">
    <div class="flex items-center justify-between gap-2">
      <div class="min-w-0">
        <p class="text-label-lg font-semibold text-foreground">POPULATE FROM {{ populateSetting.label.toUpperCase() }}</p>
        <p class="mt-0.5 text-caption text-muted-foreground">Seeds locations, notable NPCs, and factions. Skips existing entries.</p>
      </div>
      <AppButton
        type="button"
        variant="primary"
        size="sm"
        class="shrink-0"
        :disabled="isPopulating"
        :label="isPopulating ? 'Populating…' : 'Populate'"
        :icon="IconGenerate"
        icon-size="xs"
        @click="doPopulate"
      />
    </div>
    <p v-if="populateError" class="text-caption text-destructive">{{ populateError }}</p>
    <p v-else-if="populateResult" class="text-caption text-muted-foreground">
      Added {{ populateResult.locations }} location<span v-if="populateResult.locations !== 1">s</span>,
      {{ populateResult.npcs }} NPC<span v-if="populateResult.npcs !== 1">s</span>,
      {{ populateResult.factions }} faction<span v-if="populateResult.factions !== 1">s</span>.
    </p>
  </div>
</template>

<script setup lang="ts">
/**
 * "Populate from <setting>": seeds places, notable people and factions from the named world the campaign's calendar
 * belongs to. It hangs off the SAVED calendar (the seeders read the campaign row), so it never offers a setting the
 * DM has picked but not yet saved. It moved here from the Details tab with the calendar.
 */
import { computed, ref } from "vue";
import AppButton from "@/components/common/controls/AppButton.vue";
import { usePopulateFactions } from "@/composables/factions/useFactions";
import { usePopulateLocations } from "@/composables/locations/useLocations";
import { usePopulateSettingNpcs } from "@/composables/npcs/useNpcs";
import { IconGenerate } from "@/lib/icons";
import { getSetting } from "@/settings/index";

const { calendarId } = defineProps<{ calendarId: string | null }>();

const populateSetting = computed(() => (calendarId === null ? undefined : getSetting(calendarId)));

const { mutateAsync: populateLocations, isPending: isPopulatingLocations } = usePopulateLocations();
const { mutateAsync: populateFactions, isPending: isPopulatingFactions } = usePopulateFactions();
const { mutateAsync: populateNpcs, isPending: isPopulatingNpcs } = usePopulateSettingNpcs();
const isPopulating = computed(() => isPopulatingLocations.value || isPopulatingFactions.value || isPopulatingNpcs.value);

const populateResult = ref<{ locations: number; factions: number; npcs: number } | null>(null);
const populateError = ref<string | null>(null);

async function doPopulate() {
  populateResult.value = null;
  populateError.value = null;
  try {
    const [locations, factions, npcs] = await Promise.all([populateLocations(), populateFactions(), populateNpcs()]);
    populateResult.value = { locations, factions, npcs };
  } catch (e) {
    populateError.value = e instanceof Error ? e.message : "Unknown error";
  }
}
</script>
