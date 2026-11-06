<template>
  <div ref="anchorEl" class="inline-flex">
    <!-- Trigger: wand icon, lit gold while an effect is on. -->
    <AppButton
      :variant="modelValue !== 'none' ? 'tinted' : 'outline'"
      tone="primary"
      emphasis="soft"
      size="icon-sm"
      :icon="IconWand"
      :tooltip="triggerTitle"
      @click="toggle"
    />

    <!-- Picker panel — teleported to avoid widget overflow clipping -->
    <Teleport to="body">
      <Transition
        enter-active-class="transition-all duration-100 ease-out"
        leave-active-class="transition-all duration-75 ease-in"
        enter-from-class="opacity-0 scale-95"
        leave-to-class="opacity-0 scale-95"
      >
        <div
          v-if="open"
          :style="popupStyle"
          data-slip class="fixed z-9999 flex gap-1 bg-card border border-border rounded-lg p-1.5 shadow-xl"
          :class="openUpward ? 'origin-bottom-right' : 'origin-top-right'"
        >
          <AppButton
            v-for="opt in OPTIONS"
            :key="opt.value"
            :variant="modelValue === opt.value ? 'tinted' : 'ghost'"
            tone="primary"
            emphasis="strong"
            size="xs"
            :label="opt.label"
            class="whitespace-nowrap"
            @click.stop="pick(opt.value)"
          />
        </div>
      </Transition>
    </Teleport>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, nextTick, onUnmounted } from "vue";
import { IconWand } from "@/lib/icons";
import AppButton from "@/components/common/controls/AppButton.vue";
import type { AudioEffectPreset } from "@/types/sound.types";

const modelValue = defineModel<AudioEffectPreset>({ default: "none" });
/** What the effect applies to ("Master", "Music"), so a stack of pickers can be told apart. */
const { target } = defineProps<{ target?: string }>();

const OPTIONS = [
  { value: "none"         as AudioEffectPreset, label: "Off"     },
  { value: "through_door" as AudioEffectPreset, label: "Door"    },
  { value: "through_wall" as AudioEffectPreset, label: "Wall"    },
  { value: "distant"      as AudioEffectPreset, label: "Distant" },
  { value: "underwater"   as AudioEffectPreset, label: "Water"   },
  { value: "cave"         as AudioEffectPreset, label: "Cave"    },
  { value: "sewer"        as AudioEffectPreset, label: "Sewer"   },
] as const;

const anchorEl = ref<HTMLElement | null>(null);
const open = ref(false);
const openUpward = ref(true);
const popupStyle = ref<Record<string, string>>({});

const currentLabel = computed(
  () => OPTIONS.find((o) => o.value === modelValue.value)?.label ?? "Off",
);

const triggerTitle = computed(() => {
  const on = target === undefined ? "" : ` on ${target}`;
  return modelValue.value !== "none" ? `Effect${on}: ${currentLabel.value}. Click to change` : `Add audio effect${on === "" ? "" : ` to ${target}`}`;
});

function updatePosition() {
  const el = anchorEl.value;
  if (!el) return;
  const rect = el.getBoundingClientRect();
  const panelW = 300; // approximate panel width
  const panelH = 40;  // approximate panel height
  const spaceBelow = window.innerHeight - rect.bottom;
  openUpward.value = spaceBelow < panelH + 8 && rect.top > spaceBelow;

  if (openUpward.value) {
    popupStyle.value = {
      bottom: `${window.innerHeight - rect.top + 4}px`,
      right:  `${window.innerWidth - rect.right}px`,
    };
  } else {
    popupStyle.value = {
      top:   `${rect.bottom + 4}px`,
      right: `${window.innerWidth - rect.right}px`,
    };
  }
  // Clamp left edge so it doesn't run off-screen
  const leftCandidate = rect.right - panelW;
  if (leftCandidate < 8) {
    popupStyle.value.right = "auto";
    popupStyle.value.left  = "8px";
  }
}

let removeListener: (() => void) | null = null;

function closePicker() {
  open.value = false;
  removeListener?.();
  removeListener = null;
}

function toggle() {
  if (open.value) { closePicker(); return; }
  open.value = true;
  nextTick(updatePosition);
  setTimeout(() => {
    const handler = () => closePicker();
    document.addEventListener("click", handler, { once: true });
    removeListener = () => document.removeEventListener("click", handler);
  }, 0);
}

function pick(preset: AudioEffectPreset) {
  modelValue.value = preset;
  closePicker();
}

onUnmounted(() => { removeListener?.(); });
</script>
