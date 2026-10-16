<template>
  <div class="flex flex-col gap-2 rounded-md border border-dashed border-border bg-muted/40 p-3">
    <p class="text-eyebrow font-semibold text-muted-foreground">Offers</p>
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
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import EntityCombobox from "@/components/common/controls/EntityCombobox.vue";
import { useQuests } from "@/composables/quests/useQuests";
import { useScriptoriumDocuments } from "@/composables/scriptorium/useScriptorium";
import { isDocumentUsableIn } from "@/lib/scriptorium/documentScope";
import type { PinDraft } from "./pinDraft";

/** The quest and the handout a notice carries. Both stay in the board's own campaign, which the database also enforces. */
const { draft, campaignId } = defineProps<{ draft: PinDraft; campaignId: string }>();

const { data: quests } = useQuests();
const { data: documents } = useScriptoriumDocuments();

const questOptions = computed(() => (quests.value ?? []).map((q) => ({ id: q.id, name: q.title })));
// Only handouts usable in this campaign: its own plus the account-wide ones, never another campaign's private prose.
const handoutOptions = computed(() =>
  (documents.value ?? []).filter((d) => isDocumentUsableIn(d, campaignId)).map((d) => ({ id: d.id, name: d.title })),
);

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
