<template>
  <div
    v-if="!isNew"
    class="rounded-lg border border-border bg-card overflow-hidden"
  >
    <div class="px-3 py-2 border-b border-border bg-muted/20">
      <span class="font-cinzel text-xs font-semibold text-muted-foreground tracking-wider">
        Consequences
        <span v-if="triggers?.length" class="font-fell font-normal">({{ triggers.length }})</span>
      </span>
    </div>
    <div class="p-2 flex flex-col gap-1">
      <div
        v-for="trig in triggers"
        :key="trig.id"
        class="flex items-start gap-2 group rounded px-2 py-1.5 hover:bg-muted/40 transition-colors"
      >
        <IconLightning class="h-3.5 w-3.5 text-primary shrink-0 mt-0.5" />
        <div class="flex-1 min-w-0">
          <p class="font-fell text-xs text-foreground leading-snug">
            <span class="font-semibold">{{ trig.trigger_type === 'quest_complete' ? 'Quest complete' : `Objective done` }}</span>
            <span v-if="trig.objective_id" class="text-muted-foreground"> ({{ objectiveName(trig.objective_id) }})</span>
            <span class="text-muted-foreground"> + {{ trig.offset_days }}d →</span>
            {{ triggerActionSummary(trig) }}
          </p>
        </div>
        <button
          type="button"
          class="[@media(hover:hover)]:opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-destructive shrink-0"
          @click="emit('remove', trig)"
        >
          <IconClose class="h-3.5 w-3.5" />
        </button>
      </div>

      <!-- Add trigger form -->
      <div class="border-t border-border mt-1 pt-2 flex flex-col gap-2">
        <div class="grid grid-cols-2 gap-1.5">
          <select
            v-model="newTrigger.trigger_type"
            class="bg-background border border-border rounded px-2 py-1 font-cinzel text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-ring col-span-2"
            @change="newTrigger.objective_id = null"
          >
            <option value="quest_complete">When quest completes</option>
            <option value="objective_done">When objective is done</option>
          </select>
          <select
            v-if="newTrigger.trigger_type === 'objective_done'"
            v-model="newTrigger.objective_id"
            class="bg-background border border-border rounded px-2 py-1 font-cinzel text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-ring col-span-2"
          >
            <option :value="null">— pick objective —</option>
            <option v-for="obj in objectives" :key="obj.id" :value="obj.id">{{ obj.description }}</option>
          </select>
          <div class="flex items-center gap-1 col-span-2">
            <input
              v-model.number="newTrigger.offset_days"
              type="number"
              min="0"
              class="w-16 bg-background border border-border rounded px-2 py-1 font-fell text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
            />
            <span class="font-fell text-xs text-muted-foreground">days later →</span>
          </div>
          <select
            v-model="newTrigger.action_type"
            class="bg-background border border-border rounded px-2 py-1 font-cinzel text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-ring col-span-2"
          >
            <option value="create_calendar_event">Create calendar event</option>
            <option value="send_broadcast">Send broadcast</option>
          </select>
          <template v-if="newTrigger.action_type === 'create_calendar_event'">
            <input
              v-model="newTriggerCalTitle"
              placeholder="Event title…"
              class="bg-background border border-border rounded px-2 py-1 font-fell text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring col-span-2"
            />
            <select
              v-model="newTriggerCalType"
              class="bg-background border border-border rounded px-2 py-1 font-cinzel text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-ring col-span-2"
            >
              <option v-for="t in CALENDAR_EVENT_TYPES" :key="t" :value="t">{{ t }}</option>
            </select>
          </template>
          <template v-else>
            <input
              v-model="newTriggerMessage"
              placeholder="Broadcast message…"
              class="bg-background border border-border rounded px-2 py-1 font-fell text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring col-span-2"
            />
          </template>
        </div>
        <button
          type="button"
          :disabled="!canAddTrigger || adding"
          class="w-full rounded-md border border-dashed border-border px-3 py-1.5 font-cinzel text-xs text-muted-foreground hover:text-primary hover:border-primary transition-colors disabled:opacity-40"
          @click="addTrigger"
        >
          <IconAdd class="h-3 w-3 inline mr-1" />
          {{ adding ? 'Adding…' : 'Add Consequence' }}
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from "vue";
import { IconAdd, IconClose, IconLightning } from "@/lib/icons";
import { useCreateQuestTrigger } from "@/composables/useQuests";
import type { QuestObjective } from "@/types/quest.types";

const CALENDAR_EVENT_TYPES = [
  "quest", "world", "campaign", "discovery", "deadline",
  "player_death", "boss_fight", "npc_death", "travel",
  "encounter", "location", "festival", "session",
] as const;

const {
  isNew,
  questId,
  triggers,
  objectives,
} = defineProps<{
  isNew: boolean;
  questId: string;
  triggers: Array<{
    id: string;
    trigger_type: "quest_complete" | "objective_done";
    objective_id: string | null;
    offset_days: number;
    action_type: string;
    action_payload: unknown;
  }> | undefined;
  objectives: QuestObjective[] | undefined;
}>();

const emit = defineEmits<{
  remove: [trig: { id: string }];
}>();

const { mutateAsync: createTrigger } = useCreateQuestTrigger();

const newTrigger = ref<{
  trigger_type: "quest_complete" | "objective_done";
  objective_id: string | null;
  offset_days: number;
  action_type: "create_calendar_event" | "send_broadcast";
}>({ trigger_type: "quest_complete", objective_id: null, offset_days: 0, action_type: "create_calendar_event" });

const newTriggerCalTitle = ref("");
const newTriggerCalType = ref<string>("quest");
const newTriggerMessage = ref("");
const adding = ref(false);

const canAddTrigger = computed(() => {
  if (newTrigger.value.trigger_type === "objective_done" && !newTrigger.value.objective_id) return false;
  if (newTrigger.value.action_type === "create_calendar_event") return !!newTriggerCalTitle.value.trim();
  return !!newTriggerMessage.value.trim();
});

function objectiveName(objectiveId: string): string {
  return (objectives ?? []).find((o) => o.id === objectiveId)?.description ?? objectiveId;
}

function triggerActionSummary(trig: { action_type: string; action_payload: unknown }): string {
  if (trig.action_type === "create_calendar_event") {
    const p = trig.action_payload as { title?: string };
    return `Calendar event: "${p.title ?? ""}"`;
  }
  const p = trig.action_payload as { message?: string };
  return `Broadcast: "${p.message ?? ""}"`;
}

async function addTrigger() {
  if (!questId || !canAddTrigger.value) return;
  adding.value = true;
  try {
    const payload = newTrigger.value.action_type === "create_calendar_event"
      ? { title: newTriggerCalTitle.value.trim(), event_type: newTriggerCalType.value }
      : { message: newTriggerMessage.value.trim() };
    await createTrigger({
      quest_id: questId,
      objective_id: newTrigger.value.objective_id,
      trigger_type: newTrigger.value.trigger_type,
      offset_days: newTrigger.value.offset_days,
      action_type: newTrigger.value.action_type,
      action_payload: payload,
    });
    newTriggerCalTitle.value = "";
    newTriggerMessage.value = "";
  } finally {
    adding.value = false;
  }
}
</script>
