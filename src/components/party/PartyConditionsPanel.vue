<template>
  <div class="flex flex-wrap items-center gap-1.5">
    <ExhaustionChip
      v-if="getExhaustionLevel(member.conditions) > 0"
      :level="getExhaustionLevel(member.conditions)"
      @update="setExhaustion"
    />
    <span
      v-for="cond in nonExhaustionConditions"
      :key="cond"
      class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-destructive/10 border border-destructive/30 text-label font-semibold text-destructive"
      :title="getConditionDescription(cond, ruleset)"
    >
      {{ cond }}
      <AppButton variant="link" tone="danger" size="inline-xs" label="×" @click="removeCondition(cond)" />
    </span>

    <span
      v-for="curse in member.curses"
      :key="curse"
      class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-tone-arcane/10 border border-tone-arcane/30 text-label font-semibold text-ink-arcane"
    >
      Cursed: {{ curse }}
      <AppButton variant="link" tone="arcane" size="inline-xs" label="×" @click="removeCurse(curse)" />
    </span>

    <template v-if="curseInputOpen">
      <AppInput
        ref="curseInputEl"
        v-model="curseInputText"
        size="xs"
        tone="bare"
        shape="pill"
        placeholder="Curse name…"
        class="border border-tone-arcane/50 bg-tone-arcane/10 text-ink-arcane placeholder:text-ink-arcane/40 focus:ring-0 w-32"
        @keydown.enter.prevent="addCurse"
        @keydown.escape="curseInputOpen = false"
      />
      <AppButton
        variant="tinted"
        size="xs"
        shape="pill"
        label="Add"
        tone="arcane"
        emphasis="outline"
        @click="addCurse"
      />
    </template>

    <div ref="triggerRef" class="flex w-fit">
      <AppButton
        variant="subtle"
        size="xs"
        shape="pill"
        tone="primary"
        :icon="IconAdd"
        label="Condition"
        class="border-dashed border-muted-foreground/40"
        aria-haspopup="dialog"
        :aria-expanded="conditionOpen"
        @click="conditionOpen = !conditionOpen"
      />
    </div>
    <!-- Teleported: every party card is its own stacking context (vellum's torn
         panels isolate), so an in-card absolute menu sank under the next row. -->
    <Teleport to="body">
      <div
        v-if="conditionOpen"
        ref="floatingRef"
        :style="floatingStyle"
        data-slip class="z-300 w-48 max-h-[70vh] overflow-y-auto rounded-md border border-border bg-popover shadow-lg p-1"
        role="dialog"
        aria-label="Add a condition"
      >
        <AppButton
          v-for="cond in availableConditions"
          :key="cond"
          variant="menu"
          size="xs"
          block
          :tooltip="getConditionDescription(cond, ruleset)"
          :label="cond"
          @click="addCondition(cond)"
        />
        <div class="border-t border-border mt-1 pt-1">
          <AppButton variant="menu" tone="arcane" size="xs" block label="Cursed…" @click="openCurseInput" />
        </div>
      </div>
    </Teleport>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, nextTick } from "vue";
import { IconAdd } from '@/lib/icons';
import AppButton from "@/components/common/controls/AppButton.vue";
import AppInput from "@/components/common/controls/AppInput.vue";
import type { AppInputHandle } from "@/components/common/controls/fieldVariants";
import { useUpdatePartyMember } from "@/composables/party/useParty";
import { useAnchoredPopover } from "@/composables/useAnchoredPopover";
import { useTableRuleset } from "@/composables/rules/useRuleset";
import {
  CONDITIONS,
  getConditionDescription,
  getExhaustionLevel,
  setExhaustionLevel,
  isExhaustion,
} from "@/rules/conditions";
import ExhaustionChip from "@/components/common/statblock/ExhaustionChip.vue";
import type { PartyMember } from "@/types/party.types";

const { member } = defineProps<{ member: PartyMember }>();
const { mutateAsync: updateMember } = useUpdatePartyMember();
const { ruleset } = useTableRuleset();

const conditionOpen = ref(false);
const triggerRef = ref<HTMLElement | null>(null);
const { floatingRef, floatingStyle } = useAnchoredPopover(triggerRef, conditionOpen, () => (conditionOpen.value = false));
const curseInputOpen = ref(false);
const curseInputText = ref("");
const curseInputEl = ref<AppInputHandle | null>(null);

const nonExhaustionConditions = computed(() => member.conditions.filter((c) => !isExhaustion(c)));

const availableConditions = computed(() => {
  const hasExhaustion = getExhaustionLevel(member.conditions) > 0;
  return CONDITIONS.filter((c) => {
    if (c === "Exhaustion") return !hasExhaustion;
    return !member.conditions.includes(c);
  });
});

async function addCondition(condition: string) {
  conditionOpen.value = false;
  if (condition === "Exhaustion") {
    await setExhaustion(1);
    return;
  }
  await updateMember({ id: member.id, update: { conditions: [...member.conditions, condition] } });
}

async function removeCondition(condition: string) {
  await updateMember({ id: member.id, update: { conditions: member.conditions.filter((c) => c !== condition) } });
}

async function setExhaustion(level: number) {
  await updateMember({ id: member.id, update: { conditions: setExhaustionLevel(member.conditions, level) } });
}

function openCurseInput() {
  conditionOpen.value = false;
  curseInputText.value = "";
  curseInputOpen.value = true;
  nextTick(() => curseInputEl.value?.focus());
}

async function addCurse() {
  const name = curseInputText.value.trim();
  if (!name) { curseInputOpen.value = false; return; }
  const curses = [...(member.curses ?? []), name];
  const conditions = member.conditions.includes("Cursed")
    ? member.conditions
    : [...member.conditions, "Cursed"];
  await updateMember({ id: member.id, update: { curses, conditions } });
  curseInputOpen.value = false;
  curseInputText.value = "";
}

async function removeCurse(curse: string) {
  const curses = (member.curses ?? []).filter((c) => c !== curse);
  const conditions = curses.length
    ? member.conditions
    : member.conditions.filter((c) => c !== "Cursed");
  await updateMember({ id: member.id, update: { curses, conditions } });
}
</script>
