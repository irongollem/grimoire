<template>
  <AppButton
    v-if="auth.isDM"
    ref="btn"
    :variant="store.open ? 'tinted' : 'subtle'"
    tone="primary"
    emphasis="soft"
    :size="size"
    :icon="IconNote"
    aria-label="DM notes"
    :aria-pressed="store.open"
    :tooltip="`DM notes (${hotkey})`"
    data-test="scratchpad-toggle"
    @click="toggle"
  >
    <span v-if="!iconOnly">DM notes</span>
  </AppButton>
</template>

<script setup lang="ts">
import { ref } from "vue";
import AppButton from "@/components/common/AppButton.vue";
import type { ButtonSize } from "@/components/common/appButtonVariants";
import { formatCombo, isMacPlatform } from "@/lib/hotkeys";
import { IconNote } from "@/lib/icons";
import { useAuthStore } from "@/stores/auth";
import { useScratchpadStore } from "@/stores/scratchpad";

const { iconOnly = true, size = "sm" } = defineProps<{
  iconOnly?: boolean;
  size?: ButtonSize;
}>();

const auth = useAuthStore();
const store = useScratchpadStore();
const btn = ref<InstanceType<typeof AppButton> | null>(null);
const hotkey = formatCombo("mod+;", isMacPlatform());

/** Hands the panel this button's rect so it can fly out of here; a missing node is still a toggle. */
function toggle() {
  const el = btn.value?.$el as HTMLElement | undefined;
  const r = el?.getBoundingClientRect();
  store.toggle(r ? { top: r.top, left: r.left, width: r.width, height: r.height } : undefined);
}
</script>
