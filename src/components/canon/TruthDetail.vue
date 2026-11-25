<template>
  <CanonEntryPane kind="Truth" delete-label="Delete this truth" close-label="Close this truth" data-testid="truth-detail" @close="emit('close')" @delete="emit('delete')">
    <template #title>
      <AppInput
        :key="revision"
        v-model.lazy="text"
        wrap
        size="body"
        tone="filled"
        aria-label="The truth"
        placeholder="What is true in this world…"
      />
    </template>

    <template #who>
      <EntryArcPicker v-if="shown('arc')" :entry="entry" />
      <!-- The story record cannot be opened at one fact, so the line leads to the page. -->
      <p v-if="entry.from_fact_id" class="m-0 text-caption text-muted-foreground" data-testid="truth-from-table">
        <AppButton to="/table/story" variant="link" size="inline" label="First said at the table." />
      </p>
    </template>

    <CanonEntryNotes
      v-if="shown('notes')"
      :key="entry.id"
      :entry="entry"
      label="More about it"
      help="Players who read this truth read this too. Put what only you should see in a DM-only block."
      placeholder="Why it matters, what lies behind it…"
    />

    <CanonBlock title="Who knows it">
      <div class="flex items-center gap-1">
        <SegmentedControl
          :model-value="knowledge"
          :options="MARK_OPTIONS"
          wrap
          class="self-start"
          aria-label="Who knows it"
          @update:model-value="setKnowledge"
        />
        <AppButton variant="ghost" size="icon-sm" :icon="IconInfo" :tooltip="KNOWLEDGE_HELP" aria-label="What these mean" data-testid="knowledge-help" />
      </div>

      <!-- Known to no one: the way to give it clues is a secret that points at it. -->
      <div v-if="knowledge === 'secret'" class="flex flex-wrap items-center gap-2" data-testid="give-clues">
        <p v-if="clueSecret !== undefined" class="m-0 text-body text-foreground" data-testid="clues-in">
          Its clues are in <RouterLink :to="{ path: '/canon/secrets', query: { entry: clueSecret.id } }" class="underline">{{ clueSecret.title }}</RouterLink>
        </p>
        <AppButton v-else variant="outline" size="sm" label="Give it clues" :loading="makingClues" data-testid="give-clues-button" @click="onGiveClues" />
      </div>

      <!-- Told to the party: the time and the session it was learned in, as a revealed secret says it. -->
      <p v-if="entry.revealed_at !== null" class="m-0 text-body text-foreground" data-testid="told-line">{{ toldLine }}</p>
      <div v-if="!toldToAll" class="flex flex-wrap items-center gap-2" data-testid="tell-controls">
        <AppButton variant="primary" size="sm" label="Tell the party" data-testid="tell-party" @click="tellParty(entry)" />
        <AppButton v-if="!choosingWho && entry.knowledge !== 'all'" variant="outline" size="sm" :label="entry.revealed_at === null ? 'Tell…' : 'Tell more…'" data-testid="tell-some" @click="choosingWho = true" />
      </div>
      <PassageTellSome
        v-if="choosingWho && !toldToAll"
        :key="entry.revealed_at === null ? 'first' : 'more'"
        :members="party ?? []"
        :told="toldMemberIds"
        :tell-label="entry.revealed_at === null ? 'Tell' : 'Tell them'"
        @tell="onTellSome"
        @cancel="choosingWho = false"
      />

      <div v-if="knowledge === 'some'" class="flex flex-col gap-2" data-testid="known-to">
        <span class="text-eyebrow text-muted-foreground">Known to</span>
        <p v-if="!isLoading && knowers.length === 0" data-testid="name-who-knows" class="text-body italic text-muted-foreground">
          Nobody is named yet. Name the people or factions who know it.
        </p>
        <ul v-if="knowers.length > 0" class="flex flex-col gap-1.5">
          <li v-for="k in knowers" :key="k.row_id" class="flex items-center gap-2.5 rounded-lg border border-border py-1.5 pr-2 pl-1.5">
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
    </CanonBlock>

    <EntryQuests v-if="shown('quests')" :entry="entry" :links="questLinks" label="The quests that turn on it" empty="No quest turns on this yet." />

    <EntryStoryLinks v-if="shown('story')" :entry="entry" />

    <CanonAddFold :choices="choices(FOLDED)" @choose="choose" />

    <template v-if="shown('connections')" #connections>
      <ConnectionsSection :subject="subject" :subject-name="entry.title" :hide="isShownAbove" />
    </template>
  </CanonEntryPane>
</template>

<script setup lang="ts">
/**
 * The open truth, in the chapter's entry pane: its words, who it is known to, the people and factions that know it, and
 * its other connections. Everything saves as it is changed; there is nothing to confirm and nowhere to navigate.
 */
import { computed, ref, watch } from "vue";
import { useRouter } from "vue-router";
import AppButton from "@/components/common/controls/AppButton.vue";
import AppInput from "@/components/common/controls/AppInput.vue";
import SegmentedControl from "@/components/common/controls/SegmentedControl.vue";
import WorldEntityPicker from "@/components/common/entity/WorldEntityPicker.vue";
import ConnectionsSection from "@/components/connections/ConnectionsSection.vue";
import CanonBlock from "./kit/CanonBlock.vue";
import CanonAddFold from "./kit/CanonAddFold.vue";
import CanonEntryPane from "./kit/CanonEntryPane.vue";
import PassageTellSome from "./PassageTellSome.vue";
import EntryArcPicker from "./EntryArcPicker.vue";
import CanonEntryNotes from "./CanonEntryNotes.vue";
import EntryQuests from "./EntryQuests.vue";
import EntryStoryLinks from "./EntryStoryLinks.vue";
import CanonRef from "./CanonRef.vue";
import { KNOWLEDGE_HELP, MARK_OPTIONS } from "@/lib/canon/canonParts";
import { useEntryQuestLinks } from "@/composables/canon/useEntryQuestLinks";
import { useCampaignSessions } from "@/composables/sessions/useCampaignSessions";
import { useParty } from "@/composables/party/useParty";
import { useEntryFold, type FoldKey } from "@/composables/canon/useEntryFold";
import { useGiveClues } from "@/composables/canon/useGiveClues";
import { useTellTruth } from "@/composables/canon/useTellTruth";
import { useCommittedText } from "@/composables/canon/useCommittedText";
import { KNOWER_KINDS, useKnownTo } from "@/composables/canon/useKnownTo";
import { useUpdateCanonEntry } from "@/composables/canon/useCanonEntries";
import { IconAdd, IconClose, IconInfo } from "@/lib/icons";
import { audienceLabel } from "@/lib/sessions/learned";
import type { CanonEntry, KnowledgeMark } from "@/types/canon.types";
import type { Connection, WorldRef } from "@/types/connections.types";

const { entry } = defineProps<{ entry: CanonEntry }>();
const emit = defineEmits<{ delete: []; close: [] }>();

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

// Who knows it and the story links (because of, led to, carries) are the blocks above, so the Connections block does
// not list the same ties again (#1258 items 6 and 18).
const isShownAbove = (c: Connection): boolean => c.source === "link" && ((c.type === "known_to" && c.outward) || c.type === "led_to" || c.type === "carries");

const FOLDED: readonly FoldKey[] = ["arc", "notes", "quests", "story", "connections"];
const { shown, choices, choose } = useEntryFold(() => entry, { hideConnection: isShownAbove });

const router = useRouter();
const { secretOfTruth: clueSecret, giveClues, making: makingClues } = useGiveClues(() => entry);
async function onGiveClues() {
  const secret = await giveClues();
  if (secret !== null) void router.push({ path: "/canon/secrets", query: { entry: secret.id } });
}

const { data: party } = useParty();
const { data: sessions } = useCampaignSessions();
const { tellParty, tellSome } = useTellTruth(() => entry.id);
const choosingWho = ref(false);
watch(() => entry.id, () => { choosingWho.value = false; });

// Characters named as knowers: who a "Tell…" reached, and who is ticked when telling more.
const toldMemberIds = computed(() => (entry.revealed_at === null ? [] : knowers.value.filter((k) => k.other_kind === "party_member").map((k) => k.other_id)));
const toldToAll = computed(() => entry.knowledge === "all" && entry.revealed_at !== null);
const toldLine = computed(() => {
  const named = audienceLabel(toldMemberIds.value, party.value ?? []);
  const who = entry.knowledge === "all" || named === "The whole party" ? "the party" : named;
  const number = (sessions.value ?? []).find((s) => s.id === entry.revealed_session_id)?.number ?? null;
  return `Told${who === "" ? "" : ` to ${who}`}${number === null ? "" : `, session ${number}`}`;
});

async function onTellSome(ids: string[]) {
  const members = (party.value ?? []).filter((m) => ids.includes(m.id)).map((m) => ({ id: m.id, name: m.name }));
  choosingWho.value = false;
  await tellSome(entry, members);
}

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
