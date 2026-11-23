<template>
  <section class="flex min-w-0 flex-col gap-4 border border-border bg-card p-4" aria-label="A lore entry" data-testid="lore-detail">
    <div class="flex flex-col gap-1">
      <span class="flex items-center justify-between gap-2 text-eyebrow text-muted-foreground">
        Lore
        <span class="text-label font-bold text-foreground" data-testid="lore-told">Told {{ tally.told }} of {{ tally.total }}</span>
      </span>
      <AppInput :key="revision" v-model.lazy="text" size="body" tone="filled" aria-label="The title" placeholder="What the world remembers…" />
      <EntryArcPicker :entry="entry" />
    </div>

    <EntityImageBlock
      :model-value="entry.image_url"
      bucket="chronicle"
      ai-kind="lore"
      :ai-context="pictureContext"
      :ai-target-id="entry.id"
      @update:model-value="(url) => update({ id: entry.id, patch: { image_url: url || null } })"
    />

    <div class="flex flex-col gap-2">
      <span class="text-eyebrow text-muted-foreground">What kind</span>
      <AppSelect :model-value="entry.lore_kind" tone="filled" weight="normal" size="body" block aria-label="What kind of lore" @change="onKind">
        <option :value="null">Any kind</option>
        <option v-for="k in LORE_KIND_OPTIONS" :key="k.value" :value="k.value">{{ k.label }}</option>
      </AppSelect>
      <span class="text-eyebrow text-muted-foreground">In the world<template v-if="dateText">: {{ dateText }}</template></span>
      <WorldDateField :date="entryDate(entry)" @change="onDate" />
    </div>

    <div class="flex flex-col gap-1">
      <AudienceRevealControl :visible-to="entry.player_visible_to" :name="entry.title" @change="(next) => update({ id: entry.id, patch: { player_visible_to: next } })" />
      <p class="text-caption text-muted-foreground">Sharing the entry tells its first passage. Every other passage is told on its own.</p>
    </div>

    <div class="flex flex-col gap-1">
      <span class="text-eyebrow text-muted-foreground">Told in passages</span>
      <ul v-if="passages.length > 0" class="flex flex-col" data-testid="lore-passages">
        <LorePassageRow
          v-for="(p, i) in passages"
          :key="p.id"
          :passage="p"
          :index="i"
          :first="i === 0"
          :can-move-up="i > 0"
          :can-move-down="i < passages.length - 1"
          @move="(by) => move(i, by)"
          @remove="removePassage(p)"
        />
      </ul>
      <p v-else class="text-caption text-muted-foreground" data-testid="no-passages">No passages yet. The first one is told with the entry.</p>
      <AppButton variant="ghost" size="sm" :icon="IconAdd" icon-size="xs" label="Add a passage" class="self-start" :loading="adding" @click="addPassage" />
      <CanonSuggestions v-if="plainText !== ''" mode="lore" :entries="NO_ENTRIES" :lore="{ title: entry.title, kind: entry.lore_kind, entryId: entry.id, text: plainText }" />
    </div>

    <EntryQuests :entry="entry" :links="questLinks" label="The quests that tell it" empty="No quest tells this yet." />

    <ConnectionsSection :subject="subject" :subject-name="entry.title" />

    <AppButton variant="destructive" size="sm" :icon="IconDelete" icon-size="xs" label="Delete this lore" class="self-start" @click="emit('delete')" />
  </section>
</template>

<script setup lang="ts">
/**
 * The selected lore entry (frames 04 and 04b): title, picture (upload, or Paint with AI), kind, its date in the world,
 * who it is shared with, then its passages in the order they are told. It opens beside the lore ledger in the page body (two thirds wide, `CanonSplit`),
 * so a passage's margin (told, where it comes out) sits beside its text.
 */
import { computed } from "vue";
import AppButton from "@/components/common/controls/AppButton.vue";
import AppInput from "@/components/common/controls/AppInput.vue";
import AppSelect from "@/components/common/controls/AppSelect.vue";
import EntityImageBlock from "@/components/common/entity/EntityImageBlock.vue";
import AudienceRevealControl from "@/components/common/reveal/AudienceRevealControl.vue";
import ConnectionsSection from "@/components/connections/ConnectionsSection.vue";
import CanonSuggestions from "./CanonSuggestions.vue";
import EntryArcPicker from "./EntryArcPicker.vue";
import EntryQuests from "./EntryQuests.vue";
import LorePassageRow from "./LorePassageRow.vue";
import WorldDateField from "./WorldDateField.vue";
import { LORE_KIND_OPTIONS, entryDate, normaliseDate, worldDateLabel, type WorldDate } from "@/lib/canon/canonLore";
import { useUpdateCanonEntry } from "@/composables/canon/useCanonEntries";
import { useEntryQuestLinks } from "@/composables/canon/useEntryQuestLinks";
import { toldTally } from "@/composables/canon/useCanonPassages";
import { usePassageList } from "@/composables/canon/usePassageList";
import { useCommittedText } from "@/composables/canon/useCommittedText";
import { tiptapToPlainText } from "@/lib/tiptap/tiptapText";
import { IconAdd, IconDelete } from "@/lib/icons";
import { useCalendarStore } from "@/stores/calendar";
import { LORE_KINDS, type CanonEntry, type LoreKind } from "@/types/canon.types";
import type { WorldRef } from "@/types/connections.types";

const { entry } = defineProps<{ entry: CanonEntry }>();
const emit = defineEmits<{ delete: [] }>();
const NO_ENTRIES: readonly CanonEntry[] = [];

const subject = computed<WorldRef>(() => ({ kind: "canon", id: entry.id }));
const questLinks = useEntryQuestLinks(() => entry.id);
const { mutate: update } = useUpdateCanonEntry();
const { text, revision } = useCommittedText(() => entry.title, (next) => update({ id: entry.id, patch: { title: next } }));

const { passages, adding, addPassage, move, removePassage } = usePassageList(() => entry.id);
const tally = computed(() => toldTally(passages.value));
const plainText = computed(() => passages.value.map((p) => [p.title, tiptapToPlainText(p.body)].filter((t) => t !== "").join("\n")).filter((t) => t !== "").join("\n\n"));
const pictureContext = computed(() => [entry.title, entry.lore_kind, passages.value[0] ? tiptapToPlainText(passages.value[0].body) : ""].filter((t) => t).join(". "));

const calendar = useCalendarStore();
const dateText = computed(() => worldDateLabel(entryDate(entry), (y, m, d, f) => calendar.adapter.formatDate(y, m, d, f)));

function onKind(event: Event) {
  const raw = (event.target as HTMLSelectElement).value;
  const kind = (LORE_KINDS as readonly string[]).includes(raw) ? (raw as LoreKind) : null;
  update({ id: entry.id, patch: { lore_kind: kind } });
}
function onDate(date: WorldDate) {
  const d = normaliseDate(date);
  update({ id: entry.id, patch: { world_year: d.year, world_month: d.month, world_day: d.day } });
}
</script>
