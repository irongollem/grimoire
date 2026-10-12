<template>
  <section v-if="groups.length > 0" class="space-y-3" aria-label="What we know">
    <p class="text-label font-semibold text-primary/70">WHAT WE KNOW</p>
    <div v-for="group in groups" :key="group.key" class="space-y-1.5">
      <p class="flex items-baseline gap-2 text-caption text-muted-foreground">
        <span class="text-eyebrow font-bold uppercase">{{ group.title }}</span>
        <span v-if="group.within" class="italic">{{ group.within }}</span>
        <span v-if="group.end" class="ml-auto">{{ group.end }}</span>
      </p>
      <ul class="space-y-1.5 border-l border-border pl-3">
        <li v-for="memory in group.memories" :key="memory.id" class="text-body text-foreground">
          <span class="mr-1.5 text-caption italic text-muted-foreground">{{ PLAYER_NPC_MEMORY_KIND_LABELS[memory.kind] }}</span>
          <span class="whitespace-pre-line">{{ memory.body }}</span>
        </li>
      </ul>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { useMyNpcMemories } from "@/composables/npcs/useNpcMemories";
import { usePlayerSessions } from "@/composables/sessions/usePlayerSessions";
import { groupMemoriesBySession, PLAYER_NPC_MEMORY_KIND_LABELS } from "@/lib/npcs/npcMemories";
import { sessionShortLabel } from "@/lib/sessions/sessionLabel";
import { formatSessionShortDay, playerSessionWhen } from "@/lib/sessions/sessionShortDay";
import type { PlayerSessionLabel } from "@/types/session.types";

/**
 * "What we know about" a person: the memory lines the DM shared with this
 * character, grouped by session the way the People ledger groups people. Absence
 * is normal for a player, so with nothing shared the section is not drawn.
 */
const { npcId } = defineProps<{ npcId: string }>();

const { data: memories } = useMyNpcMemories(() => npcId);
const { data: sessions } = usePlayerSessions();

function compareNewestFirst(a: PlayerSessionLabel, b: PlayerSessionLabel): number {
  const wa = playerSessionWhen(a);
  const wb = playerSessionWhen(b);
  if (wa === null || wb === null) return wa === wb ? 0 : wa === null ? 1 : -1;
  return Date.parse(wb) - Date.parse(wa);
}

const groups = computed(() => {
  const rows = memories.value;
  if (!rows || rows.length === 0) return [];
  const known = (sessions.value ? [...sessions.value] : []).sort(compareNewestFirst);
  return groupMemoriesBySession(rows, known).map((group) => {
    const session = known.find((s) => s.id === group.sessionId);
    if (!session) {
      return { key: group.sessionId ?? "none", title: "Before the log", within: null, end: null, memories: group.memories };
    }
    const numbered = session.number !== null;
    const name = session.title?.trim() || null;
    return {
      key: session.id,
      title: numbered ? sessionShortLabel(session) : (name ?? "Unnumbered session"),
      within: numbered ? name : null,
      end: formatSessionShortDay(session),
      memories: group.memories,
    };
  });
});
</script>
