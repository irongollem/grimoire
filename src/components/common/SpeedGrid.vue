<template>
  <div class="grid grid-cols-5 gap-2">
    <div v-for="sp in SPEED_TYPES" :key="sp.key" class="flex flex-col items-center gap-1">
      <span class="text-label font-semibold text-muted-foreground">{{ sp.label }}</span>

      <!-- Fly: hover toggle embedded on the left edge -->
      <div
        v-if="sp.key === 'fly'"
        class="relative w-full rounded-md overflow-hidden border border-border bg-muted focus-within:ring-1 focus-within:ring-ring"
      >
        <button
          type="button"
          class="absolute inset-y-0 left-0 w-4 transition-colors flex items-center justify-center"
          :class="speed.hover && speed.fly ? 'bg-primary/70' : 'bg-border/50 hover:bg-border/80'"
          :title="!speed.fly
            ? 'Set a fly speed to enable hover'
            : speed.hover
              ? 'Hover on — click to disable'
              : 'Hover off — click to enable'"
          @click="toggleHover"
        >
          <IconWind
            class="w-2.5 h-2.5 shrink-0"
            :class="speed.hover && speed.fly ? 'text-primary-foreground' : 'text-muted-foreground/60'"
          />
        </button>
        <input
          :value="speed.fly ?? ''"
          type="number"
          step="5"
          min="0"
          placeholder="—"
          class="speed-input w-full bg-transparent pl-6 pr-8 py-1.5 font-fell text-sm text-foreground text-center placeholder:text-muted-foreground/40 focus:outline-none"
          @focus="($event.target as HTMLInputElement).select()"
          @input="setSpeed('fly', ($event.target as HTMLInputElement).value)"
        />
        <span class="absolute inset-y-0 right-1.5 flex items-center pointer-events-none font-cinzel text-2xs text-muted-foreground">ft.</span>
      </div>

      <!-- Other speeds -->
      <div v-else class="relative w-full">
        <input
          :value="(speed as Record<string, number | undefined>)[sp.key] ?? ''"
          type="number"
          step="5"
          min="0"
          placeholder="—"
          class="field-input speed-input w-full text-center"
          @focus="($event.target as HTMLInputElement).select()"
          @input="setSpeed(sp.key, ($event.target as HTMLInputElement).value)"
        />
        <span class="absolute inset-y-0 right-1.5 flex items-center pointer-events-none font-cinzel text-2xs text-muted-foreground">ft.</span>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { reactive, watch } from "vue";
import { IconWind } from "@/lib/icons";
import { parseSpeed, speedToString } from "@/lib/utils";
import type { SpeedBlock } from "@/lib/utils";

const SPEED_TYPES = [
  { key: "walk",   label: "Walk" },
  { key: "fly",    label: "Fly" },
  { key: "swim",   label: "Swim" },
  { key: "climb",  label: "Climb" },
  { key: "burrow", label: "Burrow" },
] as const;

const { modelValue } = defineProps<{
  modelValue: string;
}>();

const emit = defineEmits<{
  (e: "update:modelValue", value: string): void;
}>();

const speed = reactive<SpeedBlock>(parseSpeed(modelValue));

watch(
  () => modelValue,
  (next) => {
    const parsed = parseSpeed(next);
    if (speedToString(speed) === next) return;
    Object.assign(speed, { walk: undefined, fly: undefined, swim: undefined, climb: undefined, burrow: undefined, hover: false });
    Object.assign(speed, parsed);
  },
);

function setSpeed(key: string, raw: string) {
  const n = raw === "" ? undefined : Number(raw);
  (speed as Record<string, number | undefined | boolean>)[key] = n;
  if (key === "fly" && !n) speed.hover = false;
  emit("update:modelValue", speedToString(speed));
}

function toggleHover() {
  if (!speed.fly) return;
  speed.hover = !speed.hover;
  emit("update:modelValue", speedToString(speed));
}
</script>
