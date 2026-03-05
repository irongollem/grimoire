<template>
  <div class="flex items-center justify-center" :class="fullPage ? 'min-h-screen' : 'py-12'">
    <div class="flex flex-col items-center gap-3">
      <!-- Rotating d20 / arcane circle -->
      <div
        class="h-10 w-10 rounded-full border-2 border-gold-700 border-t-gold-400 animate-spin"
      />
      <p v-if="message" class="font-fell text-muted-foreground italic text-sm">
        {{ message }}
      </p>
    </div>
  </div>
</template>

<script setup lang="ts">
withDefaults(defineProps<{
  message?: string
  fullPage?: boolean
}>(), {
  message: undefined,
  fullPage: false,
})
</script>
