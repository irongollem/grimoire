<template>
  <!-- A native select is as wide as its longest option ("Session 14: The Wolves of Dougan's
       Hole · Friday 2 October"), which ran out of its card on a phone; it may shrink instead. -->
  <AppSelect v-model="inner" size="sm" class="min-w-0 max-w-full shrink" :aria-label="ariaLabel" @update:model-value="onPick">
    <option :value="PICK" disabled>{{ placeholder }}</option>
    <option v-for="s in choices" :key="s.id" :value="s.id">{{ sessionLabel(s) }} · {{ formatSessionDay(s) }}</option>
    <option v-if="includeNone" :value="NONE">Outside any session</option>
  </AppSelect>
</template>

<script setup lang="ts">
import { computed, ref, watch } from "vue";
import AppSelect from "@/components/common/controls/AppSelect.vue";
import { useCampaignSessions } from "@/composables/sessions/useCampaignSessions";
import { sessionLabel } from "@/lib/sessions/sessionLabel";
import { formatSessionDay } from "@/lib/sessions/sessionPrefill";

/**
 * Which session a learned moment goes in: every session of the log, newest
 * first, and optionally "Outside any session". The model is the session id,
 * `null` for none, `undefined` while nothing is chosen. Sentinels stay in
 * here because an `<option>` cannot hold null or undefined.
 */
const model = defineModel<string | null | undefined>();
const { exclude = null, includeNone = true, placeholder = "Choose a session…", ariaLabel = "Session" } = defineProps<{
  /** A session to leave out (the one the entry is already in). */
  exclude?: string | null;
  includeNone?: boolean;
  placeholder?: string;
  ariaLabel?: string;
}>();

const PICK = "__pick";
const NONE = "__none";

const { data: log } = useCampaignSessions();
const choices = computed(() => (log.value ?? []).filter((s) => s.id !== exclude));

function toInner(value: string | null | undefined): string {
  if (value === undefined) return PICK;
  return value === null ? NONE : value;
}
const inner = ref(toInner(model.value));
watch(model, (next) => (inner.value = toInner(next)));

function onPick(value: string) {
  if (value === PICK) return;
  model.value = value === NONE ? null : value;
}
</script>
