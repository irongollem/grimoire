<template>
  <!-- A character played by the AI while their player is away (#1021 row 26): the player's own word that it may
       speak for them, and what the character lived through meanwhile, which is theirs to read. -->
  <section v-if="canSet || lived.length > 0" class="flex flex-col gap-3 border border-border bg-card p-4" aria-label="Played by the AI" data-testid="character-ai-play">
    <AppCheckbox
      v-if="canSet"
      :model-value="member.ai_speaks === true"
      :label="`The AI may speak for ${member.name} when ${whose} away`"
      :hint="`At a table the Narrator runs, ${member.name} is then given lines of their own, from what this sheet says of them. Without it ${member.name} is still there and only acts: the Narrator tells what they do and gives them no words.`"
      :disabled="saving"
      data-testid="character-ai-speaks"
      @update:model-value="set"
    />
    <p v-if="problem" role="alert" class="text-caption text-destructive">{{ problem }}</p>
    <div v-if="lived.length > 0" class="flex flex-col gap-1.5" data-testid="character-lived">
      <h3 class="text-label-lg font-semibold text-foreground">What {{ member.name }} lived through while played by the AI</h3>
      <ul class="flex flex-col gap-1">
        <li v-for="m in lived" :key="m.id" class="border-b border-dotted border-border py-1 text-body text-foreground">
          {{ m.body }}
          <span class="text-caption text-muted-foreground"> · {{ new Date(m.created_at).toLocaleDateString() }}</span>
        </li>
      </ul>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, ref } from "vue";
import AppCheckbox from "@/components/common/controls/AppCheckbox.vue";
import { useUpdatePartyMember } from "@/composables/party/useParty";
import { usePartyMemberMemories } from "@/composables/party/usePartyMemberMemories";

const { member, canSet = false, own = false } = defineProps<{
  member: { id: string; name: string; campaign_id: string | null; ai_speaks?: boolean };
  /** The character's own player, or the campaign's DM: may set the switch. */
  canSet?: boolean;
  /** The viewer is the character's own player ("when I am away"), not the DM ("when their player is away"). */
  own?: boolean;
}>();

const whose = computed(() => (own ? "I am" : "their player is"));
const memories = usePartyMemberMemories(() => member.id, () => member.campaign_id);
const lived = computed(() => memories.data.value ?? []);

const { mutateAsync: update, isPending: saving } = useUpdatePartyMember();
const problem = ref<string | null>(null);

async function set(on: boolean): Promise<void> {
  problem.value = null;
  try {
    await update({ id: member.id, update: { ai_speaks: on } });
  } catch {
    problem.value = "That could not be saved. Try again.";
  }
}
</script>
