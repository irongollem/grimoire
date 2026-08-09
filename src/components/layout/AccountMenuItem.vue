<template>
  <AppButton
    variant="ghost"
    size="inline"
    block
    :to="to"
    :tooltip="tooltip"
    :aria-label="label"
    :class="cn('justify-start gap-2 px-3 py-2 text-caption hover:bg-secondary/60', danger && 'text-red-400/80 hover:text-red-400')"
    @click="emit('click', $event)"
  >
    <template #icon>
      <component :is="icon" class="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
    </template>
    <span>{{ label }}</span>
    <slot name="trailing" />
  </AppButton>
</template>

<script setup lang="ts">
/**
 * One row of the sidebar's account popover. The six rows (edit name, Account,
 * Billing, Install, Report a bug, Sign out) were six copies of the same class
 * string split across `<button>` and `<RouterLink>`, so adding the Account row
 * for #631 meant writing a seventh — the case CLAUDE.md says to extract before
 * the second copy, not after the sixth.
 *
 * `aria-label` is pinned to the visible label rather than left to AppButton's
 * `tooltip ?? label` fallback: the Install row's tooltip is a whole sentence of
 * instructions, and letting that become the accessible name would break WCAG
 * 2.5.3 (Label in Name) for the one row that has a tooltip at all.
 */
import type { Component } from "vue";
import AppButton from "@/components/common/AppButton.vue";
import { cn } from "@/lib/utils";
import type { RouteLocationRaw } from "vue-router";

const { danger = false } = defineProps<{
  label: string;
  icon: Component;
  /** Renders the row as a RouterLink. Omit for a plain button row. */
  to?: RouteLocationRaw;
  /** Supplementary hover text; never becomes the accessible name. */
  tooltip?: string;
  /** Sign out — the one row that reads as destructive. */
  danger?: boolean;
}>();

const emit = defineEmits<{ (e: "click", ev: MouseEvent): void }>();
</script>
