<template>
  <CanonEntryPane kind="Backstory" close-label="Close this backstory" data-testid="backstory-detail" @close="emit('close')">
    <template #title>
      <h3 class="m-0 text-heading-sm font-bold text-foreground" data-testid="backstory-name">{{ member.name }}</h3>
      <span v-if="member.player_name" class="text-label text-muted-foreground">played by {{ member.player_name }}</span>
    </template>

    <template v-if="entry !== null" #who>
      <AudienceRevealControl :visible-to="entry.player_visible_to" :name="member.name" @change="setAudience" />
      <EntryArcPicker :entry="entry" />
    </template>

    <BackstoryBeforePlay :member="member" editable />

    <ListSkeleton v-if="entry === null" variant="rows" :count="2" />
    <template v-else>
      <CanonBlock title="Told in passages">
        <p class="m-0 text-caption text-muted-foreground">{{ member.name }}'s player always reads their own backstory. Sharing it lets the characters you choose read the entry. Each passage reaches only whom it was told to, and a character told any passage reads the entry too, so a player's "Share with the party" reaches the others without your sharing it.</p>
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
        <p v-else class="m-0 text-caption text-muted-foreground" data-testid="no-passages">Nothing beyond what {{ member.name }} wrote before play. Add what they have not been told.</p>
        <AppButton variant="ghost" size="sm" :icon="IconAdd" icon-size="xs" label="Add a passage of yours" class="self-start" :loading="adding" @click="addPassage" />
      </CanonBlock>

      <CanonBlock title="Threads left open">
        <BackstoryThreads :entry="entry" />
      </CanonBlock>

      <EntryQuests :entry="entry" :links="questLinks" label="The quests that pay it off" empty="No quest pays this off yet." />

      <EntryStoryLinks :entry="entry" />

      <BackstoryPeople :member="member" />
    </template>

    <template #connections>
      <div data-testid="backstory-ties">
        <ConnectionsSection :subject="{ kind: 'party_member', id: member.id }" :subject-name="member.name" title="Connections" />
      </div>
    </template>
  </CanonEntryPane>
</template>

<script setup lang="ts">
/**
 * One character's backstory, in the Backstories chapter's entry pane: their own Backstory field as "Before play", then every
 * passage in order (the player's own marked as theirs, the DM's untold until told to that character), and the character's
 * own Connections block (#1279 item 12: the character is the one subject, so a hometown tied here is tied to the character
 * and shows on their page too; people, places and things alike). The DM edits every passage. The entry is made the first time a character is opened.
 */
import AppButton from "@/components/common/controls/AppButton.vue";
import ListSkeleton from "@/components/common/feedback/ListSkeleton.vue";
import AudienceRevealControl from "@/components/common/reveal/AudienceRevealControl.vue";
import ConnectionsSection from "@/components/connections/ConnectionsSection.vue";
import CanonBlock from "./kit/CanonBlock.vue";
import CanonEntryPane from "./kit/CanonEntryPane.vue";
import BackstoryBeforePlay from "./BackstoryBeforePlay.vue";
import BackstoryPeople from "./BackstoryPeople.vue";
import BackstoryThreads from "./BackstoryThreads.vue";
import EntryArcPicker from "./EntryArcPicker.vue";
import EntryQuests from "./EntryQuests.vue";
import EntryStoryLinks from "./EntryStoryLinks.vue";
import LorePassageRow from "./LorePassageRow.vue";
import { isPlayersPassage, passageByline } from "@/lib/canon/canonBackstory";
import { useBackstoryEntry } from "@/composables/canon/useBackstory";
import { useUpdateCanonEntry } from "@/composables/canon/useCanonEntries";
import { useEntryQuestLinks } from "@/composables/canon/useEntryQuestLinks";
import { usePassageList } from "@/composables/canon/usePassageList";
import { useCampaignSessions } from "@/composables/sessions/useCampaignSessions";
import { IconAdd } from "@/lib/icons";
import type { PartyMember } from "@/types/party.types";

const { member } = defineProps<{ member: PartyMember }>();
const emit = defineEmits<{ close: [] }>();

const { entry } = useBackstoryEntry(() => member.id);
const { mutate: update } = useUpdateCanonEntry();
const { passages, adding, addPassage, move, removePassage } = usePassageList(() => entry.value?.id ?? null);
const questLinks = useEntryQuestLinks(() => entry.value?.id ?? null);
const { data: sessions } = useCampaignSessions();

function setAudience(next: string[]) {
  if (entry.value !== null) update({ id: entry.value.id, patch: { player_visible_to: next } });
}

</script>
