<template>
  <section
    class="move-sheet"
    :class="[`state-${state}`, inline ? 'is-inline' : 'is-bottom']"
    data-slip
    role="group"
    aria-label="Confirm your move"
    data-testid="map-move-sheet"
  >
    <div class="head">
      <p class="ask">Move here?</p>
      <p class="feet" :aria-label="label" data-testid="map-move-feet">{{ feetText }}</p>
    </div>
    <div class="buttons">
      <AppButton variant="outline" size="lg" class="btn" label="Cancel" data-testid="map-move-cancel" @click="emit('cancel')" />
      <AppButton variant="primary" size="lg" class="btn" label="Move" :disabled="busy" data-testid="map-move-confirm" @click="emit('move')" />
    </div>
    <p v-if="!inline" class="hint">Tap your token, then a square. Drag works too.</p>
  </section>
</template>

<script setup lang="ts">
import AppButton from "@/components/common/controls/AppButton.vue";
import type { SpeedState } from "@/lib/battlemap/movement";

/**
 * "Move here?" (#1125 frame 14): the feet against the speed, in gilt within it and amber or red past it, with a
 * Cancel and a gilt Move. A bottom sheet on a phone, an inline slip over the map on a tablet.
 */
defineProps<{
  feetText: string;
  label: string;
  state: SpeedState;
  inline?: boolean;
  busy?: boolean;
}>();
const emit = defineEmits<{ cancel: []; move: [] }>();
</script>

<style scoped>
.move-sheet {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  padding: 0.875rem 1rem;
  background: var(--card);
  color: var(--card-foreground);
  border-top: 1px solid var(--border);
  --feet-ink: var(--primary);
}
.is-bottom {
  padding-bottom: calc(0.875rem + env(safe-area-inset-bottom));
}
.is-inline {
  position: absolute;
  left: 50%;
  bottom: 1rem;
  transform: translateX(-50%);
  width: min(22rem, calc(100% - 2rem));
  border: 1px solid var(--border);
  border-radius: 0.5rem;
  box-shadow: 0 0.5rem 1.5rem rgb(0 0 0 / 0.5);
}
.state-dash {
  --feet-ink: var(--color-tone-caution);
}
.state-beyond {
  --feet-ink: var(--color-tone-danger);
}
.head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
}
.ask {
  font-family: var(--font-cinzel, "Cinzel", serif);
  font-weight: 700;
  font-size: 1.0625rem;
}
.feet {
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  color: var(--feet-ink);
}
.buttons {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0.75rem;
}
.btn {
  min-height: 2.875rem;
}
.hint {
  text-align: center;
  font-size: 0.8125rem;
  color: var(--muted-foreground);
}
</style>
