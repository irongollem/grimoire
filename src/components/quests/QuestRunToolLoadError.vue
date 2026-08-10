<template>
  <Teleport to="body">
    <div class="fixed inset-0 z-100 flex items-end justify-center bg-black/65 p-2 sm:items-center sm:p-4" @click.self="emit('close')">
      <section class="w-full max-w-md rounded-xl border border-destructive/40 bg-background p-4 shadow-2xl" role="alert">
        <h2 class="font-cinzel text-lg font-bold text-foreground">Quick view unavailable</h2>
        <p class="mt-2 text-body text-muted-foreground">The supporting tool failed to load. Your quest position and specialist data were not changed.</p>
        <div class="mt-4 flex justify-end">
          <AppButton label="Close" variant="subtle" @click="emit('close')" />
        </div>
      </section>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import AppButton from "@/components/common/AppButton.vue";

defineProps<{ error?: Error }>();
const emit = defineEmits<{ close: [] }>();
</script>
