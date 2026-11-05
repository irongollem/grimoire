<template>
  <div class="flex flex-col gap-4">
    <InspectorSection title="Where it comes from">
      <template v-if="effect.kind === 'light'">
        <AppSelect :model-value="effect.follows ?? STEADY" size="body" tone="default" weight="normal" block aria-label="The flame it follows" @update:model-value="follow">
          <option :value="STEADY">A steady glow</option>
          <option v-for="flame in flames" :key="flame.id" :value="flame.id">{{ flame.label }}</option>
        </AppSelect>
        <p class="text-caption text-muted-foreground">A glow follows a flame's flicker. Drag it on the stage to place it.</p>
      </template>
      <p v-else-if="effect.kind === 'steam'" class="text-caption text-muted-foreground">Drag it on the stage to where it rises from.</p>
      <p v-else class="text-caption text-muted-foreground">Drag its box on the stage to cover the part of the room it falls in.</p>
    </InspectorSection>

    <InspectorSection title="Amount">
      <SegmentedControl :model-value="amountOf(effect)" :options="AMOUNT_OPTIONS" size="sm" block @update:model-value="apply({ op: 'touchAmount', index, amount: $event })" />
    </InspectorSection>

    <InspectorSection title="Depth">
      <DepthBar :depth="effect.depth" />
      <AppButton variant="link" size="inline-caption" class="self-start" label="Set in the side view" @click="emit('side-view')" />
    </InspectorSection>

    <ExactFold>
      <p class="font-mono">Depth {{ round(effect.depth) }}</p>
      <p v-if="effect.kind === 'light'" class="font-mono">Radius {{ round(effect.radius) }}, intensity {{ round(effect.intensity) }}<template v-if="effect.id">, id {{ effect.id }}</template></p>
      <p v-else class="font-mono">Count {{ effect.count }}, opacity {{ round(effect.opacity) }}</p>
    </ExactFold>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import AppButton from "@/components/common/controls/AppButton.vue";
import AppSelect from "@/components/common/controls/AppSelect.vue";
import SegmentedControl from "@/components/common/controls/SegmentedControl.vue";
import DepthBar from "./DepthBar.vue";
import ExactFold from "./ExactFold.vue";
import InspectorSection from "./InspectorSection.vue";
import { amountOf, layerName, type Amount, type StudioOp } from "@/lib/bookNook/edit";
import { layersOf, type Effect, type Scene } from "@/lib/bookNook/scene";

/** What a touch is: where it comes from, how much of it there is, and its depth. The numbers are under Exact. */
const { effect, index, scene, apply } = defineProps<{
  effect: Effect;
  /** Its place in the stack, which is how a touch is addressed. */
  index: number;
  scene: Scene;
  apply: (op: StudioOp) => void;
}>();
const emit = defineEmits<{ "side-view": [] }>();

const STEADY = "";
const AMOUNT_OPTIONS: { value: Amount; label: string }[] = [
  { value: "little", label: "A little" },
  { value: "some", label: "Some" },
  { value: "lots", label: "Lots" },
];

/** The flames a glow can follow: every cut-out that flickers. */
const flames = computed(() =>
  layersOf(scene)
    .filter((l) => l.motions?.some((m) => m.kind === "flicker"))
    .map((l) => ({ id: l.id, label: layerName(l.id, l.name) })),
);

function follow(value: string) {
  apply({ op: "glowFollows", index, follows: value === STEADY ? null : value });
}
const round = (n: number) => Math.round(n * 1000) / 1000;
</script>
