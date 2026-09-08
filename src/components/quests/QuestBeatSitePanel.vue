<template>
  <section class="rounded-xl border border-border bg-card p-3" aria-label="Site">
    <header class="flex items-center gap-2">
      <h3 class="font-cinzel text-sm font-bold text-foreground">Site</h3>
      <span class="ml-auto rounded bg-muted px-1.5 py-0.5 text-label uppercase text-muted-foreground">
        {{ site ? `site · ${roomCount} room${roomCount === 1 ? '' : 's'}` : 'none' }}
      </span>
    </header>

    <div v-if="site" class="mt-2 flex min-w-0 items-center gap-2 rounded-md border border-border p-2 text-caption">
      <span class="flex h-6.5 w-6.5 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground"><IconDungeon class="h-3.5 w-3.5" /></span>
      <div class="min-w-0 flex-1">
        <p class="truncate font-cinzel text-label-lg font-bold text-foreground">{{ site.name }}</p>
        <p class="text-muted-foreground">{{ roomCount }} room{{ roomCount === 1 ? '' : 's' }}</p>
      </div>
      <AppButton :to="`/locations/${site.id}`" label="Open in Atlas" size="xs" variant="subtle" />
    </div>

    <div v-else-if="choosingSite" class="mt-2 flex min-w-0 items-center gap-2 rounded-md border border-dashed border-border p-2">
      <EntityCombobox v-model="chosenSiteId" class="min-w-0 flex-1" :options="siteOptions" placeholder="Which site…" />
      <AppButton label="Cancel" size="xs" variant="subtle" @click="choosingSite = false" />
    </div>

    <div v-else class="mt-2 flex min-w-0 items-center gap-2 rounded-md border border-dashed border-border p-2 text-caption">
      <span class="flex h-6.5 w-6.5 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground"><IconDungeon class="h-3.5 w-3.5" /></span>
      <div class="min-w-0 flex-1">
        <p class="font-cinzel text-label-lg font-bold text-foreground">This beat can become a crawl</p>
        <p class="text-muted-foreground">Stage it at a location that is a site with a floor plan and Run gains the room surface</p>
      </div>
      <AppButton label="Choose site" size="xs" :loading="staging" @click="choosingSite = true" />
    </div>
    <p v-if="stagingError" role="alert" class="mt-1 text-caption text-destructive">{{ stagingError }}</p>
  </section>
</template>

<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { useLocationTree } from "@/composables/locations/useLocations";
import { useUpdateQuestBeat } from "@/composables/quests/useQuestFlow";
import { isSiteType } from "@/lib/locations/tiers";
import { IconDungeon } from "@/lib/icons";
import type { QuestBeat } from "@/types/quest.types";
import AppButton from "@/components/common/AppButton.vue";
import EntityCombobox from "@/components/common/EntityCombobox.vue";

const { beat } = defineProps<{ beat: QuestBeat }>();
const { locationOptions } = useLocationTree();
const updateBeat = useUpdateQuestBeat();

const site = computed(() => {
  const location = beat.staged_at_location_id
    ? locationOptions.value.find((candidate) => candidate.id === beat.staged_at_location_id)
    : undefined;
  return location && isSiteType(location.location_type) ? location : null;
});
const roomCount = computed(() => site.value
  ? locationOptions.value.filter((candidate) => candidate.parent_id === site.value!.id && candidate.location_type === "room").length
  : 0);
const siteOptions = computed(() => locationOptions.value.filter((candidate) => isSiteType(candidate.location_type)));

const choosingSite = ref(false);
const staging = ref(false);
const stagingError = ref("");

// The picker always reads back "" — like `StoreInventory`'s add box, this is a
// picker for a target to act on, not a field holding a live value, so it
// empties itself on every selection rather than showing what was just chosen.
const chosenSiteId = computed<string>({
  get: () => "",
  set: (nextId) => { if (nextId) void chooseSite(nextId); },
});

async function chooseSite(nextId: string) {
  staging.value = true;
  stagingError.value = "";
  try {
    await updateBeat.mutateAsync({ id: beat.id, questId: beat.quest_id, update: { staged_at_location_id: nextId } });
    choosingSite.value = false;
  } catch (caught) {
    stagingError.value = caught instanceof Error ? caught.message : "Could not stage this beat at a site";
  } finally {
    staging.value = false;
  }
}

watch(() => beat.id, () => { choosingSite.value = false; stagingError.value = ""; });
</script>
