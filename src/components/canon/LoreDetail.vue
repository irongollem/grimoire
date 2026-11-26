<template>
  <CanonEntryPane :kind="kindWord" delete-label="Delete this lore" close-label="Close this lore" data-testid="lore-detail" @close="emit('close')" @delete="emit('delete')">
    <template #title>
      <AppInput :key="revision" v-model.lazy="text" wrap size="body" tone="filled" aria-label="The title" placeholder="What the world remembers…" />
    </template>

    <template #who>
      <AudienceRevealControl :visible-to="entry.player_visible_to" :name="entry.title" @change="(next) => update({ id: entry.id, patch: { player_visible_to: next } })" />
      <EntryArcPicker v-if="shown('arc')" :entry="entry" />
    </template>

    <div class="flex flex-wrap items-end gap-3">
      <label class="flex flex-col gap-1">
        <span class="text-eyebrow text-muted-foreground">What kind</span>
        <AppSelect :model-value="entry.lore_kind" tone="filled" weight="normal" size="body" aria-label="What kind of lore" @change="onKind">
          <option :value="null">Any kind</option>
          <option v-for="k in LORE_KIND_OPTIONS" :key="k.value" :value="k.value">{{ k.label }}</option>
        </AppSelect>
      </label>
      <div class="flex min-w-0 flex-1 flex-col gap-1">
        <span class="text-eyebrow text-muted-foreground">In the world<template v-if="dateText">: {{ dateText }}</template></span>
        <WorldDateField :date="entryDate(entry)" @change="onDate" />
      </div>
    </div>

    <CanonBlock title="Passages" :suggest="suggestPassage">
      <CanonReview mode="lore" :lore="splitTarget" />
      <p class="m-0 text-caption text-muted-foreground">Sharing the entry tells its first passage. Every other passage is told on its own.</p>
      <!-- One rule, in the database: the first passage is told with the entry and is never offered at a place or to Tell. -->
      <p v-if="passages.length > 0" class="m-0 flex flex-col gap-0.5" data-testid="lore-opening">
        <span class="text-label font-bold text-foreground">The opening, read when the entry is shared</span>
        <span class="text-caption text-muted-foreground">The first passage below is told with the entry, so it never waits at a place. The rest are told one at a time.</span>
      </p>
      <!-- Lore made before passages (and a note sorted in before they were written to one) kept its text on the entry itself, which only the player's World tab showed. -->
      <div v-if="legacyText !== ''" class="flex flex-col gap-1 rounded-lg border border-dashed border-border p-3" data-testid="lore-legacy-body">
        <span class="text-eyebrow text-muted-foreground">Text from before passages</span>
        <p class="m-0 whitespace-pre-line text-caption text-muted-foreground">{{ legacyText }}</p>
        <AppButton class="self-start" variant="outline" size="sm" label="Make this the first passage" :loading="adding" @click="makeLegacyFirst" />
      </div>
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
      <p v-else class="m-0 text-caption text-muted-foreground" data-testid="no-passages">No passages yet. The first one is told with the entry.</p>
      <AppButton variant="ghost" size="sm" :icon="IconAdd" icon-size="xs" label="Add a passage" class="self-start" :loading="adding" @click="addPassage" />
    </CanonBlock>

    <!-- After the passages, and a modest width: an empty drop zone at the top filled the screen and hid the words. -->
    <CanonBlock title="A picture">
      <div class="w-full max-w-sm">
        <EntityImageBlock
          :model-value="entry.image_url"
          bucket="chronicle"
          ai-kind="lore"
          :ai-context="pictureContext"
          :ai-target-id="entry.id"
          @update:model-value="(url) => update({ id: entry.id, patch: { image_url: url || null } })"
        />
      </div>
    </CanonBlock>

    <EntryStoryLinks v-if="shown('story')" :entry="entry" />

    <EntryQuests v-if="shown('quests')" :entry="entry" :links="questLinks" label="The quests that tell it" empty="No quest tells this yet." />

    <CanonAddFold :choices="choices(FOLDED)" @choose="choose" />

    <template v-if="shown('connections')" #connections>
      <ConnectionsSection :subject="subject" :subject-name="entry.title" />
    </template>
  </CanonEntryPane>
</template>

<script setup lang="ts">
/**
 * The open lore entry, in the chapter's entry pane: title, picture (upload, or Paint with AI), kind, its date in the
 * world, who it is shared with, then its passages in the order they are told. Everything saves as it is changed.
 */
import { computed } from "vue";
import AppButton from "@/components/common/controls/AppButton.vue";
import AppInput from "@/components/common/controls/AppInput.vue";
import AppSelect from "@/components/common/controls/AppSelect.vue";
import EntityImageBlock from "@/components/common/entity/EntityImageBlock.vue";
import AudienceRevealControl from "@/components/common/reveal/AudienceRevealControl.vue";
import ConnectionsSection from "@/components/connections/ConnectionsSection.vue";
import CanonReview from "./CanonReview.vue";
import CanonBlock from "./kit/CanonBlock.vue";
import CanonAddFold from "./kit/CanonAddFold.vue";
import CanonEntryPane from "./kit/CanonEntryPane.vue";
import EntryArcPicker from "./EntryArcPicker.vue";
import EntryQuests from "./EntryQuests.vue";
import EntryStoryLinks from "./EntryStoryLinks.vue";
import LorePassageRow from "./LorePassageRow.vue";
import WorldDateField from "./WorldDateField.vue";
import { LORE_KIND_LABEL, LORE_KIND_OPTIONS, entryDate, normaliseDate, worldDateLabel, type WorldDate } from "@/lib/canon/canonLore";
import { useUpdateCanonEntry } from "@/composables/canon/useCanonEntries";
import { useEntryFold, type FoldKey } from "@/composables/canon/useEntryFold";
import { useEntryQuestLinks } from "@/composables/canon/useEntryQuestLinks";
import { usePassageList } from "@/composables/canon/usePassageList";
import { useCommittedText } from "@/composables/canon/useCommittedText";
import { tiptapToPlainText } from "@/lib/tiptap/tiptapText";
import { IconAdd } from "@/lib/icons";
import { useCalendarStore } from "@/stores/calendar";
import { LORE_KINDS, type CanonEntry, type LoreKind } from "@/types/canon.types";
import type { WorldRef } from "@/types/connections.types";

const { entry } = defineProps<{ entry: CanonEntry }>();
const emit = defineEmits<{ delete: []; close: [] }>();

const kindWord = computed(() => (entry.lore_kind ? `Lore · ${LORE_KIND_LABEL[entry.lore_kind]}` : "Lore"));
// What the Familiar splits into passages: this entry's own words, kept under its id.
const splitTarget = computed(() => ({ title: entry.title, kind: entry.lore_kind, entryId: entry.id, text: tiptapToPlainText(entry.body) }));
const suggestPassage = computed(() => `Suggest a passage for the lore "${entry.title}".`);
const subject = computed<WorldRef>(() => ({ kind: "canon", id: entry.id }));
const questLinks = useEntryQuestLinks(() => entry.id);
const FOLDED: readonly FoldKey[] = ["arc", "quests", "story", "connections"];
const { shown, choices, choose } = useEntryFold(() => entry);
const { mutate: update } = useUpdateCanonEntry();
const { text, revision } = useCommittedText(() => entry.title, (next) => update({ id: entry.id, patch: { title: next } }));

const { passages, adding, addPassage, prependPassage, move, removePassage } = usePassageList(() => entry.id);
const legacyText = computed(() => tiptapToPlainText(entry.body).trim());
// The body is cleared only once the passage exists, so a refused write loses no text.
async function makeLegacyFirst() {
  if (entry.body === null || !(await prependPassage(entry.body))) return;
  update({ id: entry.id, patch: { body: null } });
}
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
