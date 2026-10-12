<template>
  <!--
    What this NPC and the party have told each other (#1019), by hand. It works
    without AI: every line is typed here, and the same ledger is what the
    players read in their portal for the lines shared with them.
  -->
  <div class="space-y-3" data-testid="npc-memory-tab">
    <div>
      <div class="flex items-baseline justify-between gap-3">
        <h3 class="text-heading-sm font-bold text-foreground">Memory</h3>
        <span v-if="memories.length" class="text-caption text-muted-foreground">
          {{ memories.length }} {{ memories.length === 1 ? "line" : "lines" }}
        </span>
      </div>
      <div class="gold-divider mt-1" />
    </div>

    <section class="rounded-lg border border-border bg-card p-3">
      <NpcMemoryForm :members="members" :save="add" />
    </section>

    <ListSkeleton v-if="isPending" variant="rows" :count="3" :columns="1" />
    <p v-else-if="error" class="text-body text-destructive" role="alert">
      Could not read this NPC's memory. {{ toast.fromError(error) }}
    </p>
    <p v-else-if="!memories.length" class="text-body italic text-muted-foreground">
      Nothing remembered yet. Note what they told the party, what the party told them, promises and lies, so the next session picks up where this one ended.
    </p>
    <div v-else class="space-y-4">
      <section v-for="group in groups" :key="group.sessionId ?? 'none'" class="space-y-2">
        <h4 class="text-label-lg font-bold text-muted-foreground">{{ groupTitle(group.sessionId) }}</h4>
        <ul class="flex flex-col gap-2">
          <NpcMemoryRow v-for="m in group.memories" :key="m.id" :memory="m" :members="members" />
        </ul>
      </section>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import ListSkeleton from "@/components/common/feedback/ListSkeleton.vue";
import NpcMemoryForm, { type NpcMemoryDraft } from "@/components/npcs/NpcMemoryForm.vue";
import NpcMemoryRow from "@/components/npcs/NpcMemoryRow.vue";
import { useCampaignSessions } from "@/composables/sessions/useCampaignSessions";
import { useCreateNpcMemory, useNpcMemories } from "@/composables/npcs/useNpcMemories";
import { useParty } from "@/composables/party/useParty";
import { useToast } from "@/composables/useToast";
import { getNpcDisplayName } from "@/lib/npcDisplay";
import { groupMemoriesBySession } from "@/lib/npcs/npcMemories";
import { sessionLabel } from "@/lib/sessions/sessionLabel";
import { formatSessionDay } from "@/lib/sessions/sessionPrefill";
import type { NpcListRow } from "@/types/npc.types";

const { npc } = defineProps<{ npc: NpcListRow }>();

const toast = useToast();
const npcId = computed(() => npc.id);
const { data, isPending, error } = useNpcMemories(npcId);
const { data: log } = useCampaignSessions();
const { data: party } = useParty();
const create = useCreateNpcMemory();

const memories = computed(() => data.value ?? []);
const members = computed(() => (party.value ?? []).map((m) => ({ id: m.id, name: m.name })));
const sessions = computed(() => log.value ?? []);
const groups = computed(() => groupMemoriesBySession(memories.value, sessions.value));

function groupTitle(sessionId: string | null): string {
  if (sessionId === null) return "Outside any session";
  const s = sessions.value.find((row) => row.id === sessionId);
  return s ? `${sessionLabel(s)} · ${formatSessionDay(s)}` : "Another session";
}

async function add(draft: NpcMemoryDraft): Promise<boolean> {
  try {
    await create.mutateAsync({ memory: { npc_id: npc.id, ...draft }, npcLabel: getNpcDisplayName(npc) ?? "Unnamed NPC" });
    return true;
  } catch (e) {
    toast.error(toast.fromError(e, "Could not save that line."));
    return false;
  }
}
</script>
