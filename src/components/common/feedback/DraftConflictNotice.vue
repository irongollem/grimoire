<template>
  <CautionNotice v-if="fields.length" class="flex flex-wrap items-center gap-x-3 gap-y-1">
    <span class="flex-1">
      Changed elsewhere while you were editing: {{ fields.join(", ") }}. Saving keeps your version.
    </span>
    <AppButton v-if="onDiscard" label="Use theirs" size="sm" variant="subtle" @click="onDiscard" />
  </CautionNotice>
</template>

<script setup lang="ts">
import CautionNotice from "@/components/common/feedback/CautionNotice.vue";
import AppButton from "@/components/common/controls/AppButton.vue";

/**
 * The one line an editor shows when `useRecordDraft` reports a conflict (#946):
 * a field the user changed that someone else changed too, on another device or
 * as another DM. Untouched fields never get here, they just update. `fields`
 * are display labels, not column names. `onDiscard` offers to throw the local
 * edits away (`useRecordDraft().reset`), for an editor where that makes sense.
 */
const { fields, onDiscard } = defineProps<{
  fields: string[];
  onDiscard?: () => void;
}>();
</script>
