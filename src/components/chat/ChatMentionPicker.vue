<template>
  <!-- Who an "@" being typed could mean (#1021 row 26). Drawn over the composer, so it floats: a torn slip. -->
  <ul
    v-if="suggestions.length"
    data-slip
    role="listbox"
    aria-label="Mention someone"
    class="absolute bottom-full left-2 right-2 z-10 mb-1 max-h-48 overflow-y-auto bg-card py-1"
  >
    <li v-for="(target, i) in suggestions" :key="target.kind + (target.partyMemberId ?? '')" role="option" :aria-selected="i === active">
      <AppButton
        variant="ghost"
        size="sm"
        block
        class="justify-start"
        :active="i === active"
        :label="target.kind === 'party' ? '@party' : '@' + target.name"
        @mousedown.prevent
        @click="emit('pick', target)"
      >
        <template v-if="hintFor(target)" #default>
          <span>{{ target.kind === "party" ? "@party" : "@" + target.name }}</span>
          <span class="ml-2 text-caption text-muted-foreground">{{ hintFor(target) }}</span>
        </template>
      </AppButton>
    </li>
  </ul>
</template>

<script setup lang="ts">
import AppButton from "@/components/common/controls/AppButton.vue";
import type { MentionTarget } from "@/lib/chat/chatMentions";

defineProps<{ suggestions: readonly MentionTarget[]; active: number }>();
const emit = defineEmits<{ pick: [target: MentionTarget] }>();

function hintFor(target: MentionTarget): string | null {
  return target.kind === "party" ? "everyone in the party" : null;
}
</script>
