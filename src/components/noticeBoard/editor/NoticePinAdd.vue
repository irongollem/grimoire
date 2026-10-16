<template>
  <div class="flex flex-col gap-2" data-pin-add>
    <h3 class="text-eyebrow font-semibold text-muted-foreground">Add to the board</h3>
    <div class="grid grid-cols-2 gap-2">
      <AppButton
        v-for="option in OPTIONS"
        :key="option.style"
        variant="outline"
        size="md"
        :icon="option.icon"
        :label="option.label"
        :disabled="disabled"
        @click="emit('add', option.style)"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import type { Component } from "vue";
import AppButton from "@/components/common/controls/AppButton.vue";
import { IconImage, IconNote, IconNoticeBoard, IconScrollText } from "@/lib/icons";
import type { NoticePinStyle } from "@/types/noticeBoard.types";

const { disabled = false } = defineProps<{ disabled?: boolean }>();
const emit = defineEmits<{ add: [style: NoticePinStyle] }>();

const OPTIONS: ReadonlyArray<{ style: NoticePinStyle; label: string; icon: Component }> = [
  { style: "note", label: "Note", icon: IconNote },
  { style: "poster", label: "Wanted poster", icon: IconNoticeBoard },
  { style: "letter", label: "Sealed letter", icon: IconScrollText },
  { style: "image", label: "Picture", icon: IconImage },
];
</script>
