<template>
  <div class="flex flex-col gap-2" data-testid="backstory-people">
    <p v-if="made !== null" class="m-0 flex flex-wrap items-baseline gap-2 text-caption text-muted-foreground" data-testid="new-npc-made">
      {{ made.name }} is tied to {{ member.name }} below, hidden from the players until you share them.
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
      <p class="m-0 text-caption text-muted-foreground">They are tied to {{ member.name }} (a contact, unless you choose) and hidden from the players until you share them.</p>
    </form>
  </div>
</template>

<script setup lang="ts">
/**
 * Making a person this past brings in (#1258 items 4 and 25; #1279 item 12): a name and, if wanted, how they relate to
 * the character. The tie is the character's own, so the people appear in the character's Connections block under it, the
 * one list of them; nothing is listed twice here. The DM stays on the backstory and is offered "Open sheet".
 */
import { ref } from "vue";
import AppButton from "@/components/common/controls/AppButton.vue";
import AppInput from "@/components/common/controls/AppInput.vue";
import TypeChoiceChips from "@/components/connections/TypeChoiceChips.vue";
import { useNewBackstoryNpc } from "@/composables/canon/useNewBackstoryNpc";
import { typeChoices, type TypeChoice } from "@/lib/worldLinks/connections";
import { IconAdd } from "@/lib/icons";
import type { PartyMember } from "@/types/party.types";

const { member } = defineProps<{ member: PartyMember }>();

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
  const person = await start(member.name, member.id, { name: name.value, relationship: relationship.value });
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
