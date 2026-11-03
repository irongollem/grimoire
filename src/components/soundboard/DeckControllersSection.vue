<template>
  <section class="space-y-3" aria-label="Controllers">
    <span class="block text-heading-sm text-foreground">Controllers</span>

    <p v-if="midi.support.value === 'unsupported'" class="text-caption text-muted-foreground">
      Safari can't talk to MIDI controllers. Everything else on the soundboard works here. To play from a
      controller, open Grimoire in Chrome, Edge or Firefox.
    </p>

    <template v-else>
      <div v-if="midi.support.value !== 'granted'" class="space-y-1.5">
        <p class="text-caption text-muted-foreground">
          For the few who have one. Plug in a grid controller and it becomes the deck: the page you are on, lit
          pad for pad, with the tools down the side.
        </p>
        <p v-if="midi.support.value === 'denied'" class="text-caption text-destructive">
          {{ midi.error.value ?? "MIDI access was blocked." }}
          Allow MIDI for this site in your browser's site settings (the icon left of the address), then connect
          again.
        </p>
        <AppButton
          variant="subtle"
          size="sm"
          label="Connect a controller"
          :loading="midi.support.value === 'requesting'"
          @click="midi.connect()"
        />
      </div>

      <template v-else>
        <div
          v-for="pad in midi.launchpads.value"
          :key="pad.id"
          class="space-y-2.5 rounded-md border border-border bg-card p-3"
        >
          <div class="flex items-center justify-between gap-3">
            <span class="flex items-center gap-2 text-label-lg text-foreground">
              <span class="size-2 rounded-full bg-success" aria-hidden="true" />
              {{ pad.label }} · connected
            </span>
            <AppCheckbox
              label="Lights"
              :model-value="midi.lightsEnabled.value"
              @update:model-value="midi.setLightsEnabled"
            />
          </div>
          <dl class="grid grid-cols-[7rem_minmax(0,1fr)] gap-x-3 gap-y-1 text-caption">
            <template v-for="row in LEGEND" :key="row.term">
              <dt class="font-bold text-foreground">{{ row.term }}</dt>
              <dd class="text-muted-foreground">{{ row.text }}</dd>
            </template>
          </dl>
          <div class="space-y-1.5">
            <span class="block text-label-lg text-foreground">How hard you hit</span>
            <SegmentedControl
              :model-value="deck.velocityCurve.value"
              :options="CURVES"
              size="sm"
              @update:model-value="deck.setVelocityCurve"
            />
            <p class="text-caption text-muted-foreground">
              {{ CURVES.find((c) => c.value === deck.velocityCurve.value)?.hint }} Only pads set to "louder the
              harder you hit" listen.
            </p>
          </div>
        </div>
        <p v-if="midi.launchpads.value.length === 0" class="text-caption text-muted-foreground">
          No Launchpad found. Plug one in and it appears here. Lights work with the Launchpad Mini MK3, X and
          Pro MK3; velocity on the X and Pro, the Mini sends none.
        </p>

        <div class="space-y-2.5 rounded-md border border-border bg-card p-3">
          <span class="block text-label-lg text-foreground">Any other controller</span>
          <p class="text-caption text-muted-foreground">
            Teach any key or knob a job. Pick what it should do, then press the key or turn the knob.
            <template v-if="midi.otherInputs.value.length > 0">
              Seen: {{ midi.otherInputs.value.map((i) => i.name).join(", ") }}.
            </template>
          </p>

          <div v-if="midi.learning.value !== null" class="flex flex-wrap items-center gap-2">
            <span class="text-caption text-foreground">Press the key or turn the knob on your controller…</span>
            <AppButton variant="ghost" size="sm" label="Cancel" @click="midi.cancelLearn()" />
          </div>

          <div v-else-if="picking" class="flex flex-wrap items-end gap-2">
            <AppSelect v-model="kind" aria-label="What to learn">
              <option v-for="k in KINDS" :key="k.value" :value="k.value">{{ k.label }}</option>
            </AppSelect>
            <template v-if="kind === 'pad' || kind === 'padVolume'">
              <AppSelect v-model.number="lane" aria-label="Lane">
                <option v-for="n in DECK_LANES" :key="n" :value="n">Lane {{ n }}</option>
              </AppSelect>
              <AppSelect v-model.number="row" aria-label="Row">
                <option v-for="n in DECK_HARDWARE_ROWS" :key="n" :value="n">Row {{ n }}</option>
              </AppSelect>
            </template>
            <AppSelect v-if="kind === 'tool'" v-model="tool" aria-label="Tool">
              <option v-for="t in LEARNABLE_TOOLS" :key="t" :value="t">{{ t }}</option>
            </AppSelect>
            <AppButton variant="primary" size="sm" label="Start" @click="start" />
            <AppButton variant="ghost" size="sm" label="Back" @click="picking = false" />
          </div>

          <AppButton v-else variant="subtle" size="sm" label="Learn a control" @click="picking = true" />

          <p v-if="picking && (kind === 'master' || kind === 'padVolume')" class="text-caption text-muted-foreground">
            This one needs a knob or fader; a key cannot set a level.
          </p>

          <ul v-if="midi.bindings.value.length > 0" class="divide-y divide-border">
            <li
              v-for="b in midi.bindings.value"
              :key="`${b.deviceName}|${b.kind}|${b.channel}|${b.number}`"
              class="flex items-center gap-2.5 py-1.5 text-caption"
            >
              <KeyCap>{{ b.kind === "cc" ? "CC" : "Note" }} {{ b.number }}</KeyCap>
              <span class="min-w-0 flex-1 truncate text-foreground">{{ describeTarget(b.target) }}</span>
              <span class="shrink-0 text-muted-foreground">{{ b.deviceName }}</span>
              <AppButton variant="ghost" size="xs" label="Remove" @click="midi.removeBinding(b)" />
            </li>
          </ul>
        </div>

        <AppButton variant="ghost" size="sm" label="Disconnect controllers" @click="midi.disconnect()" />
      </template>
    </template>
  </section>
</template>

<script setup lang="ts">
import { ref } from "vue";
import AppButton from "@/components/common/controls/AppButton.vue";
import AppCheckbox from "@/components/common/controls/AppCheckbox.vue";
import AppSelect from "@/components/common/controls/AppSelect.vue";
import SegmentedControl, { type SegmentedOption } from "@/components/common/controls/SegmentedControl.vue";
import KeyCap from "@/components/soundboard/KeyCap.vue";
import { useDeck } from "@/composables/soundboard/useDeck";
import { useDeckMidiShared } from "@/composables/soundboard/useDeckMidiShared";
import type { VelocityCurve } from "@/lib/audio/deck/deckModel";
import { DECK_HARDWARE_ROWS, DECK_LANES, DECK_TOOLS, type DeckTool } from "@/lib/audio/deck/deckSurface";
import type { LearnTarget } from "@/lib/audio/deck/midi/midiLearn";

/**
 * The deck's controller settings (#1136, "Launchpad and controllers"). The
 * driver is the app's one shared instance; this only steers it. There is no
 * "Ignore it" velocity option: the deck has no such preference, and a pad only
 * listens to velocity when it is set to, which the hint says.
 */

const midi = useDeckMidiShared();
const deck = useDeck();

const LEGEND = [
  { term: "Grid", text: "The page you are on: its eight lanes across, rows down, exactly as you laid it out." },
  { term: "Top row", text: "Pages 1 to 8. The lit one is where you are." },
  { term: "Right column", text: "The tools. Hold one and press pads, or tap it to lock it on." },
  { term: "Extra buttons", text: "On a Pro: Stop all, and scrolling to pages 9 and up." },
] as const;

const CURVES = [
  { value: "gentle", label: "Gentle", hint: "Gentle forgives a heavy hand." },
  { value: "even", label: "Even", hint: "Even: twice as hard is twice as loud." },
  { value: "punchy", label: "Punchy", hint: "Punchy rewards a light touch." },
] as const satisfies readonly (SegmentedOption<VelocityCurve> & { hint: string })[];

type Kind = "pad" | "padVolume" | "tool" | "hush" | "fadeAll" | "pauseAll" | "stopAll" | "prev" | "next" | "master";

const KINDS: readonly { value: Kind; label: string }[] = [
  { value: "pad", label: "A pad" },
  { value: "tool", label: "A tool" },
  { value: "hush", label: "Hush" },
  { value: "fadeAll", label: "Fade all" },
  { value: "pauseAll", label: "Pause all" },
  { value: "stopAll", label: "Stop all" },
  { value: "prev", label: "Previous page" },
  { value: "next", label: "Next page" },
  { value: "master", label: "Master volume (a knob)" },
  { value: "padVolume", label: "A pad's volume (a knob)" },
];

// "play" is the resting state, not something to bind.
const LEARNABLE_TOOLS: readonly DeckTool[] = DECK_TOOLS.filter((t) => t !== "play");

const picking = ref(false);
const kind = ref<Kind>("pad");
const lane = ref(1);
const row = ref(1);
const tool = ref<DeckTool>("loop");

function targetFromPicker(): LearnTarget {
  switch (kind.value) {
    case "pad":
    case "padVolume":
      return { type: kind.value, lane: lane.value - 1, row: row.value - 1 };
    case "tool":
      return { type: "tool", tool: tool.value };
    case "prev":
      return { type: "pageStep", delta: -1 };
    case "next":
      return { type: "pageStep", delta: 1 };
    default:
      return { type: kind.value };
  }
}

function start() {
  midi.beginLearn(targetFromPicker());
  picking.value = false;
}

function describeTarget(t: LearnTarget): string {
  switch (t.type) {
    case "pad":
      return `Pad, lane ${t.lane + 1}, row ${t.row + 1}`;
    case "padVolume":
      return `Pad volume, lane ${t.lane + 1}, row ${t.row + 1}`;
    case "tool":
      return `Tool: ${t.tool}`;
    case "pageStep":
      return t.delta < 0 ? "Previous page" : "Next page";
    case "hush":
      return "Hush";
    case "fadeAll":
      return "Fade all";
    case "pauseAll":
      return "Pause all";
    case "stopAll":
      return "Stop all";
    case "master":
      return "Master volume";
  }
}
</script>
