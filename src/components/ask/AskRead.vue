<template>
  <div class="flex flex-col gap-1">
    <p class="text-caption text-muted-foreground">
      Read {{ records.length }} {{ records.length === 1 ? "record" : "records" }}.
      <AppButton variant="link" size="inline-caption" :label="open ? 'Hide what I read' : 'Show what I read'" :aria-expanded="open" @click="open = !open" />
    </p>
    <Transition v-bind="drawerTransition()">
      <ul v-show="open" class="flex flex-col gap-0.5 pl-3 text-caption" data-testid="ask-read-list">
        <li v-for="record in routed" :key="`${record.type}:${record.id}`" class="flex items-baseline gap-1.5">
          <RouterLink v-if="record.route !== null" :to="record.route" class="underline underline-offset-2 hover:text-primary">{{ record.name }}</RouterLink>
          <span v-else>{{ record.name }}</span>
          <span class="text-caption-sm text-muted-foreground">{{ RECORD_KIND_LABEL[record.type] }}</span>
        </li>
      </ul>
    </Transition>
  </div>
</template>

<script setup lang="ts">
/** "Read N records. Show what I read": the records an answer rests on, one tap away and quiet until then. */
import { computed, ref } from "vue";
import { RouterLink } from "vue-router";
import type { AskRecordRef } from "@edge-shared/agent/askContract";
import { drawerTransition } from "@/lib/motion";
import { askRecordRoute, RECORD_KIND_LABEL } from "@/composables/ask/askRecordRoute";
import AppButton from "@/components/common/controls/AppButton.vue";

const { records } = defineProps<{ records: AskRecordRef[] }>();
const open = ref(false);
// Each record's route once: a kind with no page of its own (a beat, a room) has none and is shown as plain text.
const routed = computed(() => records.map((record) => ({ ...record, route: askRecordRoute(record) })));
</script>
