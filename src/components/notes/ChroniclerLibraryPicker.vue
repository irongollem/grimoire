<template>
  <Teleport to="body">
    <div
      v-if="visible"
      class="fixed inset-0 z-50 flex items-center justify-center bg-black/70"
      @click.self="emit('close')"
    >
      <div class="bg-card rounded-lg border border-border p-4 w-72 flex flex-col gap-3">
        <div class="flex items-center justify-between">
          <span class="font-cinzel text-xs font-bold tracking-wider">Scene Library</span>
          <button
            type="button"
            class="text-muted-foreground hover:text-foreground transition-colors"
            @click="emit('close')"
          >
            <X class="h-4 w-4" />
          </button>
        </div>

        <p v-if="!images?.length" class="font-fell text-xs text-muted-foreground italic text-center py-4">
          No scene illustrations yet. Generate one from a note.
        </p>

        <div v-else class="grid grid-cols-4 gap-1.5">
          <button
            v-for="img in images"
            :key="img.id"
            type="button"
            class="relative w-14 h-14 rounded overflow-hidden border border-border hover:border-primary transition-colors group"
            :title="img.prompt"
            @click="select(img.image_url)"
          >
            <img :src="img.image_url" :alt="img.prompt" class="w-full h-full object-cover" />
            <div class="absolute inset-0 bg-primary/20 [@media(hover:hover)]:opacity-0 group-hover:opacity-100 transition-opacity" />
          </button>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { X } from "lucide-vue-next";
import { useChroniclerImages } from "@/composables/useChroniclerImages";

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
