<template>
  <Teleport to="body">
    <div
      v-if="open"
      class="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
      @click.self="close"
    >
      <div class="bg-card border border-border rounded-lg w-full max-w-2xl max-h-[85vh] overflow-y-auto shadow-xl flex flex-col">
        <!-- Header -->
        <div class="flex items-center justify-between px-5 py-4 border-b border-border shrink-0">
          <div>
            <h2 class="text-heading font-bold text-foreground">Setting Events</h2>
            <p class="text-body text-muted-foreground italic mt-0.5">
              Import pre-authored historical events for your campaign setting.
            </p>
          </div>
          <button
            type="button"
            class="text-muted-foreground hover:text-foreground transition-colors text-xl leading-none"
            @click="close"
          >
            ✕
          </button>
        </div>

        <!-- Content -->
        <div class="px-5 py-4 flex flex-col gap-6 flex-1">
          <!-- No bundle for this calendar -->
          <div v-if="!bundle" class="py-8 text-center">
            <p class="font-fell text-muted-foreground italic">
              No setting bundle available for the current calendar.
            </p>
          </div>

          <template v-else>
            <!-- Bundle info -->
            <div class="rounded-lg border border-border bg-muted/30 px-4 py-3 flex flex-col gap-1.5">
              <div class="flex items-center justify-between">
                <span class="font-cinzel text-sm font-bold text-foreground">{{ bundle.name }}</span>
                <span class="font-cinzel text-xs text-muted-foreground">{{ bundle.events.length }} events</span>
              </div>
              <p class="text-body text-muted-foreground">{{ bundle.description }}</p>
            </div>

            <!-- Import progress / result -->
            <div v-if="importing || result" class="rounded-lg border border-border px-4 py-3">
              <div v-if="importing" class="flex items-center gap-3">
                <div class="h-4 w-4 rounded-full border-2 border-primary border-t-transparent animate-spin shrink-0" />
                <span class="text-body text-foreground">
                  Importing {{ imported }} / {{ bundle.events.length }} events…
                </span>
              </div>
              <div v-else-if="result === 'success'" class="flex items-center gap-2 text-green-500">
                <span class="font-cinzel text-sm font-semibold">✓ {{ imported }} events imported</span>
              </div>
              <div v-else-if="result === 'error'" class="text-destructive">
                <span class="font-cinzel text-sm font-semibold">Import failed — check console for details.</span>
              </div>
            </div>

            <!-- Duplicate warning -->
            <p class="text-caption text-muted-foreground italic -mt-2">
              Note: re-importing will create duplicate events. Delete existing setting events before re-importing if needed.
            </p>

            <!-- Event preview list -->
            <div class="flex flex-col gap-1">
              <p class="font-cinzel text-xs font-semibold tracking-widest text-muted-foreground mb-1">EVENTS INCLUDED</p>
              <div
                v-for="(event, i) in bundle.events"
                :key="i"
                class="flex items-start gap-3 rounded-md border border-border bg-muted/20 px-3 py-2.5"
              >
                <span
                  :style="{ backgroundColor: event.color }"
                  class="w-2 h-2 rounded-full shrink-0 mt-1.5"
                />
                <div class="flex-1 min-w-0">
                  <div class="flex items-center gap-2 flex-wrap">
                    <span class="font-cinzel text-xs font-semibold text-foreground">{{ event.title }}</span>
                    <span class="font-cinzel text-2xs text-muted-foreground">{{ event.harptos_year }} DR</span>
                  </div>
                  <p class="text-caption text-muted-foreground mt-0.5 line-clamp-2">
                    {{ event.description }}
                  </p>
                </div>
              </div>
            </div>
          </template>
        </div>

        <!-- Footer -->
        <div v-if="bundle" class="flex justify-end gap-2 px-5 py-4 border-t border-border shrink-0">
          <button
            type="button"
            class="px-4 py-2 text-label-lg font-semibold text-muted-foreground hover:text-foreground border border-border rounded-md transition-colors"
            @click="close"
          >
            {{ result === 'success' ? 'Close' : 'Cancel' }}
          </button>
          <button
            v-if="result !== 'success'"
            type="button"
            :disabled="importing"
            class="px-4 py-2 text-label-lg font-semibold bg-primary text-primary-foreground rounded-md hover:opacity-90 disabled:opacity-50 transition-opacity"
            @click="importAll"
          >
            {{ importing ? 'Importing…' : `Import All ${bundle.events.length} Events` }}
          </button>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { ref, computed } from "vue";
import { useCalendarStore } from "@/stores/calendar";
import { useCreateCalendarEvent } from "@/composables/useCalendarEvents";
import { SETTING_BUNDLES } from "@/data/bundles/index";
import type { BundleEvent } from "@/data/bundles/index";

const open = defineModel<boolean>({ required: true });

const calendar = useCalendarStore();
const createEvent = useCreateCalendarEvent();

const bundle = computed(() => SETTING_BUNDLES[calendar.activeCalendarId] ?? null);

const importing = ref(false);
const imported = ref(0);
const result = ref<"success" | "error" | null>(null);

function close() {
  if (importing.value) return;
  open.value = false;
  // Reset state after close animation
  setTimeout(() => {
    imported.value = 0;
    result.value = null;
  }, 300);
}

async function importAll() {
  if (!bundle.value || importing.value) return;
  importing.value = true;
  imported.value = 0;
  result.value = null;

  try {
    for (const event of bundle.value.events) {
      await createEvent.mutateAsync(buildInsert(event));
      imported.value++;
    }
    result.value = "success";
  } catch {
    result.value = "error";
  } finally {
    importing.value = false;
  }
}

function buildInsert(event: BundleEvent) {
  return {
    title: event.title,
    description: event.description,
    event_type: event.event_type,
    color: event.color,
    harptos_year: event.harptos_year,
    harptos_month: event.harptos_month,
    harptos_day: event.harptos_day,
    festival_day: event.festival_day,
    is_multi_day: event.is_multi_day,
    end_year: event.end_year,
    end_month: event.end_month,
    end_day: event.end_day,
    linked_quest_id: null,
    linked_encounter_id: null,
    linked_location_id: null,
    travel_party_member_ids: [],
    player_visible: false,
    campaign_id: null, // injected by composable
  };
}
</script>
