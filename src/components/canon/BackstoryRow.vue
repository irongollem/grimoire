<template>
  <CanonLedgerRow :id="`canon-backstory-${member.id}`" :label="member.name" :selected="selected" @select="emit('select')">
    <span class="min-w-0 flex-1">
      <span class="block text-body leading-snug text-foreground">{{ member.name }}</span>
      <span class="mt-1 flex flex-wrap gap-x-3 text-label text-muted-foreground">
        <span v-if="member.player_name" data-testid="backstory-player">played by {{ member.player_name }}</span>
        <span data-testid="backstory-count">{{ passages }} {{ passages === 1 ? "passage" : "passages" }}</span>
        <span v-if="untold > 0" class="font-bold text-foreground" data-testid="backstory-untold">{{ untold }} not yet told</span>
        <span v-if="threads > 0" data-testid="backstory-threads-open">{{ threads }} open {{ threads === 1 ? "thread" : "threads" }}</span>
      </span>
    </span>
  </CanonLedgerRow>
</template>

<script setup lang="ts">
import CanonLedgerRow from "./CanonLedgerRow.vue";
import type { PartyMember } from "@/types/party.types";

defineProps<{ member: PartyMember; passages: number; untold: number; threads: number; selected?: boolean }>();
const emit = defineEmits<{ select: [] }>();
</script>
