<template>
  <div class="flex flex-col gap-2" data-testid="backstory-people">
    <span class="text-eyebrow text-muted-foreground">People from this past</span>
    <ul v-if="people.length > 0" class="flex flex-col gap-1" data-testid="backstory-people-list">
      <li v-for="p in people" :key="p.id" class="flex min-w-0 items-baseline gap-2" data-testid="backstory-person">
        <RouterLink :to="{ name: 'npc-detail', params: { id: p.id } }" class="min-w-0 text-body text-foreground hover:underline">{{ p.name }}</RouterLink>
        <span v-if="p.word !== null" class="shrink-0 text-label text-muted-foreground">{{ p.word }}</span>
      </li>
    </ul>
    <p v-else class="m-0 text-caption text-muted-foreground" data-testid="no-people">Nobody yet. Someone this past brings into the world can be made here.</p>
    <AppButton variant="link" size="inline-caption" label="Edit on the character" class="self-start" :to="{ name: 'party-member', params: { id: member.id } }" data-testid="edit-on-character" />

    <p v-if="made !== null" class="m-0 flex flex-wrap items-baseline gap-2 text-caption text-muted-foreground" data-testid="new-npc-made">
      {{ made.name }} is in this past, hidden from the players until you share them.
      <AppButton variant="link" size="inline-caption" label="Open sheet" :to="{ name: 'npc-detail', params: { id: made.id } }" data-testid="open-sheet" />
    </p>

    <AppButton v-if="!settingUp" variant="outline" size="sm" :icon="IconAdd" icon-size="xs" label="New NPC from this backstory" class="self-start" data-testid="new-npc" @click="settingUp = true" />
    <form v-else class="flex flex-col gap-2" data-testid="new-npc-setup" @submit.prevent="create">
      <AppInput v-model="name" tone="filled" size="body" placeholder="Their name" aria-label="Their name" data-testid="new-npc-name" />
      <span class="field-label">How are they connected to {{ member.name }}? (optional)</span>
      <TypeChoiceChips :choices="personChoices" :current="relationship" label="Relationship" @pick="pick" />
      <div class="flex gap-2">
        <AppButton variant="subtle" size="sm" label="Cancel" :disabled="creating" @click="cancel" />
        <AppButton type="submit" variant="primary" size="sm" label="Create NPC" :loading="creating" :disabled="name.trim() === '' || creating" data-testid="create-npc" />
      </div>
      <p class="m-0 text-caption text-muted-foreground">The NPC will also be linked to this backstory and hidden until you share them.</p>
    </form>
  </div>
</template>

<script setup lang="ts">
/**
 * The people a character's past brings in (#1258 item 4, frame 14): one read-only list of the NPCs tied to the
 * character or told of by this backstory, each a link to their sheet, with the character's own page the place to edit
 * the ties (they are the same list there). Making one takes a name and, if wanted, how they relate to the character; the
 * DM stays here and is offered "Open sheet" (#1258 item 25).
 */
import { computed, ref } from "vue";
import AppButton from "@/components/common/controls/AppButton.vue";
import AppInput from "@/components/common/controls/AppInput.vue";
import TypeChoiceChips from "@/components/connections/TypeChoiceChips.vue";
import { useConnections } from "@/composables/connections/useConnections";
import { useNewBackstoryNpc } from "@/composables/canon/useNewBackstoryNpc";
import { connectionWord, typeChoices, type TypeChoice } from "@/lib/worldLinks/connections";
import { IconAdd } from "@/lib/icons";
import type { CanonEntry } from "@/types/canon.types";
import type { PartyMember } from "@/types/party.types";

const { member, entry } = defineProps<{ member: PartyMember; entry: CanonEntry }>();

const { data: characterTies } = useConnections("party_member", () => member.id);
const { data: entryTies } = useConnections("canon", () => entry.id);

// The character's own NPC ties (with the word the tie reads as), then the NPCs the entry is `about` that the character
// has no tie to, so a person made with no relationship is still listed.
const people = computed(() => {
  const found = new Map<string, { id: string; name: string; word: string | null }>();
  for (const c of characterTies.value ?? []) {
    if (c.other_kind === "npc" && !found.has(c.other_id)) found.set(c.other_id, { id: c.other_id, name: c.other_name, word: connectionWord(c, "party_member") });
  }
  for (const c of entryTies.value ?? []) {
    if (c.type === "about" && c.other_kind === "npc" && !found.has(c.other_id)) found.set(c.other_id, { id: c.other_id, name: c.other_name, word: null });
  }
  return [...found.values()];
});

const { start, creating, discardPending } = useNewBackstoryNpc();
const settingUp = ref(false);
const name = ref("");
const personChoices = typeChoices("npc", "party_member");
const relationship = ref<TypeChoice | null>(null);
const made = ref<{ id: string; name: string } | null>(null);

function pick(choice: TypeChoice) {
  relationship.value = relationship.value?.key === choice.key && relationship.value.subjectIsFrom === choice.subjectIsFrom ? null : choice;
}
async function create() {
  if (name.value.trim() === "" || creating.value) return;
  const person = await start(entry.id, member.name, member.id, { name: name.value, relationship: relationship.value });
  if (person === null) return;
  made.value = person;
  reset();
}
function cancel() {
  if (creating.value) return;
  discardPending();
  reset();
}
function reset() {
  settingUp.value = false;
  name.value = "";
  relationship.value = null;
}
</script>
