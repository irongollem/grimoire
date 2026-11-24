<template>
  <CanonRow :id="`canon-backstory-${member.id}`" :label="member.name" :selected="selected" @select="emit('select')">
    <span class="min-w-0 flex-1">
      <span class="block text-body leading-snug text-foreground">{{ member.name }}</span>
      <span v-if="member.player_name" class="mt-1 block text-label text-muted-foreground" data-testid="backstory-player">played by {{ member.player_name }}</span>
    </span>
    <template #mark>
      <span class="inline-flex items-center gap-1.5 whitespace-nowrap text-label font-bold" :class="state.tone" :data-state="state.key" data-testid="backstory-mark">
        <span aria-hidden="true" class="size-2 shrink-0 rotate-45 border" :class="state.shape" />
        {{ state.word }}
      </span>
    </template>
  </CanonRow>
</template>

<script setup lang="ts">
/**
 * One character in the Backstories list. The mark says what is left to do: threads the past leaves open first, then
 * passages not yet told, then that every passage has been told (a past with no passages yet says so instead).
 */
import { computed } from "vue";
import CanonRow from "./kit/CanonRow.vue";
import type { PartyMember } from "@/types/party.types";

const { member, passages, untold, threads, selected = false } = defineProps<{ member: PartyMember; passages: number; untold: number; threads: number; selected?: boolean }>();
const emit = defineEmits<{ select: [] }>();

const state = computed(() => {
  if (threads > 0) return { key: "threads", word: `${threads} ${threads === 1 ? "thread" : "threads"} open`, tone: "text-tone-info", shape: "border-current bg-[linear-gradient(135deg,currentColor_50%,transparent_50%)]" };
  if (untold > 0) return { key: "untold", word: `${untold} not yet told`, tone: "text-foreground", shape: "border-[1.5px] border-current bg-transparent" };
  if (passages === 0) return { key: "none", word: "No passages", tone: "text-muted-foreground", shape: "border-[1.5px] border-current bg-transparent" };
  return { key: "told", word: "All told", tone: "text-tone-success", shape: "border-current bg-current" };
});
</script>
