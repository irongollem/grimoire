<template>
  <section class="flex min-w-0 flex-col gap-4 border border-border bg-card p-4" aria-label="A truth" data-testid="truth-detail">
    <div class="flex flex-col gap-1">
      <span class="text-eyebrow text-muted-foreground">Truth</span>
      <AppInput
        :key="revision"
        v-model.lazy="text"
        wrap
        size="body"
        tone="filled"
        aria-label="The truth"
        placeholder="What is true in this world…"
      />
      <!-- The story record cannot be opened at one fact, so the line leads to the page. -->
      <p v-if="entry.from_fact_id" class="m-0 text-caption text-muted-foreground" data-testid="truth-from-table">
        <AppButton to="/table/story" variant="link" size="inline" label="First said at the table." />
      </p>
    </div>

    <CanonEntryNotes
      :key="entry.id"
      :entry="entry"
      label="More about it"
      help="Players who read this truth read this too. Put what only you should see in a DM-only block."
      placeholder="Why it matters, what lies behind it…"
    />

    <div class="flex flex-col gap-2">
      <span class="text-eyebrow text-muted-foreground">Who knows it</span>
      <SegmentedControl
        :model-value="knowledge"
        :options="MARK_OPTIONS"
        block
        orientation="vertical"
        aria-label="Who knows it"
        @update:model-value="setKnowledge"
      />
      <p class="text-caption text-muted-foreground">{{ KNOWLEDGE_HELP }}</p>
    </div>

    <div v-if="knowledge === 'some'" class="flex flex-col gap-2" data-testid="known-to">
      <span class="text-eyebrow text-muted-foreground">Known to</span>
      <p v-if="!isLoading && knowers.length === 0" data-testid="name-who-knows" class="text-body italic text-muted-foreground">
        Nobody is named yet. Name the people or factions who know it.
      </p>
      <ul v-if="knowers.length > 0" class="flex flex-col gap-1.5">
        <li v-for="k in knowers" :key="k.row_id" class="flex items-center gap-2.5 border border-border bg-card py-1.5 pr-2 pl-1.5">
          <CanonRef :kind="k.other_kind" :name="k.other_name" size="lg" />
          <span class="min-w-0 flex-1">
            <span class="block truncate text-body font-bold leading-tight">{{ k.other_name }}</span>
            <span class="block text-caption italic text-muted-foreground">{{ k.other_kind === "faction" ? "faction" : "person" }} · known to</span>
          </span>
          <AppButton
            variant="ghost"
            size="icon-sm"
            :icon="IconClose"
            :aria-label="`${k.other_name} no longer knows it`"
            @click="forgetKnower(entry.id, k)"
          />
        </li>
      </ul>
      <div v-if="pickerOpen" class="flex flex-col gap-2" data-testid="knower-picker">
        <WorldEntityPicker :subject="subject" :kinds="KNOWER_KINDS" @pick="onPick" />
        <AppButton variant="ghost" size="sm" label="Done" class="self-start" @click="pickerOpen = false" />
      </div>
      <AppButton
        v-else
        variant="outline"
        size="sm"
        :icon="IconAdd"
        icon-size="xs"
        label="Who else knows"
        class="self-start"
        @click="pickerOpen = true"
      />
    </div>

    <EntryQuests :entry="entry" :links="questLinks" label="The quests that turn on it" empty="No quest turns on this yet." />

    <ConnectionsSection :subject="subject" :subject-name="entry.title" />

    <AppButton
      variant="destructive"
      size="sm"
      :icon="IconDelete"
      icon-size="xs"
      label="Delete this truth"
      class="self-start"
      @click="emit('delete')"
    />
  </section>
</template>

<script setup lang="ts">
/**
 * The selected truth (frame 03): its words, who knows it, the people and factions that do, and its other
 * connections. Everything saves as it is changed; there is nothing to confirm and nowhere to navigate.
 */
import { computed, ref, watch } from "vue";
import AppButton from "@/components/common/controls/AppButton.vue";
import AppInput from "@/components/common/controls/AppInput.vue";
import SegmentedControl from "@/components/common/controls/SegmentedControl.vue";
import WorldEntityPicker from "@/components/common/entity/WorldEntityPicker.vue";
import ConnectionsSection from "@/components/connections/ConnectionsSection.vue";
import CanonEntryNotes from "./CanonEntryNotes.vue";
import EntryQuests from "./EntryQuests.vue";
import CanonRef from "./CanonRef.vue";
import { KNOWLEDGE_HELP, MARK_OPTIONS } from "@/lib/canon/canonParts";
import { useEntryQuestLinks } from "@/composables/canon/useEntryQuestLinks";
import { useCommittedText } from "@/composables/canon/useCommittedText";
import { KNOWER_KINDS, useKnownTo } from "@/composables/canon/useKnownTo";
import { useUpdateCanonEntry } from "@/composables/canon/useCanonEntries";
import { IconAdd, IconClose, IconDelete } from "@/lib/icons";
import type { CanonEntry, KnowledgeMark } from "@/types/canon.types";
import type { WorldRef } from "@/types/connections.types";

const { entry } = defineProps<{ entry: CanonEntry }>();
const emit = defineEmits<{ delete: [] }>();

const subject = computed<WorldRef>(() => ({ kind: "canon", id: entry.id }));
const questLinks = useEntryQuestLinks(() => entry.id);
const knowledge = computed<KnowledgeMark>(() => {
  if (entry.knowledge === null) throw new Error("a truth without a knowledge mark");
  return entry.knowledge;
});

const { mutate: update } = useUpdateCanonEntry();
const { knowers, isLoading, nameKnower, forgetKnower } = useKnownTo(computed(() => (entry.knowledge === "some" ? entry.id : null)));

const { text, revision } = useCommittedText(() => entry.title, (next) => update({ id: entry.id, patch: { title: next } }));

const pickerOpen = ref(false);
watch(() => entry.id, () => { pickerOpen.value = false; });

function setKnowledge(next: KnowledgeMark) {
  if (next === entry.knowledge) return;
  update({ id: entry.id, patch: { knowledge: next } });
  // Choosing "some" is a promise to say who: open the picker straight away.
  if (next === "some" && knowers.value.length === 0) pickerOpen.value = true;
}

function onPick(picked: WorldRef & { name: string }) {
  void nameKnower(entry.id, { kind: picked.kind, id: picked.id, name: picked.name });
}
</script>
