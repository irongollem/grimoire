<template>
  <section class="flex min-w-0 flex-col gap-4 border border-border bg-card p-4" aria-label="A backstory" data-testid="backstory-detail">
    <div class="flex flex-col gap-1">
      <span class="flex items-center justify-between gap-2 text-eyebrow text-muted-foreground">
        Backstory
        <span class="text-label font-bold text-foreground" data-testid="backstory-tally">{{ passages.length }} {{ passages.length === 1 ? "passage" : "passages" }}<template v-if="untold > 0">, {{ untold }} not yet told</template></span>
      </span>
      <h3 class="m-0 text-heading-sm font-bold text-foreground">{{ member.name }}</h3>
      <span v-if="member.player_name" class="text-label text-muted-foreground">played by {{ member.player_name }}</span>
    </div>

    <BackstoryBeforePlay :member="member" editable />

    <ListSkeleton v-if="entry === null" variant="rows" :count="2" />
    <template v-else>
      <EntryArcPicker :entry="entry" />

      <div class="flex flex-col gap-1">
        <AudienceRevealControl :visible-to="entry.player_visible_to" :name="member.name" @change="setAudience" />
        <p class="text-caption text-muted-foreground">{{ member.name }}'s player always reads their own backstory. Sharing it lets the characters you choose read the entry. Each passage reaches only whom it was told to, and a character told any passage reads the entry too, so a player's "Share with the party" reaches the others without your sharing it.</p>
      </div>

      <div class="flex flex-col gap-1">
        <span class="text-eyebrow text-muted-foreground">Told in passages</span>
        <ul v-if="passages.length > 0" class="flex flex-col" data-testid="backstory-passages">
          <LorePassageRow
            v-for="(p, i) in passages"
            :key="p.id"
            :passage="p"
            :index="i"
            :first="false"
            :can-move-up="i > 0"
            :can-move-down="i < passages.length - 1"
            :byline="passageByline(p, member, sessions ?? [])"
            :players-own="isPlayersPassage(p, member)"
            :tell-target="{ id: member.id, name: member.name }"
            @move="(by) => move(i, by)"
            @remove="removePassage(p)"
          />
        </ul>
        <p v-else class="text-caption text-muted-foreground" data-testid="no-passages">Nothing beyond what {{ member.name }} wrote before play. Add what they have not been told.</p>
        <AppButton variant="ghost" size="sm" :icon="IconAdd" icon-size="xs" label="Add a passage of yours" class="self-start" :loading="adding" @click="addPassage" />
      </div>

      <BackstoryThreads :entry="entry" />

      <EntryQuests :entry="entry" :links="questLinks" label="The quests that pay it off" empty="No quest pays this off yet." />

      <BackstoryPeople :member="member" :entry="entry" />

      <div data-testid="backstory-things">
        <ConnectionsSection
          :subject="{ kind: 'canon', id: entry.id }"
          :subject-name="member.name"
          title="Places and things from this past"
          :hide="isShownAbove"
        />
      </div>
    </template>
  </section>
</template>

<script setup lang="ts">
/**
 * One character's backstory on the Canon page (frame 14): their own Backstory field as "Before play", then every
 * passage in order (the player's own marked as theirs, the DM's untold until told to that character), and the people
 * this past brings into the world. The DM edits every passage. The entry is made the first time a character is opened.
 */
import { computed } from "vue";
import AppButton from "@/components/common/controls/AppButton.vue";
import ListSkeleton from "@/components/common/feedback/ListSkeleton.vue";
import AudienceRevealControl from "@/components/common/reveal/AudienceRevealControl.vue";
import ConnectionsSection from "@/components/connections/ConnectionsSection.vue";
import BackstoryBeforePlay from "./BackstoryBeforePlay.vue";
import BackstoryPeople from "./BackstoryPeople.vue";
import BackstoryThreads from "./BackstoryThreads.vue";
import EntryArcPicker from "./EntryArcPicker.vue";
import EntryQuests from "./EntryQuests.vue";
import LorePassageRow from "./LorePassageRow.vue";
import { isPlayersPassage, passageByline } from "@/lib/canon/canonBackstory";
import { useBackstoryEntry } from "@/composables/canon/useBackstory";
import { useCanonEntries, useUpdateCanonEntry } from "@/composables/canon/useCanonEntries";
import { useEntryQuestLinks } from "@/composables/canon/useEntryQuestLinks";
import { usePassageList } from "@/composables/canon/usePassageList";
import { useCampaignLinks } from "@/composables/connections/useConnections";
import { useCampaignSessions } from "@/composables/sessions/useCampaignSessions";
import { allThreads, isThreadTie } from "@/lib/canon/backstoryThreads";
import { IconAdd } from "@/lib/icons";
import type { Connection } from "@/types/connections.types";
import type { PartyMember } from "@/types/party.types";

const { member } = defineProps<{ member: PartyMember }>();

const { entry } = useBackstoryEntry(() => member.id);
const { mutate: update } = useUpdateCanonEntry();
const { passages, adding, addPassage, move, removePassage } = usePassageList(() => entry.value?.id ?? null);
const questLinks = useEntryQuestLinks(() => entry.value?.id ?? null);
const untold = computed(() => passages.value.filter((p) => p.told_at === null).length);
const { data: sessions } = useCampaignSessions();

// The entry's own block is for places and things. The people are listed above it (BackstoryPeople), so an `about` tie to
// a person is left out here, and so is a thread (BackstoryThreads lists those, open or paid off): each is shown once.
const { data: canonEntries } = useCanonEntries();
const { data: links } = useCampaignLinks();
const threadIds = computed(() => new Set(allThreads(entry.value?.id ?? "", canonEntries.value ?? [], links.value ?? []).map((t) => t.id)));
function isShownAbove(c: Connection): boolean {
  return (c.type === "about" && c.other_kind === "npc") || isThreadTie(c, threadIds.value);
}

function setAudience(next: string[]) {
  if (entry.value !== null) update({ id: entry.value.id, patch: { player_visible_to: next } });
}

</script>
