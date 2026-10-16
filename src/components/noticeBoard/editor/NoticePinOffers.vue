<template>
  <div class="flex flex-col gap-2 rounded-md border border-dashed border-border bg-muted/40 p-3" data-pin-offers>
    <p class="text-eyebrow font-semibold text-muted-foreground">Offers</p>
    <template v-if="locked">
      <p class="text-caption text-muted-foreground">
        A taken notice keeps what it offered. Pin it back up to change it.
      </p>
      <dl class="space-y-1 text-caption">
        <div class="flex gap-2">
          <dt class="font-semibold text-foreground">Quest</dt>
          <dd class="text-muted-foreground">{{ nameOf(questOptions, draft.quest_id) ?? "None" }}</dd>
        </div>
        <div class="flex gap-2">
          <dt class="font-semibold text-foreground">Handout</dt>
          <dd class="text-muted-foreground">{{ nameOf(handoutOptions, draft.handout_id) ?? "None" }}</dd>
        </div>
      </dl>
    </template>
    <template v-else>
      <p class="text-caption text-muted-foreground">
        When a player takes this notice, the quest is revealed to the whole party and the handout is shared with them.
      </p>
      <div class="space-y-1">
        <label class="text-caption font-semibold text-foreground">Quest</label>
        <EntityCombobox v-model="questModel" :options="questOptions" placeholder="No quest" />
      </div>
      <div class="space-y-1">
        <label class="text-caption font-semibold text-foreground">Handout</label>
        <EntityCombobox v-model="handoutModel" :options="handoutOptions" placeholder="No handout" />
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import EntityCombobox from "@/components/common/controls/EntityCombobox.vue";
import { useQuests } from "@/composables/quests/useQuests";
import { useScriptoriumDocuments } from "@/composables/scriptorium/useScriptorium";
import type { PinDraft } from "./pinDraft";

/**
 * The quest and the handout a notice carries. Both must belong to the board's own campaign, which the database also
 * enforces (notice_pin_offers_this_campaign): a take reveals and shares within that campaign only, so an account-wide
 * handout or a campaign-less quest would be offered and never given. A taken notice's offer is fixed, also enforced.
 */
const { draft, campaignId, locked = false } = defineProps<{ draft: PinDraft; campaignId: string; locked?: boolean }>();

const { data: quests } = useQuests();
const { data: documents } = useScriptoriumDocuments();

const questOptions = computed(() =>
  (quests.value ?? []).filter((q) => q.campaign_id === campaignId).map((q) => ({ id: q.id, name: q.title })),
);
const handoutOptions = computed(() =>
  (documents.value ?? []).filter((d) => d.campaign_id === campaignId).map((d) => ({ id: d.id, name: d.title })),
);

function nameOf(options: { id: string; name: string }[], id: string | null): string | null {
  if (id === null) return null;
  const option = options.find((o) => o.id === id);
  return option ? option.name : null;
}

// The combobox speaks "" for none; the row speaks null.
const questModel = computed({
  get: () => (draft.quest_id === null ? "" : draft.quest_id),
  set: (id: string) => {
    draft.quest_id = id || null;
  },
});
const handoutModel = computed({
  get: () => (draft.handout_id === null ? "" : draft.handout_id),
  set: (id: string) => {
    draft.handout_id = id || null;
  },
});
</script>
