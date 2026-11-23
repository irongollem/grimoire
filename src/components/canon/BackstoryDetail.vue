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
      <div class="flex flex-col gap-1">
        <AudienceRevealControl :visible-to="entry.player_visible_to" :name="member.name" @change="setAudience" />
        <p class="text-caption text-muted-foreground">{{ member.name }}'s player always reads their own backstory. Sharing it lets the characters you choose read the passages told to them.</p>
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

      <div class="flex flex-col gap-2" data-testid="backstory-people">
        <span class="text-eyebrow text-muted-foreground">The people from this past</span>
        <p class="m-0 text-caption text-muted-foreground">The same list the character's page shows. Each tie has its own reveal, so the player can know one person and not another's name.</p>
        <ConnectionsSection :subject="{ kind: 'party_member', id: member.id }" :subject-name="member.name" :origin="origin" />
        <AppButton v-if="!settingUpNpc" variant="outline" size="sm" :icon="IconAdd" icon-size="xs" label="New NPC from this backstory" class="self-start" data-testid="new-npc" @click="settingUpNpc = true" />
        <div v-else class="flex flex-col gap-2" data-testid="new-npc-setup">
          <span class="field-label">How are they connected to {{ member.name }}?</span>
          <TypeChoiceChips :choices="personChoices" :current="personTie" label="Relationship" @pick="personTie = $event" />
          <div class="flex gap-2">
            <AppButton variant="subtle" size="sm" label="Cancel" :disabled="creating" @click="cancelNpcSetup" />
            <AppButton variant="primary" size="sm" label="Create NPC" :loading="creating" :disabled="!personTie || creating" data-testid="create-npc" @click="newNpc" />
          </div>
          <p class="m-0 text-caption text-muted-foreground">The NPC will also be linked to this backstory and hidden until you share them.</p>
        </div>
      </div>

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
import { computed, ref } from "vue";
import AppButton from "@/components/common/controls/AppButton.vue";
import ListSkeleton from "@/components/common/feedback/ListSkeleton.vue";
import AudienceRevealControl from "@/components/common/reveal/AudienceRevealControl.vue";
import ConnectionsSection from "@/components/connections/ConnectionsSection.vue";
import TypeChoiceChips from "@/components/connections/TypeChoiceChips.vue";
import BackstoryBeforePlay from "./BackstoryBeforePlay.vue";
import BackstoryThreads from "./BackstoryThreads.vue";
import EntryQuests from "./EntryQuests.vue";
import LorePassageRow from "./LorePassageRow.vue";
import { isPlayersPassage, passageByline } from "@/lib/canon/canonBackstory";
import { useBackstoryEntry } from "@/composables/canon/useBackstory";
import { useUpdateCanonEntry } from "@/composables/canon/useCanonEntries";
import { useEntryQuestLinks } from "@/composables/canon/useEntryQuestLinks";
import { usePassageList } from "@/composables/canon/usePassageList";
import { useConnections } from "@/composables/connections/useConnections";
import { useBackstoryOrigin } from "@/composables/canon/useBackstoryOrigin";
import { useNewBackstoryNpc } from "@/composables/canon/useNewBackstoryNpc";
import { useCampaignSessions } from "@/composables/sessions/useCampaignSessions";
import { typeChoices, type TypeChoice } from "@/lib/worldLinks/connections";
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

// The people are the character's own ties, the list their page shows. The entry's own ties are read to know which of
// them came from this backstory (the NPCs it is `about`), and to leave those out of the second block, where they
// would be shown twice. An `about` tie to someone the character has no tie to stays there, so nothing is hidden.
const { data: characterTies } = useConnections("party_member", () => member.id);
const origin = useBackstoryOrigin(() => member.id, entry);
const isPerson = (c: Connection) => c.other_kind === "npc" || c.other_kind === "party_member";
const peopleOfCharacter = computed(() => new Set((characterTies.value ?? []).filter(isPerson).map((c) => `${c.other_kind}:${c.other_id}`)));
function isShownAbove(c: Connection): boolean {
  return c.type === "about" && isPerson(c) && peopleOfCharacter.value.has(`${c.other_kind}:${c.other_id}`);
}

function setAudience(next: string[]) {
  if (entry.value !== null) update({ id: entry.value.id, patch: { player_visible_to: next } });
}

const { start, creating, discardPending } = useNewBackstoryNpc();
const settingUpNpc = ref(false);
const personChoices = typeChoices("npc", "party_member");
const personTie = ref<TypeChoice | null>(null);
function newNpc() {
  if (entry.value !== null && personTie.value) void start(entry.value.id, member.name, member.id, personTie.value);
}
function cancelNpcSetup() {
  if (creating.value) return;
  discardPending();
  settingUpNpc.value = false;
  personTie.value = null;
}
</script>
