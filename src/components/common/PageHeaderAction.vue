<template>
  <button
    :type="type"
    :title="title ?? label"
    :disabled="disabled"
    :class="[
      'inline-flex min-w-0 items-center justify-center gap-1.5 rounded-md border font-cinzel text-xs font-semibold tracking-wider transition-colors disabled:opacity-50',
      compact ? 'px-2.5 py-2 lg:px-3 lg:py-1.5' : 'px-3 py-2',
      variantClasses,
    ]"
  >
    <component v-if="icon" :is="icon" class="h-3.5 w-3.5 shrink-0" />
    <span v-if="mobileLabel" class="lg:hidden">{{ mobileLabel }}</span>
    <span :class="mobileLabel || hideLabelOnMobile ? 'hidden lg:inline' : ''">
      {{ label }}
    </span>
  </button>
</template>

<script setup lang="ts">
import { computed, type Component } from "vue";

const props = withDefaults(defineProps<{
  label: string;
  mobileLabel?: string;
  title?: string;
  icon?: Component;
  variant?: "default" | "primary" | "destructive";
  type?: "button" | "submit" | "reset";
  disabled?: boolean;
  hideLabelOnMobile?: boolean;
  compact?: boolean;
}>(), {
  variant: "default",
  type: "button",
  hideLabelOnMobile: true,
  compact: true,
});

const variantClasses = computed(() => {
  if (props.variant === "primary") {
    return "border-primary bg-primary text-primary-foreground hover:opacity-90";
  }
  if (props.variant === "destructive") {
    return "border-destructive/40 text-destructive hover:bg-destructive/10";
  }
  return "border-border text-muted-foreground hover:text-foreground hover:border-foreground/40 hover:bg-muted/40";
});
</script>
