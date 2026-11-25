<template>
  <form class="flex flex-col gap-2" data-testid="timeline-add" @submit.prevent="submit">
    <AppInput v-model="title" tone="filled" size="body" placeholder="What happened, or will happen" aria-label="Event title" />
    <WorldDateField :date="date" @change="date = $event" />
    <div class="flex flex-wrap items-center gap-2">
      <AppButton type="submit" variant="outline" :icon="IconAdd" icon-size="xs" label="Add an event" :loading="busy" :disabled="title.trim() === '' || date.year === null" />
      <p class="m-0 text-caption text-muted-foreground">
        {{ arcLabel === null ? "It is kept as a piece of history in Lore." : `It is kept as history in Lore, in the arc “${arcLabel}”.` }}
      </p>
    </div>
  </form>
</template>

<script setup lang="ts">
/**
 * "Add an event" on the timeline (#1279 item 33): a title and a date in the world make a Lore entry of kind history,
 * in the arc the page is narrowed to, so the event lands on the timeline and can be written up in Lore. The entry is made,
 * then dated, because a new entry takes no date; if the dating fails the entry is taken back, so a dateless event never
 * stays behind (the timeline only lists dated ones, so it would be invisible).
 */
import { ref } from "vue";
import { useQueryClient } from "@tanstack/vue-query";
import AppButton from "@/components/common/controls/AppButton.vue";
import AppInput from "@/components/common/controls/AppInput.vue";
import { IconAdd } from "@/lib/icons";
import { toast } from "@/lib/toast";
import { CANON_KEY } from "@/lib/campaignLiveSync/registry";
import { createCanonEntry, discardCanonEntry, updateCanonEntry } from "@/composables/canon/useCanonEntries";
import { useCampaignStore } from "@/stores/campaign";
import { useCanonUiStore } from "@/stores/ui/canon";
import type { WorldDate } from "@/lib/canon/canonLore";
import WorldDateField from "./WorldDateField.vue";

const { arcLabel = null, sortOrder } = defineProps<{ arcLabel?: string | null; sortOrder: number }>();

const campaign = useCampaignStore();
const ui = useCanonUiStore();
const queryClient = useQueryClient();

const title = ref("");
const date = ref<WorldDate>({ year: null, month: null, day: null });
const busy = ref(false);

async function submit() {
  const words = title.value.trim();
  const campaignId = campaign.activeCampaignId;
  if (busy.value || words === "" || date.value.year === null || campaignId === null) return;
  busy.value = true;
  try {
    const created = await createCanonEntry(campaignId, { part: "lore", title: words, lore_kind: "history", sort_order: sortOrder, arc_id: ui.arcFilter });
    try {
      await updateCanonEntry(created.id, { world_year: date.value.year, world_month: date.value.month, world_day: date.value.day });
    } catch (e) {
      await discardCanonEntry(created.id).catch(() => undefined);
      throw e;
    }
    title.value = "";
    date.value = { year: null, month: null, day: null };
    await queryClient.invalidateQueries({ queryKey: [CANON_KEY] });
  } catch (e) {
    toast.error(toast.fromError(e));
  } finally {
    busy.value = false;
  }
}
</script>
