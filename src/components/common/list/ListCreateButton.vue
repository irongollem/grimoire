<template>
  <!-- Where the DM bottom bar shows, its gold "+" is this page's create (it
       runs the handler registered below), so the header copy steps aside. -->
  <ListActionButton
    variant="primary"
    :icon="IconAdd"
    :label="label"
    :mobile-label="mobileLabel"
    :to="to"
    :disabled="disabled"
    :class="barNavMounted ? 'barnav:hidden' : ''"
    @click="to ? undefined : emit('click')"
  />
</template>

<script setup lang="ts">
/**
 * A list page's "New …" button, and the same action for the DM bottom bar's
 * "+" and the More sheet's "New …" (see `useBarCreate`). Use it for the page's
 * one create action; other primary actions stay `ListActionButton`.
 */
import { useRouter } from "vue-router";
import { IconAdd } from "@/lib/icons";
import { barNavMounted, useBarCreate } from "@/composables/useBarCreate";
import ListActionButton from "./ListActionButton.vue";

const { label, mobileLabel, to, disabled = false } = defineProps<{
  label: string;
  mobileLabel?: string;
  /** Route to open; otherwise the `click` handler is the create. */
  to?: string;
  disabled?: boolean;
}>();
const emit = defineEmits<{ click: [] }>();

const router = useRouter();

function run(): void {
  if (to) router.push(to);
  else emit("click");
}

useBarCreate(() => (disabled ? null : { label, run }));
</script>
