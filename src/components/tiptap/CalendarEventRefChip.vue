<template>
  <!-- atom node — no inner content, NodeViewWrapper must be inline -->
  <NodeViewWrapper as="span" class="cal-event-ref-wrapper">
    <!-- ── EDITOR MODE: static chip, deletable with backspace ─────────────── -->
    <span v-if="isEditable" class="cal-chip cal-chip--edit" contenteditable="false">
      <IconCalendarDays class="cal-chip-icon" />
      <span class="cal-chip-label">{{ node.attrs.label || 'event' }}</span>
    </span>

    <!-- ── VIEWER MODE: loading ──────────────────────────────────────────── -->
    <span v-else-if="isLoading" class="cal-chip cal-chip--loading" contenteditable="false">
      <IconCalendarDays class="cal-chip-icon" />
      <span class="cal-chip-label">…</span>
    </span>

    <!-- ── VIEWER MODE: event removed ───────────────────────────────────── -->
    <span v-else-if="eventData === null || eventData === undefined" class="cal-chip cal-chip--removed" contenteditable="false">
      <IconRemoveEvent class="cal-chip-icon" />
      <span class="cal-chip-label">[event removed]</span>
    </span>

    <!-- ── VIEWER MODE: clickable link ──────────────────────────────────── -->
    <button
      v-else
      type="button"
      class="cal-chip cal-chip--link"
      contenteditable="false"
      :title="`Go to calendar: ${eventData!.title}`"
      @click="navigate"
    >
      <IconCalendarDays class="cal-chip-icon" />
      <span class="cal-chip-label">{{ eventData!.title }}</span>
    </button>
  </NodeViewWrapper>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { nodeViewProps, NodeViewWrapper } from "@tiptap/vue-3";
import { IconCalendarDays, IconRemoveEvent } from '@/lib/icons';
import { useRouter } from "vue-router";
import { useCalendarStore } from "@/stores/calendar";
import { useCalendarEventById } from "@/composables/useCalendarEvents";

const props = defineProps({ ...nodeViewProps });

const isEditable = computed(() => props.editor.isEditable);

// ── Viewer: resolve event existence ──────────────────────────────────────────

const eventId = computed(() => props.node.attrs.eventId as string | null);
const { data: eventData, isLoading } = useCalendarEventById(eventId);

// ── Viewer: navigate to calendar ─────────────────────────────────────────────

const router = useRouter();
const calendarStore = useCalendarStore();

function navigate() {
  if (!eventData.value) return;
  const ev = eventData.value;
  calendarStore.goToMonth(ev.harptos_year, ev.harptos_month ?? 1);
  calendarStore.setHighlightedEvent(ev.id);
  void router.push("/calendar");
}
</script>

<style scoped>
@reference "@/assets/main.css";

.cal-event-ref-wrapper {
  display: inline;
}

.cal-chip {
  display: inline-flex;
  align-items: center;
  gap: 0.25rem;
  padding: 0.1rem 0.5rem;
  border-radius: 9999px;
  font-family: var(--font-cinzel, serif);
  font-size: 0.65rem;
  font-weight: 600;
  letter-spacing: 0.03em;
  white-space: nowrap;
  vertical-align: baseline;
  line-height: 1.6;
  border: 1px solid;
  user-select: none;
}

.cal-chip-icon {
  width: 0.65rem;
  height: 0.65rem;
  flex-shrink: 0;
}

.cal-chip--edit {
  border-color: theme(colors.primary / 35%);
  background: theme(colors.primary / 10%);
  color: theme(colors.primary);
  cursor: default;
}

.cal-chip--link {
  border-color: theme(colors.primary / 40%);
  background: theme(colors.primary / 10%);
  color: theme(colors.primary);
  cursor: pointer;
  transition: background-color 0.15s, border-color 0.15s;
}
.cal-chip--link:hover {
  background: theme(colors.primary / 20%);
  border-color: theme(colors.primary / 60%);
}

.cal-chip--removed {
  border-color: theme(colors.border);
  background: theme(colors.muted / 40%);
  color: theme(colors.muted-foreground);
  cursor: default;
  text-decoration: line-through;
}

.cal-chip--loading {
  border-color: theme(colors.border);
  background: transparent;
  color: theme(colors.muted-foreground);
  cursor: default;
}
</style>
