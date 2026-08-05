<template>
  <div class="rounded-lg border border-border bg-card overflow-hidden">
    <div class="px-3 py-2 border-b border-border bg-muted/20 flex items-center justify-between">
      <span class="text-label-lg font-semibold text-muted-foreground">
        Events
        <span v-if="localEvents.length" class="font-fell font-normal">({{ localEvents.length }})</span>
      </span>
      <button
        type="button"
        class="inline-flex items-center gap-1 font-cinzel text-xs text-primary hover:opacity-80 transition-opacity"
        @click="showEventForm = !showEventForm; editingEventId = null"
      >
        <IconAdd class="h-3.5 w-3.5" />
        Add
      </button>
    </div>

    <div class="p-3 flex flex-col gap-2">
      <template v-for="event in localEvents" :key="event.id">

        <!-- Inline edit form -->
        <div v-if="editingEventId === event.id" class="flex flex-col gap-2 rounded-md border border-primary/30 bg-primary/5 p-3">
          <input v-model="editEventData.name" type="text" placeholder="Event name…" class="w-full bg-card border border-border rounded px-2 py-1.5 text-body text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring" />
          <div class="flex flex-col gap-1">
            <label class="text-label font-semibold text-muted-foreground">TRIGGER</label>
            <select v-model="editEventData.triggerType" class="w-full bg-card border border-border rounded px-2 py-1.5 text-body text-foreground focus:outline-none focus:ring-1 focus:ring-ring">
              <option value="round_start">Round Start</option>
              <option value="combatant_hp_pct">HP Threshold</option>
              <option value="combatant_dies">On Death</option>
              <option value="manual">Manual Only</option>
            </select>
            <input v-if="editEventData.triggerType === 'round_start'" v-model.number="editEventData.round" type="number" min="1" placeholder="Round number" class="w-full bg-card border border-border rounded px-2 py-1.5 text-body text-foreground focus:outline-none focus:ring-1 focus:ring-ring" />
            <template v-if="editEventData.triggerType === 'combatant_hp_pct' || editEventData.triggerType === 'combatant_dies'">
              <EntityCombobox
                :model-value="editEventData.combatant_def_id"
                :options="monsterCombatantOptions"
                placeholder="— select combatant —"
                @update:model-value="editEventData.combatant_def_id = $event"
              />
              <div v-if="editEventData.triggerType === 'combatant_hp_pct'" class="flex items-center gap-2">
                <input v-model.number="editEventData.pct" type="number" min="1" max="99" class="w-20 bg-card border border-border rounded px-2 py-1.5 text-body text-foreground focus:outline-none focus:ring-1 focus:ring-ring" />
                <span class="font-cinzel text-xs text-muted-foreground">% HP or below</span>
              </div>
            </template>
          </div>
          <div class="flex flex-col gap-1">
            <label class="text-label font-semibold text-muted-foreground">ACTION</label>
            <select v-model="editEventData.actionType" class="w-full bg-card border border-border rounded px-2 py-1.5 text-body text-foreground focus:outline-none focus:ring-1 focus:ring-ring">
              <option value="spawn_combatants">Spawn Combatants</option>
              <option value="broadcast_message">Broadcast Message</option>
            </select>
            <template v-if="editEventData.actionType === 'spawn_combatants'">
              <EntityCombobox
                :model-value="editEventData.spawnMonster"
                :options="props.monsters"
                placeholder="— select monster —"
                @update:model-value="editEventData.spawnMonster = $event"
              />
              <div class="flex items-center gap-2">
                <div class="flex items-center gap-1">
                  <button type="button" class="w-6 h-6 rounded bg-card border border-border flex items-center justify-center text-muted-foreground hover:text-foreground" @click="editEventData.spawnCount = Math.max(1, editEventData.spawnCount - 1)"><IconMinus class="h-3 w-3" /></button>
                  <span class="font-cinzel text-sm font-bold w-6 text-center">{{ editEventData.spawnCount }}</span>
                  <button type="button" class="w-6 h-6 rounded bg-card border border-border flex items-center justify-center text-muted-foreground hover:text-foreground" @click="editEventData.spawnCount = Math.min(20, editEventData.spawnCount + 1)"><IconAdd class="h-3 w-3" /></button>
                </div>
                <EntityCombobox
                  :model-value="editEventData.spawnFaction"
                  :options="props.factions"
                  placeholder="Faction…"
                  @update:model-value="editEventData.spawnFaction = $event"
                />
              </div>
            </template>
            <input v-if="editEventData.actionType === 'broadcast_message'" v-model="editEventData.message" type="text" placeholder="Message to broadcast…" class="w-full bg-card border border-border rounded px-2 py-1.5 text-body text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring" />
          </div>
          <div class="flex items-center gap-3">
            <label class="flex items-center gap-1.5 cursor-pointer">
              <input v-model="editEventData.fire_once" type="checkbox" class="rounded border-border" />
              <span class="font-cinzel text-xs text-muted-foreground">Fire once</span>
            </label>
            <label class="flex items-center gap-1.5 cursor-pointer">
              <input v-model="editEventData.is_player_visible" type="checkbox" class="rounded border-border" />
              <span class="font-cinzel text-xs text-muted-foreground">Show to players</span>
            </label>
          </div>
          <p v-if="editEventError" class="text-caption text-destructive">{{ editEventError }}</p>
          <div class="flex gap-2 justify-end pt-1">
            <button type="button" class="font-cinzel text-xs text-muted-foreground hover:text-foreground transition-colors px-3 py-1.5" @click="cancelEditEvent">Cancel</button>
            <button type="button" class="font-cinzel text-xs font-semibold text-primary-foreground bg-primary px-3 py-1.5 rounded hover:opacity-90 transition-opacity" @click="saveEditEvent">Save</button>
          </div>
        </div>

        <!-- Summary row -->
        <div v-else class="flex items-center gap-1.5 rounded-md border border-border bg-muted/30 px-2.5 py-2">
          <div class="flex-1 min-w-0">
            <div class="font-cinzel text-xs font-semibold text-foreground truncate">{{ event.name }}</div>
            <div class="text-caption text-muted-foreground mt-0.5 truncate">{{ eventSummary(event) }}</div>
          </div>
          <span v-if="!event.fire_once" class="shrink-0 font-cinzel text-2xs px-1 py-0.5 rounded bg-primary/10 text-primary" title="Repeating">∞</span>
          <button
            type="button"
            class="shrink-0 transition-colors"
            :class="event.is_player_visible ? 'text-primary' : 'text-muted-foreground hover:text-foreground'"
            :title="event.is_player_visible ? 'Visible to players' : 'Hidden from players'"
            @click="toggleVisibility(event)"
          >
            <IconReveal v-if="event.is_player_visible" class="h-3.5 w-3.5" />
            <IconHide v-else class="h-3.5 w-3.5" />
          </button>
          <button type="button" class="shrink-0 text-muted-foreground hover:text-foreground transition-colors" title="Edit" @click="startEditEvent(event)">
            <IconEdit class="h-3.5 w-3.5" />
          </button>
          <button type="button" class="shrink-0 text-muted-foreground hover:text-destructive transition-colors" @click="removeEvent(event.id)">
            <IconClose class="h-3.5 w-3.5" />
          </button>
        </div>

      </template>

      <p v-if="!localEvents.length && !showEventForm" class="text-caption text-muted-foreground italic px-1 py-0.5">
        No events configured.
      </p>

      <!-- Add event form -->
      <div v-if="showEventForm" class="flex flex-col gap-2 rounded-md border border-primary/30 bg-primary/5 p-3">
        <input v-model="newEvent.name" type="text" placeholder="Event name…" class="w-full bg-card border border-border rounded px-2 py-1.5 text-body text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring" />
        <div class="flex flex-col gap-1">
          <label class="text-label font-semibold text-muted-foreground">TRIGGER</label>
          <select v-model="newEvent.triggerType" class="w-full bg-card border border-border rounded px-2 py-1.5 text-body text-foreground focus:outline-none focus:ring-1 focus:ring-ring">
            <option value="round_start">Round Start</option>
            <option value="combatant_hp_pct">HP Threshold</option>
            <option value="combatant_dies">On Death</option>
            <option value="manual">Manual Only</option>
          </select>
          <input v-if="newEvent.triggerType === 'round_start'" v-model.number="newEvent.round" type="number" min="1" placeholder="Round number" class="w-full bg-card border border-border rounded px-2 py-1.5 text-body text-foreground focus:outline-none focus:ring-1 focus:ring-ring" />
          <template v-if="newEvent.triggerType === 'combatant_hp_pct' || newEvent.triggerType === 'combatant_dies'">
            <EntityCombobox
              :model-value="newEvent.combatant_def_id"
              :options="monsterCombatantOptions"
              placeholder="— select combatant —"
              @update:model-value="newEvent.combatant_def_id = $event"
            />
            <div v-if="newEvent.triggerType === 'combatant_hp_pct'" class="flex items-center gap-2">
              <input v-model.number="newEvent.pct" type="number" min="1" max="99" class="w-20 bg-card border border-border rounded px-2 py-1.5 text-body text-foreground focus:outline-none focus:ring-1 focus:ring-ring" />
              <span class="font-cinzel text-xs text-muted-foreground">% HP or below</span>
            </div>
          </template>
        </div>
        <div class="flex flex-col gap-1">
          <label class="text-label font-semibold text-muted-foreground">ACTION</label>
          <select v-model="newEvent.actionType" class="w-full bg-card border border-border rounded px-2 py-1.5 text-body text-foreground focus:outline-none focus:ring-1 focus:ring-ring">
            <option value="spawn_combatants">Spawn Combatants</option>
            <option value="broadcast_message">Broadcast Message</option>
          </select>
          <template v-if="newEvent.actionType === 'spawn_combatants'">
            <EntityCombobox
              :model-value="newEvent.spawnMonster"
              :options="props.monsters"
              placeholder="— select monster —"
              @update:model-value="newEvent.spawnMonster = $event"
            />
            <div class="flex items-center gap-2">
              <div class="flex items-center gap-1">
                <button type="button" class="w-6 h-6 rounded bg-card border border-border flex items-center justify-center text-muted-foreground hover:text-foreground" @click="newEvent.spawnCount = Math.max(1, newEvent.spawnCount - 1)"><IconMinus class="h-3 w-3" /></button>
                <span class="font-cinzel text-sm font-bold w-6 text-center">{{ newEvent.spawnCount }}</span>
                <button type="button" class="w-6 h-6 rounded bg-card border border-border flex items-center justify-center text-muted-foreground hover:text-foreground" @click="newEvent.spawnCount = Math.min(20, newEvent.spawnCount + 1)"><IconAdd class="h-3 w-3" /></button>
              </div>
              <EntityCombobox
                :model-value="newEvent.spawnFaction"
                :options="props.factions"
                placeholder="Faction…"
                @update:model-value="newEvent.spawnFaction = $event"
              />
            </div>
          </template>
          <input v-if="newEvent.actionType === 'broadcast_message'" v-model="newEvent.message" type="text" placeholder="Message to broadcast to players…" class="w-full bg-card border border-border rounded px-2 py-1.5 text-body text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring" />
        </div>
        <div class="flex items-center gap-3">
          <label class="flex items-center gap-1.5 cursor-pointer">
            <input v-model="newEvent.fire_once" type="checkbox" class="rounded border-border" />
            <span class="font-cinzel text-xs text-muted-foreground">Fire once</span>
          </label>
          <label class="flex items-center gap-1.5 cursor-pointer">
            <input v-model="newEvent.is_player_visible" type="checkbox" class="rounded border-border" />
            <span class="font-cinzel text-xs text-muted-foreground">Show to players</span>
          </label>
        </div>
        <p v-if="eventFormError" class="text-caption text-destructive">{{ eventFormError }}</p>
        <div class="flex gap-2 justify-end pt-1">
          <button type="button" class="font-cinzel text-xs text-muted-foreground hover:text-foreground transition-colors px-3 py-1.5" @click="showEventForm = false; eventFormError = ''">Cancel</button>
          <button type="button" class="font-cinzel text-xs font-semibold text-primary-foreground bg-primary px-3 py-1.5 rounded hover:opacity-90 transition-opacity" @click="addEvent">Add Event</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch } from "vue";
import { IconAdd, IconClose, IconEdit, IconHide, IconMinus, IconReveal } from '@/lib/icons';
import EntityCombobox from "@/components/common/EntityCombobox.vue";
import type {
  CombatantDef,
  FactionDef,
  EncounterEvent,
  EventTrigger,
  EventAction,
} from "@/types/encounter.types";
import type { Monster } from "@/types/monster.types";
import type { Npc } from "@/types/npc.types";

const events = defineModel<EncounterEvent[]>("events", { required: true });
const props = defineProps<{
  combatants: CombatantDef[];
  monsters: Monster[];
  /** Needed only to name NPC spawns in an event's summary line. This editor
   *  cannot author one — NPC reinforcements come from the runner's
   *  complication generator (#604) — but it does have to describe them
   *  honestly once they exist on the encounter. */
  npcs: Npc[];
  factions: FactionDef[];
}>();

const localEvents = ref<EncounterEvent[]>(events.value.map((e) => ({ ...e })));

watch(events, (next) => {
  const nextIds = next.map((e) => e.id).join(",");
  const localIds = localEvents.value.map((e) => e.id).join(",");
  if (nextIds !== localIds) {
    localEvents.value = next.map((e) => ({ ...e }));
  }
});

function emitEvents() {
  events.value = localEvents.value.map((e) => ({ ...e }));
}

// Monster map for combatantLabel
const monsterMap = computed(() => new Map(props.monsters.map((m) => [m.id, m])));

function monsterName(monsterId: string | null): string {
  if (!monsterId) return "Unknown";
  return monsterMap.value.get(monsterId)?.name ?? "Unknown";
}

const npcMap = computed(() => new Map(props.npcs.map((n) => [n.id, n])));

function npcName(npcId: string | null): string {
  if (!npcId) return "Unknown";
  return npcMap.value.get(npcId)?.name ?? "Unknown";
}

function combatantLabel(entry: CombatantDef): string {
  return entry.custom_name || monsterName(entry.monster_id);
}

// Only monster combatants are relevant for triggers
const monsterCombatants = computed(() =>
  props.combatants.filter((c) => c.monster_id),
);

const monsterCombatantOptions = computed(() =>
  monsterCombatants.value.map((c) => ({ id: c.id, name: combatantLabel(c) })),
);

function combatantLabelById(defId: string): string {
  const entry = props.combatants.find((c) => c.id === defId);
  if (!entry) return "?";
  return combatantLabel(entry);
}

function eventSummary(event: EncounterEvent): string {
  const t = event.trigger;
  let trigStr = "";
  if (t.type === "round_start") trigStr = `Round ${t.round} start`;
  else if (t.type === "combatant_hp_pct") {
    const name = combatantLabelById(t.combatant_def_id);
    trigStr = `${name} HP ≤ ${t.pct}%`;
  } else if (t.type === "combatant_dies") {
    const name = combatantLabelById(t.combatant_def_id);
    trigStr = `${name} dies`;
  } else trigStr = "Manual";

  const acts = event.actions
    .map((a) => {
      if (a.type === "spawn_combatants") {
        return a.spawns
          .map((s) => `Spawn ${s.count}× ${s.kind === "npc" ? npcName(s.monster_id) : monsterName(s.monster_id)}`)
          .join(", ");
      }
      if (a.type === "environment_effect") return `Hazard: ${a.label}`;
      return `Broadcast: "${a.message}"`;
    })
    .join("; ");

  return `${trigStr} → ${acts}`;
}

function toggleVisibility(event: EncounterEvent) {
  const idx = localEvents.value.findIndex((e) => e.id === event.id);
  if (idx >= 0) {
    localEvents.value[idx] = {
      ...localEvents.value[idx],
      is_player_visible: !localEvents.value[idx].is_player_visible,
    };
    emitEvents();
  }
}

function removeEvent(id: string) {
  const idx = localEvents.value.findIndex((e) => e.id === id);
  if (idx >= 0) {
    localEvents.value.splice(idx, 1);
    emitEvents();
  }
}

// Add event form
const showEventForm = ref(false);
const eventFormError = ref("");
const newEvent = ref({
  name: "",
  triggerType: "round_start" as "round_start" | "combatant_hp_pct" | "combatant_dies" | "manual",
  round: 2,
  combatant_def_id: "",
  pct: 50,
  actionType: "spawn_combatants" as "spawn_combatants" | "broadcast_message",
  message: "",
  spawnMonster: "",
  spawnCount: 1,
  spawnFaction: "enemy",
  fire_once: true,
  is_player_visible: false,
});

function buildTrigger(
  data: typeof newEvent.value,
  errorRef: { value: string },
): EventTrigger | null {
  if (data.triggerType === "round_start") {
    return { type: "round_start", round: data.round };
  } else if (data.triggerType === "combatant_hp_pct") {
    if (!data.combatant_def_id) {
      errorRef.value = "Select a combatant for the HP trigger.";
      return null;
    }
    return { type: "combatant_hp_pct", combatant_def_id: data.combatant_def_id, pct: data.pct };
  } else if (data.triggerType === "combatant_dies") {
    if (!data.combatant_def_id) {
      errorRef.value = "Select a combatant for the On Death trigger.";
      return null;
    }
    return { type: "combatant_dies", combatant_def_id: data.combatant_def_id };
  } else {
    return { type: "manual" };
  }
}

function buildActions(
  data: typeof newEvent.value,
  errorRef: { value: string },
): EventAction[] | null {
  if (data.actionType === "spawn_combatants") {
    if (!data.spawnMonster) {
      errorRef.value = "Select a monster to spawn.";
      return null;
    }
    return [
      {
        type: "spawn_combatants",
        spawns: [{ monster_id: data.spawnMonster, count: data.spawnCount, faction_id: data.spawnFaction }],
      },
    ];
  } else {
    if (!data.message.trim()) {
      errorRef.value = "Broadcast message cannot be empty.";
      return null;
    }
    return [{ type: "broadcast_message", message: data.message }];
  }
}

function addEvent() {
  const t = newEvent.value;
  eventFormError.value = "";
  if (!t.name.trim()) {
    eventFormError.value = "Event name is required.";
    return;
  }
  const trigger = buildTrigger(t, eventFormError);
  if (!trigger) return;
  const actions = buildActions(t, eventFormError);
  if (!actions) return;

  localEvents.value.push({
    id: crypto.randomUUID(),
    name: t.name.trim(),
    trigger,
    actions,
    fire_once: t.fire_once,
    is_player_visible: t.is_player_visible,
  });
  emitEvents();

  Object.assign(newEvent.value, {
    name: "",
    triggerType: "round_start",
    round: 2,
    combatant_def_id: "",
    pct: 50,
    actionType: "spawn_combatants",
    message: "",
    spawnMonster: "",
    spawnCount: 1,
    spawnFaction: "enemy",
    fire_once: true,
    is_player_visible: false,
  });
  showEventForm.value = false;
}

// Edit event
const editingEventId = ref<string | null>(null);
const editEventError = ref("");
const editEventData = ref({
  name: "",
  triggerType: "round_start" as "round_start" | "combatant_hp_pct" | "combatant_dies" | "manual",
  round: 2,
  combatant_def_id: "",
  pct: 50,
  actionType: "spawn_combatants" as "spawn_combatants" | "broadcast_message",
  message: "",
  spawnMonster: "",
  spawnCount: 1,
  spawnFaction: "enemy",
  fire_once: true,
  is_player_visible: false,
});

function startEditEvent(event: EncounterEvent) {
  const t = event.trigger;
  const a = event.actions[0];
  editEventData.value = {
    name: event.name,
    triggerType: t.type as typeof editEventData.value.triggerType,
    round: t.type === "round_start" ? t.round : 2,
    combatant_def_id: (t as { combatant_def_id?: string }).combatant_def_id ?? "",
    pct: t.type === "combatant_hp_pct" ? t.pct : 50,
    actionType: (a?.type ?? "spawn_combatants") as typeof editEventData.value.actionType,
    message: a?.type === "broadcast_message" ? a.message : "",
    spawnMonster: a?.type === "spawn_combatants" ? (a.spawns[0]?.monster_id ?? "") : "",
    spawnCount: a?.type === "spawn_combatants" ? (a.spawns[0]?.count ?? 1) : 1,
    spawnFaction: a?.type === "spawn_combatants" ? (a.spawns[0]?.faction_id ?? "enemy") : "enemy",
    fire_once: event.fire_once,
    is_player_visible: event.is_player_visible ?? false,
  };
  editingEventId.value = event.id;
  editEventError.value = "";
  showEventForm.value = false;
}

function cancelEditEvent() {
  editingEventId.value = null;
  editEventError.value = "";
}

function saveEditEvent() {
  const t = editEventData.value;
  editEventError.value = "";
  if (!t.name.trim()) {
    editEventError.value = "Event name is required.";
    return;
  }
  const trigger = buildTrigger(t, editEventError);
  if (!trigger) return;
  const actions = buildActions(t, editEventError);
  if (!actions) return;

  const idx = localEvents.value.findIndex((e) => e.id === editingEventId.value);
  if (idx >= 0) {
    localEvents.value[idx] = {
      id: editingEventId.value!,
      name: t.name.trim(),
      trigger,
      actions,
      fire_once: t.fire_once,
      is_player_visible: t.is_player_visible,
    };
    emitEvents();
  }
  editingEventId.value = null;
}
</script>
