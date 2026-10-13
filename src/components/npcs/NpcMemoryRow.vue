<template>
  <li class="rounded-lg border border-border bg-card p-3" data-testid="npc-memory-row">
    <NpcMemoryForm
      v-if="editing"
      :members="members"
      :initial="memory"
      submit-label="Save"
      cancellable
      :save="saveEdit"
      @cancel="editing = false"
    />
    <div v-else class="flex items-start gap-2">
      <div class="min-w-0 flex-1">
        <p class="text-body text-foreground">
          <span class="mr-1.5 text-label font-semibold" :class="KIND_TINT[memory.kind]">{{ NPC_MEMORY_KIND_LABELS[memory.kind] }}</span>
          {{ memory.body }}
        </p>
        <p v-if="reference" class="mt-1 text-caption text-muted-foreground">
          <NpcMemoryDisclosure :reference="reference" :secrets="secrets" :loaded="secretsLoaded" />
        </p>
        <p v-if="presentNames.length || shared || memory.ai_provenance" class="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-caption text-muted-foreground">
          <span v-if="presentNames.length">{{ presentNames.join(", ") }}</span>
          <span v-if="shared" class="inline-flex items-center gap-1"><IconReveal class="h-3 w-3" aria-hidden="true" />Players see this</span>
          <AiGeneratedBadge v-if="memory.ai_provenance" variant="inline" :provenance="memory.ai_provenance" />
        </p>
      </div>
      <div class="flex shrink-0 items-center">
        <AppButton variant="ghost" size="icon-xs" :icon="IconEdit" label="" aria-label="Edit this line" @click="editing = true" />
        <AppButton variant="ghost" size="icon-xs" tone="danger" :icon="IconDelete" label="" aria-label="Delete this line" @click="remove" />
      </div>
    </div>
  </li>
</template>

<script setup lang="ts">
import { computed, ref } from "vue";
import AiGeneratedBadge from "@/components/common/ai/AiGeneratedBadge.vue";
import AppButton from "@/components/common/controls/AppButton.vue";
import NpcMemoryDisclosure from "@/components/npcs/NpcMemoryDisclosure.vue";
import NpcMemoryForm, { type NpcMemoryDraft } from "@/components/npcs/NpcMemoryForm.vue";
import type { SecretRef } from "@/lib/npcs/secretEntityRoute";
import { useCampaignSecrets } from "@/composables/npcs/useCampaignSecrets";
import { useConfirm } from "@/composables/useConfirm";
import { useToast } from "@/composables/useToast";
import { useDeleteNpcMemory, useUpdateNpcMemory } from "@/composables/npcs/useNpcMemories";
import { IconDelete, IconEdit, IconReveal } from "@/lib/icons";
import { NPC_MEMORY_KIND_LABELS } from "@/lib/npcs/npcMemories";
import type { NpcMemory, NpcMemoryKind } from "@/types/npcMemory.types";

const { memory, members } = defineProps<{
  memory: NpcMemory;
  members: readonly { id: string; name: string }[];
}>();

const KIND_TINT: Record<NpcMemoryKind, string> = {
  revealed: "text-tone-info",
  learned: "text-tone-success",
  promise: "text-tone-caution",
  deceived: "text-tone-danger",
  attitude: "text-tone-arcane",
  event: "text-muted-foreground",
};

const editing = ref(false);
const toast = useToast();
const { confirm } = useConfirm();
const update = useUpdateNpcMemory();
const del = useDeleteNpcMemory();

const presentNames = computed(() =>
  members.filter((m) => memory.party_member_ids.includes(m.id)).map((m) => m.name),
);
const reference = computed<SecretRef | null>(() =>
  memory.secret_id && memory.secret_entity_id && memory.secret_entity_type
    ? { secret_entity_type: memory.secret_entity_type, secret_entity_id: memory.secret_entity_id, secret_id: memory.secret_id }
    : null,
);
// Only a line that names a secret reads the list; it is DM-only and shared by every row.
const { data: secretList, isSuccess: secretsLoaded } = useCampaignSecrets(() => reference.value !== null);
const secrets = computed(() => secretList.value ?? []);
const shared = computed(() => memory.player_visible_to.length > 0);

async function saveEdit(draft: NpcMemoryDraft): Promise<boolean> {
  try {
    await update.mutateAsync({ id: memory.id, patch: draft });
    editing.value = false;
    return true;
  } catch (e) {
    toast.error(toast.fromError(e, "Could not save that line."));
    return false;
  }
}

async function remove() {
  if (!(await confirm("Delete this line from the NPC's memory?", { title: "Delete memory", confirmLabel: "Delete", danger: true }))) return;
  try {
    await del.mutateAsync(memory.id);
  } catch (e) {
    toast.error(toast.fromError(e, "Could not delete that line."));
  }
}
</script>
