<template>
  <TonightBlock block="forces" title="What moves next">
    <ul class="m-0 flex list-none flex-col gap-2 p-0">
      <li v-for="force in forces" :key="force.entryId" class="flex min-w-0 flex-col gap-0.5" data-testid="tonight-force">
        <RouterLink :to="{ path: '/canon', query: { entry: force.entryId } }" class="text-body font-semibold text-foreground underline-offset-2 hover:underline">{{ force.title }}</RouterLink>
        <span v-if="linesOf(force).length === 0" class="text-label text-muted-foreground">No next step written</span>
        <span v-for="line in linesOf(force)" :key="line.stepId" class="flex flex-wrap items-center gap-x-2 gap-y-1" data-testid="tonight-step">
          <span class="text-label text-muted-foreground">{{ line.title || "An unwritten step" }}</span>
          <span v-if="line.state !== 'next'" class="text-label font-bold" :class="line.state === 'overdue' ? 'text-destructive' : 'text-primary'" data-testid="tonight-step-state">{{ line.state === "overdue" ? "Overdue" : "Due" }}</span>
          <AppButton variant="outline" size="xs" label="Reached" data-testid="tonight-reached" @click="emit('reach', line.stepId)" />
          <TonightPinToggle :pinned="pinnedSteps.has(line.stepId)" @toggle="emit('pin', line.stepId)" />
        </span>
        <span v-if="force.clock" class="text-label text-muted-foreground">
          {{ force.clock.filled }} of {{ force.clock.size }}<template v-if="force.clock.full"> · The clock is full</template>
        </span>
        <AppButton v-if="force.clock" variant="outline" size="sm" label="Tick" class="self-start" :disabled="force.clock.full" data-testid="tonight-tick" @click="emit('tick', force)" />
      </li>
    </ul>
  </TonightBlock>
</template>

<script setup lang="ts">
/**
 * The forces still moving: the step each does next, any step whose date has come or gone by flagged "Due" or "Overdue",
 * each with Reached and a pin, and the clock's Tick (#1279 item 20).
 */
import { RouterLink } from "vue-router";
import AppButton from "@/components/common/controls/AppButton.vue";
import TonightBlock from "@/components/canon/tonight/TonightBlock.vue";
import TonightPinToggle from "@/components/canon/tonight/TonightPinToggle.vue";
import type { TonightForce } from "@/lib/canon/canonTonight";

defineProps<{ forces: readonly TonightForce[]; pinnedSteps: ReadonlySet<string> }>();
const emit = defineEmits<{ tick: [force: TonightForce]; reach: [stepId: string]; pin: [stepId: string] }>();

interface StepLine { stepId: string; title: string; state: "due" | "overdue" | "next" }
/** The due and late steps, then the next step when it is not one of them. */
function linesOf(force: TonightForce): StepLine[] {
  const lines: StepLine[] = [...force.dueSteps];
  if (force.nextStepId !== null && !lines.some((l) => l.stepId === force.nextStepId)) lines.push({ stepId: force.nextStepId, title: force.nextStep ?? "", state: "next" });
  return lines;
}
</script>
