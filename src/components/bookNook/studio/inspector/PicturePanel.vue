<template>
  <div class="flex flex-col gap-4">
    <InspectorSection title="The room">
      <p class="text-body text-foreground tabular-nums">{{ scene.size.width }} by {{ scene.size.height }}</p>
      <p class="text-caption text-muted-foreground">Every depth is measured from the picture. It stays where it is, at depth 1, and everything else is placed against it.</p>
    </InspectorSection>
    <AppButton variant="outline" size="sm" label="Replace the room…" @click="emit('replace-room')" />
  </div>
</template>

<script setup lang="ts">
import AppButton from "@/components/common/controls/AppButton.vue";
import InspectorSection from "./InspectorSection.vue";
import type { Scene } from "@/lib/bookNook/scene";

/** The picture is the room itself: its size, and the way to swap it for another. */
defineProps<{ scene: Scene }>();
const emit = defineEmits<{ "replace-room": [] }>();
</script>
