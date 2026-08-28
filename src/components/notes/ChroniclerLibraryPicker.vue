<template>
  <AppModal :open="visible" size="sm" @close="emit('close')">
    <ModalHeader title="Scene Library" closeable @close="emit('close')" />

    <div class="min-h-0 flex-1 overflow-y-auto overscroll-contain p-4">
      <p v-if="!images?.length" class="text-caption text-muted-foreground italic text-center py-4">
        No scene illustrations yet. Generate one from a note.
      </p>

      <div v-else class="grid grid-cols-4 gap-1.5">
        <AppButton
          v-for="img in images"
          v-show="img.image_url"
          :key="img.id"
          variant="ghost"
          :tooltip="img.prompt"
          class="relative w-14 h-14 p-0 rounded overflow-hidden border border-border hover:border-primary transition-colors group"
          @click="img.image_url && select(img.image_url)"
        >
          <img :src="img.image_url ?? ''" :alt="img.prompt" class="w-full h-full object-cover" />
          <div class="absolute inset-0 bg-primary/20 [@media(hover:hover)]:opacity-0 group-hover:opacity-100 transition-opacity" />
        </AppButton>
      </div>
    </div>
  </AppModal>
</template>

<script setup lang="ts">
import AppButton from "@/components/common/AppButton.vue";
import AppModal from "@/components/common/AppModal.vue";
import ModalHeader from "@/components/common/ModalHeader.vue";
import { useChroniclerImages } from "@/composables/notes/useChroniclerImages";

defineProps<{ visible: boolean }>();

const emit = defineEmits<{
  close: [];
  select: [url: string];
}>();

const { data: images } = useChroniclerImages();

function select(url: string) {
  emit("select", url);
  emit("close");
}
</script>
