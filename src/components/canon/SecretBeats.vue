<template>
  <div v-if="beats.length > 0" class="flex flex-col gap-2" data-testid="secret-beats">
    <span class="text-eyebrow text-muted-foreground">Beats that uncover it</span>
    <ul class="flex flex-col gap-1.5">
      <li v-for="beat in beats" :key="beat.id" class="text-body text-foreground">
        <RouterLink :to="`/quests/${beat.quest_id}`" class="underline">{{ beat.title }}</RouterLink>
        <span class="text-caption text-muted-foreground"> · {{ questTitles.get(beat.quest_id) ?? "A quest that is gone" }}</span>
      </li>
    </ul>
  </div>
</template>

<script setup lang="ts">
/** The quest beats that are this secret (#1255 item 21): each with its quest's title, linking to the quest. Nothing when none is tied. */
import { computed } from "vue";
import { useSecretBeats } from "@/composables/canon/useSecretBeats";
import { useQuests } from "@/composables/quests/useQuests";

const { secretId } = defineProps<{ secretId: string }>();

const { data } = useSecretBeats(() => secretId);
const beats = computed(() => data.value ?? []);
const { data: quests } = useQuests();
const questTitles = computed(() => new Map((quests.value ?? []).map((q) => [q.id, q.title])));
</script>
