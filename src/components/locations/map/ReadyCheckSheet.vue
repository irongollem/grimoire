<template>
  <Teleport to="body">
    <Transition name="ready-sheet">
      <div v-if="open" class="fixed inset-0 flex justify-end" :style="zIndex === null ? undefined : { zIndex }" role="dialog" aria-modal="true" aria-labelledby="ready-title">
        <!-- The map dims behind the sheet; a click on it is Back to the map. -->
        <div class="ready-dim absolute inset-0 bg-black/55" @click="close" />

        <aside ref="panelRef" tabindex="-1" data-slip class="ready-panel relative flex h-full w-full max-w-140 flex-col border-l border-border bg-card shadow-lg focus:outline-none" @keydown.tab="onTab">
          <header class="flex shrink-0 items-start gap-3 border-b border-border px-5 pt-4 pb-3">
            <div class="min-w-0 flex-1">
              <p class="truncate text-eyebrow font-semibold text-muted-foreground">{{ mapName }}</p>
              <h2 id="ready-title" class="text-heading font-bold text-foreground">Ready for the table</h2>
              <p class="mt-0.5 text-caption text-muted-foreground">
                Nothing here stops you. Gaps are named so you know what the players will meet.
              </p>
            </div>
            <AppButton variant="ghost" size="icon-xs" :icon="IconClose" tooltip="Close" aria-label="Close" @click="close" />
          </header>

          <div class="min-h-0 flex-1 overflow-y-auto px-5 py-3">
            <ul class="flex flex-col divide-y divide-border">
              <li v-for="row in rows" :key="row.id" class="flex flex-col gap-1.5 py-2.5" :data-row="row.id">
                <div class="flex items-start gap-3">
                  <component
                    :is="STATUS_ICON[row.status]"
                    class="mt-0.5 h-4 w-4 shrink-0"
                    :class="STATUS_TONE[row.status]"
                    :aria-label="STATUS_WORD[row.status]"
                    role="img"
                  />
                  <div class="min-w-0 flex-1">
                    <p class="text-label-lg font-semibold text-foreground">{{ row.label }}</p>
                    <p class="text-caption text-muted-foreground">{{ row.detail }}</p>
                  </div>
                  <div v-if="row.fixes.length" class="flex shrink-0 flex-col items-end gap-1">
                    <AppButton
                      v-for="fix in row.fixes"
                      :key="fix.subject ?? fix.label"
                      variant="outline"
                      size="xs"
                      :label="fix.label"
                      :aria-label="fix.subject ? `${fix.label}: ${fix.subject}` : fix.label"
                      @click="onFix(fix.action)"
                    />
                  </div>
                </div>
                <!-- Light is changed right here: the Map menu's Light is the same three words. -->
                <SegmentedControl
                  v-if="row.id === 'light' && lightOpen"
                  class="ml-7"
                  size="xs"
                  v-model="darkness"
                  :options="DARKNESS_OPTIONS"
                />
              </li>
            </ul>

            <h3 class="mt-4 mb-2 text-eyebrow font-semibold text-muted-foreground">Play it</h3>
            <div role="radiogroup" aria-label="How to play it" class="flex flex-col gap-2">
              <label
                v-for="option in PLAY_OPTIONS"
                :key="option.id"
                class="flex cursor-pointer items-start gap-3 rounded-md border bg-card px-3 py-2.5 has-[:checked]:border-primary has-[:checked]:bg-primary/5 has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring"
                :class="choice === option.id ? 'border-primary' : 'border-border'"
              >
                <input v-model="choice" type="radio" name="play-it" :value="option.id" class="sr-only" />
                <component :is="option.icon" class="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                <span class="min-w-0 flex-1">
                  <span class="block text-label-lg font-semibold text-foreground">{{ option.label }}</span>
                  <span class="block text-caption text-muted-foreground">{{ captionFor(option.id) }}</span>
                  <EntityCombobox
                    v-if="option.id === 'fight' && choice === 'fight'"
                    v-model="encounterId"
                    class="mt-2"
                    :options="encounterOptions"
                    placeholder="Pick an encounter"
                    @click.stop
                  />
                </span>
              </label>
            </div>
          </div>

          <footer class="flex shrink-0 items-center justify-end gap-2 border-t border-border px-5 py-3">
            <AppButton variant="ghost" size="sm" label="Back to the map" @click="close" />
            <AppButton variant="primary" size="sm" :loading="starting" :label="primaryLabel" @click="start" />
          </footer>
        </aside>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup lang="ts">
/**
 * "Ready for the table" (#1125 decision 16, frame 08): the editor's Ready button
 * dims the map and slides this sheet in. It names what the table will meet, one
 * row per thing with its fix beside it, then asks how to play. It stops
 * nothing: every gap is a sentence, never a lock.
 *
 * The fixes that need the editor are handed back as `fix` events (the host wires
 * each to the workbench); Light is changed inline, and the play choice leaves
 * through the router.
 */
import { computed, nextTick, ref, watch, type Component } from "vue";
import { useRouter } from "vue-router";
import AppButton from "@/components/common/controls/AppButton.vue";
import EntityCombobox from "@/components/common/controls/EntityCombobox.vue";
import SegmentedControl, { type SegmentedOption } from "@/components/common/controls/SegmentedControl.vue";
import { trapTab } from "@/components/common/overlays/focusTrap";
import { useModalStack } from "@/components/common/overlays/modalStack";
import { useEncounters } from "@/composables/encounters/useEncounters";
import { useStartFight } from "@/composables/encounters/useStartFight";
import { useHotkeys } from "@/composables/useHotkeys";
import { IconCheck, IconClose, IconEncounter, IconMap, IconMinus, IconReveal, IconWarning } from "@/lib/icons";
import type { ReadyFixAction, ReadyRow, ReadyStatus } from "@/lib/locations/playReadiness";
import { pluralizeCount } from "@/lib/utils";
import type { DarknessLevel } from "@/types/dungeonMap.types";

const open = defineModel<boolean>("open", { required: true });
const darkness = defineModel<DarknessLevel>("darkness", { required: true });

const { rows, mapName, siteId, siteName, roomIds, firstRoomName } = defineProps<{
  rows: ReadyRow[];
  mapName: string;
  siteId: string;
  siteName: string;
  /** The site's rooms, so a fight staged in one of them is offered too. */
  roomIds: string[];
  firstRoomName: string | null;
}>();

const emit = defineEmits<{ fix: [action: ReadyFixAction] }>();

type PlayChoice = "fight" | "explore" | "show";

const STATUS_ICON: Record<ReadyStatus, Component> = { ok: IconCheck, gap: IconWarning, neutral: IconMinus };
const STATUS_TONE: Record<ReadyStatus, string> = { ok: "text-ink-success", gap: "text-ink-caution", neutral: "text-muted-foreground" };
const STATUS_WORD: Record<ReadyStatus, string> = { ok: "Ready", gap: "Needs a look", neutral: "Optional" };

const DARKNESS_OPTIONS: SegmentedOption<DarknessLevel>[] = [
  { value: "daylight", label: "Day", tooltip: "Daylight: bright light everywhere." },
  { value: "dim", label: "Dim", tooltip: "Dim light everywhere, as at twilight." },
  { value: "dark", label: "Dark", tooltip: "Darkness wherever no light reaches." },
];

const PLAY_OPTIONS: { id: PlayChoice; label: string; icon: Component }[] = [
  { id: "fight", label: "Fight here", icon: IconEncounter },
  { id: "explore", label: "Explore", icon: IconMap },
  { id: "show", label: "Just show it", icon: IconReveal },
];

const NEW_ENCOUNTER = "new";

const router = useRouter();
const { startFightAt, starting } = useStartFight();
const zIndex = useModalStack(() => open.value);

// Teleported to body, so Tab is kept inside by hand, focus moves in on open and goes back to what opened it on close.
const panelRef = ref<HTMLElement | null>(null);
let focusOnClose: HTMLElement | null = null;
function onTab(event: KeyboardEvent): void {
  trapTab(event, panelRef.value);
}
watch(
  open,
  async (isOpen) => {
    if (isOpen) {
      focusOnClose = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      await nextTick();
      panelRef.value?.focus();
    } else {
      focusOnClose?.focus();
      focusOnClose = null;
    }
  },
  { immediate: true },
);
useHotkeys(
  () => [{ combo: "escape", description: "Close the ready check", hidden: true, allowInTextEntry: true, handler: close }],
  { enabled: open, layer: "overlay" },
);

const choice = ref<PlayChoice>("fight");
const lightOpen = ref(false);
watch(open, (isOpen) => {
  if (!isOpen) lightOpen.value = false;
});

// ── Fight here ──────────────────────────────────────────────────────────────
const { data: allEncounters } = useEncounters();
const here = computed(() => {
  const ids = new Set([siteId, ...roomIds]);
  return (allEncounters.value ?? []).filter((e) => e.location_id !== null && ids.has(e.location_id) && !e.is_finished);
});
const encounterOptions = computed(() => [{ id: NEW_ENCOUNTER, name: "a new encounter" }, ...here.value.map((e) => ({ id: e.id, name: e.name }))]);
const encounterId = ref(NEW_ENCOUNTER);
const chosenEncounter = computed(() => here.value.find((e) => e.id === encounterId.value) ?? null);
// A staged fight is the likelier choice than starting a new one.
watch(here, (list) => {
  if (encounterId.value === NEW_ENCOUNTER && list.length > 0) encounterId.value = list[0]!.id;
}, { immediate: true });

function captionFor(id: PlayChoice): string {
  if (id === "explore") return "Run the site: the party walks room to room and the fog lifts as rooms are explored.";
  if (id === "show") return "Open the table screen with the map and no fight.";
  const where = firstRoomName ? `The party starts in ${firstRoomName}. ` : "";
  const foes = chosenEncounter.value ? chosenEncounter.value.combatants.length : 0;
  return foes > 0
    ? `${where}${pluralizeCount(foes, "foe waits", "foes wait")} in a tray for you to place, or scatter them in a room.`
    : `${where}Foes you add wait in a tray for you to place, or scatter them in a room.`;
}

const primaryLabel = computed(() => ({ fight: "Start the fight", explore: "Explore", show: "Show the table" })[choice.value]);

function close(): void {
  open.value = false;
}

function onFix(action: ReadyFixAction): void {
  if (action.kind === "light") {
    lightOpen.value = !lightOpen.value;
    return;
  }
  close();
  emit("fix", action);
}

async function start(): Promise<void> {
  if (choice.value === "explore") return void router.push(`/locations/${siteId}/explore`);
  if (choice.value === "show") return void router.push(`/locations/${siteId}/table`);
  if (chosenEncounter.value) return void router.push(`/encounters/${chosenEncounter.value.id}/run`);
  await startFightAt(siteId, `${siteName} fight`);
}
</script>

<style scoped>
.ready-sheet-enter-active,
.ready-sheet-leave-active {
  transition: opacity 0.26s ease;
}
.ready-sheet-enter-active .ready-panel,
.ready-sheet-leave-active .ready-panel {
  transition: transform 0.26s ease;
}
.ready-sheet-enter-from,
.ready-sheet-leave-to {
  opacity: 0;
}
.ready-sheet-enter-from .ready-panel,
.ready-sheet-leave-to .ready-panel {
  transform: translateX(100%);
}
@media (prefers-reduced-motion: reduce) {
  .ready-sheet-enter-active,
  .ready-sheet-leave-active,
  .ready-sheet-enter-active .ready-panel,
  .ready-sheet-leave-active .ready-panel {
    transition: none;
  }
}
</style>
