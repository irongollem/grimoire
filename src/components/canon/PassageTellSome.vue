<template>
  <div class="flex flex-col gap-2" data-testid="tell-some">
    <ul class="flex flex-col gap-1">
      <li v-for="m in members" :key="m.id">
        <AppCheckbox v-model="chosen" :value="m.id" :label="m.name" :data-testid="`tell-some-${m.id}`" />
      </li>
    </ul>
    <div class="flex flex-wrap items-center gap-2">
      <AppButton variant="primary" size="sm" label="Tell" :disabled="chosen.length === 0" data-testid="tell-some-confirm" @click="emit('tell', [...chosen])" />
      <AppButton variant="ghost" size="sm" label="Cancel" data-testid="tell-some-cancel" @click="emit('cancel')" />
    </div>
  </div>
</template>

<script setup lang="ts">
/**
 * The small chooser under "Tell some…" on a lore passage (#1255 item 15): one box per party member, none ticked, or
 * those who already have it ticked when widening. It only reports who to tell; the row decides what that writes.
 */
import { ref } from "vue";
import AppButton from "@/components/common/controls/AppButton.vue";
import AppCheckbox from "@/components/common/controls/AppCheckbox.vue";

const { members, told = [] } = defineProps<{
  members: readonly { id: string; name: string }[];
  /** Member ids that already have the passage: ticked to begin with. */
  told?: readonly string[];
}>();
const emit = defineEmits<{ tell: [ids: string[]]; cancel: [] }>();

const chosen = ref<string[]>([...told]);
</script>
