<template>
  <EntityDetailModal
    :title="displayName"
    :subtitle="subtitle"
    :loading="isLoading && trail.length === 0"
    contained
    :origin-key="`/npcs/${id}`"
    @close="emit('close')"
  >
    <template v-if="trail.length > 0" #leading>
      <AppButton
        variant="ghost"
        size="icon-sm"
        :icon="IconChevronLeft"
        :aria-label="backLabel"
        :tooltip="backLabel"
        @click="trail.pop()"
      />
    </template>
    <template #actions>
      <NpcRevealControl v-if="preview" :npc="preview" />
      <AppButton
        variant="subtle"
        size="sm"
        label="Edit"
        :icon="IconEdit"
        :to="`/npcs/${shownId}?edit=true`"
      />
    </template>

    <!-- Kept alive along the trail, so Back returns to the tab the DM left (usually Relations). No cap: an
         evicted sheet would lose its tab, and the cache lives only as long as this modal. -->
    <KeepAlive>
      <NpcSheet v-if="preview && !failed" :key="shownId" :npc="preview" :full="npc" />
    </KeepAlive>
    <!-- A trail step skips the modal's spinner, so an NPC still being read says so rather than "not found". -->
    <div v-if="!preview && !failed && isLoading" class="flex justify-center py-16" role="status" aria-label="Loading">
      <BannerLoader class="h-6" />
    </div>
    <p v-else-if="!preview || failed" class="py-16 text-center text-body text-muted-foreground italic">
      {{ failed ? "This NPC could not be loaded." : "This NPC could not be found." }}
    </p>
  </EntityDetailModal>
</template>

<script setup lang="ts">
/**
 * An NPC's sheet, over the NPC grid.
 *
 * Nothing here is about being a modal — the shell, the dismissal and the flight
 * out of the card all belong to `EntityDetailModal`. This is the NPC-shaped
 * part: which name to show while an alter ego is in play, the two actions worth
 * having within reach of the artwork, and the sheet itself.
 */
import { computed, ref, watch } from "vue";
import { displayAge, displayDeath, isDeadRow } from "@/lib/calendar/age";
import { useCalendarStore } from "@/stores/calendar";
import { useCampaignStore } from "@/stores/campaign";
import AppButton from "@/components/common/controls/AppButton.vue";
import BannerLoader from "@/components/brand/BannerLoader.vue";
import EntityDetailModal from "@/components/common/overlays/EntityDetailModal.vue";
import NpcRevealControl from "@/components/npcs/NpcRevealControl.vue";
import NpcSheet from "@/components/npcs/NpcSheet.vue";
import { useNpcOpening, useNpcs } from "@/composables/npcs/useNpcs";
import { provideNpcModalNav } from "@/composables/npcs/useNpcPeek";
import { IconChevronLeft, IconEdit } from "@/lib/icons";
import { getNpcDisplayName } from "@/lib/npcDisplay";

const { id } = defineProps<{ id: string }>();

const emit = defineEmits<{ close: [] }>();

// The NPCs opened from a name in this one (family, connections), newest last. The
// modal shows the newest and a back arrow walks the trail, so a DM checking "who
// was that?" keeps their place in the NPC they were reading.
const trail = ref<string[]>([]);
const shownId = computed(() => trail.value.at(-1) ?? id);
watch(() => id, () => { trail.value = []; });
provideNpcModalNav({
  open(next: string) {
    if (next !== shownId.value) trail.value.push(next);
  },
});

const { data: allNpcs } = useNpcs();
const backLabel = computed(() => {
  const previousId = trail.value.at(-2) ?? id;
  const previous = (allNpcs.value ?? []).find((n) => n.id === previousId);
  return previous ? `Back to ${getNpcDisplayName(previous) ?? "the previous NPC"}` : "Back";
});

// Paints from the list row at once; the sheet takes the prose from `npc` once
// the record read by id lands (#999).
const { npc, preview, isLoading, failed } = useNpcOpening(shownId);

// `getNpcDisplayName` is honestly nullable — the player projection returns null
// for a name that is not revealed — so the "no name" case is marked rather than
// coerced. A DM looking at their own NPC always has one.
const displayName = computed(() => (preview.value ? getNpcDisplayName(preview.value) ?? "???" : "NPC"));

const calendar = useCalendarStore();
const campaignStore = useCampaignStore();

/** What this NPC is, in one line — the header's job now the sheet has dropped it. */
const subtitle = computed(() => {
  if (!preview.value) return undefined;
  const { race, occupation, alignment } = preview.value;
  const age = displayAge(calendar.adapter, preview.value, {
    year: campaignStore.todayYear, month: campaignStore.todayMonth, day: campaignStore.todayDay,
  });
  // A dead NPC reads "Died 12 Ches 1491, aged 63": one phrase, not "Died aged 63 · Died ...".
  const died = displayDeath(calendar.adapter, preview.value);
  const life = !isDeadRow(preview.value)
    ? (age ? `Age ${age}` : null)
    : died || age
      ? [died ? `Died ${died}` : "Died", age ? `aged ${age}` : null].filter(Boolean).join(", ")
      : null;
  return [race, occupation, alignment, life].filter(Boolean).join(" · ");
});
</script>
