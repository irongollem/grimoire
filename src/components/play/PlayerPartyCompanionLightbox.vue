<template>
  <EntityLightbox
    :open="!!companion"
    :portrait-src="companion?.portrait_url ?? null"
    :portrait-alt="companion?.name"
    :focal-point="companion?.portrait_focal_point ?? null"
    @close="$emit('close')"
  >
    <template #portrait-overlay>
      <span
        v-if="companion"
        class="absolute top-2 left-2 text-label md:text-sm px-1.5 py-0.5 rounded text-white"
        :style="{ backgroundColor: COMPANION_TYPE_COLORS[companion.companion_type] + 'CC' }"
      >{{ COMPANION_TYPE_LABELS[companion.companion_type] }}</span>
    </template>

    <div>
      <div class="flex items-center gap-2">
        <h2 class="text-heading font-bold text-foreground">{{ companion?.name }}</h2>
        <span
          v-if="companion && !companion.combat_ready"
          class="text-label md:text-sm px-1.5 py-0.5 rounded bg-muted text-muted-foreground italic"
        >Elsewhere</span>
      </div>
      <p v-if="ownerName" class="text-body text-muted-foreground italic">
        {{ ownerName }}'s companion
      </p>
    </div>
    <div v-if="companion" class="grid grid-cols-2 gap-3">
      <div class="rounded-md bg-muted p-2.5">
        <div class="flex items-center justify-between mb-1">
          <span class="text-label md:text-sm text-muted-foreground">HP</span>
          <span class="font-cinzel text-sm font-bold" :class="hpColor">
            {{ companion.current_hp }} / {{ companion.max_hp }}
          </span>
        </div>
        <div class="h-1.5 rounded-full bg-background overflow-hidden">
          <div
            class="h-full rounded-full transition-all"
            :class="hpBarColor"
            :style="{ width: `${Math.max(0, Math.min(100, (companion.current_hp / companion.max_hp) * 100))}%` }"
          />
        </div>
        <!-- HP steppers — owner only -->
        <div v-if="isOwner" class="flex items-center gap-1 mt-2">
          <AppInput
            v-model.number="hpAmount"
            type="number"
            min="1"
            placeholder="HP"
            tone="card"
            size="caption"
            align="center"
            :block="false"
            class="w-12"
          />
          <AppButton
            variant="tinted"
            size="xs"
            label="DMG"
            tooltip="Deal damage"
            tone="danger"
            emphasis="soft"
            @click="damage"
          />
          <AppButton
            variant="tinted"
            size="xs"
            label="HEAL"
            tooltip="Heal"
            tone="success"
            emphasis="soft"
            @click="heal"
          />
        </div>
      </div>
      <div class="rounded-md bg-muted p-2.5 flex items-center gap-2">
        <IconShield class="h-4 w-4 text-muted-foreground shrink-0" />
        <div>
          <p class="text-eyebrow md:text-sm text-muted-foreground">AC</p>
          <p class="font-cinzel text-sm font-bold text-foreground">{{ companion.ac }}</p>
        </div>
      </div>
    </div>

    <!-- Status toggle — owner only -->
    <div v-if="isOwner" class="flex items-center gap-2">
      <span class="text-label-lg font-semibold text-muted-foreground">Status</span>
      <div class="flex rounded-md border border-border overflow-hidden text-label-lg font-semibold">
        <AppButton
          variant="ghost" size="sm" class="flex-1 rounded-none"
          :active="!!companion?.combat_ready"
          label="With the party"
          @click="setCombatReady(true)"
        />
        <AppButton
          variant="ghost" size="sm" class="flex-1 rounded-none"
          :active="!companion?.combat_ready"
          label="Elsewhere"
          @click="setCombatReady(false)"
        />
      </div>
    </div>

    <!-- Conditions -->
    <div v-if="companion?.conditions?.length" class="flex flex-wrap gap-1.5">
      <ExhaustionChip
        v-if="isOwner && getExhaustionLevel(companion.conditions) > 0"
        :level="getExhaustionLevel(companion.conditions)"
        @update="setExhaustion"
      />
      <span
        v-for="cond in companion.conditions.filter((c) => isOwner ? !isExhaustion(c) : true)"
        :key="cond"
        class="flex items-center gap-1 text-label md:text-sm px-1.5 py-0.5 rounded bg-destructive/10 text-destructive"
      >
        {{ cond }}
        <AppButton
          v-if="isOwner"
          variant="link" tone="danger" size="inline-xs"
          :aria-label="`Remove ${cond}`"
          @click="removeCondition(cond)"
        >×</AppButton>
      </span>
    </div>

    <!-- Add condition — owner only -->
    <div v-if="isOwner">
      <div v-if="addingCondition" class="flex items-center gap-1">
        <AppSelect
          v-model="newCondition"
          tone="card"
          size="caption"
          weight="normal"
          class="flex-1"
        >
          <option value="">Pick condition…</option>
          <option v-for="c in availableConditions" :key="c" :value="c">{{ c }}</option>
        </AppSelect>
        <AppButton variant="link" size="inline" label="Add" @click="addCondition" />
        <AppButton variant="ghost" size="inline" label="✕" @click="addingCondition = false; newCondition = ''" />
      </div>
      <AppButton
        v-else
        variant="subtle"
        size="xs"
        class="border-dashed"
        label="+ Condition"
        @click="addingCondition = true"
      />
    </div>

    <PlayerNotesWidget v-if="companion" entity-type="companion" :entity-id="companion.id" placeholder="Your thoughts on this companion…" />

    <template v-if="isOwner" #footer>
      <div class="flex items-center justify-end gap-2 p-4 pt-0">
        <AppButton variant="subtle" size="sm" label="Edit" :icon="IconEdit" @click="handleEdit" />
        <AppButton variant="destructive" size="sm" label="Delete" :icon="IconClose" @click="handleDelete" />
      </div>
    </template>
  </EntityLightbox>
</template>

<script setup lang="ts">
import { ref, computed } from "vue";
import { IconShield, IconEdit, IconClose } from "@/lib/icons";
import AppButton from "@/components/common/AppButton.vue";
import AppInput from "@/components/common/AppInput.vue";
import AppSelect from "@/components/common/AppSelect.vue";
import EntityLightbox from "@/components/common/EntityLightbox.vue";
import PlayerNotesWidget from "@/components/common/PlayerNotesWidget.vue";
import ExhaustionChip from "@/components/common/ExhaustionChip.vue";
import { useUpdateCompanion, useDeleteCompanion } from "@/composables/useCompanions";
import { useConfirm } from "@/composables/useConfirm";
import {
  CONDITIONS,
  getExhaustionLevel,
  setExhaustionLevel,
  isExhaustion,
} from "@/rules/conditions";
import { COMPANION_TYPE_LABELS, COMPANION_TYPE_COLORS } from "@/types/companion.types";
import type { Companion } from "@/types/companion.types";

const { companion, ownerName, viewerMemberId } = defineProps<{
  companion: Companion | null;
  ownerName: string;
  viewerMemberId?: string | null;
}>();

const emit = defineEmits<{
  close: [];
  edit: [companion: Companion];
}>();

const isOwner = computed(() =>
  !!companion && !!viewerMemberId && companion.owner_party_member_id === viewerMemberId,
);

const { mutateAsync: updateCompanion } = useUpdateCompanion();
const { mutateAsync: deleteCompanionMutation } = useDeleteCompanion();
const { confirm } = useConfirm();

const hpAmount        = ref(1);
const addingCondition = ref(false);
const newCondition    = ref("");

const hpPct = computed(() => {
  if (!companion || companion.max_hp === 0) return 0;
  return companion.current_hp / companion.max_hp;
});

const hpColor = computed(() => {
  const p = hpPct.value;
  return p < 0.33 ? "text-destructive" : p < 0.66 ? "text-amber-400" : "text-elven-green";
});

const hpBarColor = computed(() => {
  const p = hpPct.value;
  return p < 0.33 ? "bg-destructive" : p < 0.66 ? "bg-amber-400" : "bg-elven-green";
});

const availableConditions = computed(() => {
  if (!companion) return [];
  const hasExhaustion = getExhaustionLevel(companion.conditions) > 0;
  return CONDITIONS.filter((c) => {
    if (c === "Exhaustion") return !hasExhaustion;
    return !companion.conditions.includes(c);
  });
});

async function damage() {
  if (!companion) return;
  const amount = hpAmount.value;
  if (!amount || amount < 1) return;
  const newHp = Math.max(0, companion.current_hp - amount);
  await updateCompanion({ id: companion.id, update: { current_hp: newHp } });
  hpAmount.value = 1;
}

async function heal() {
  if (!companion) return;
  const amount = hpAmount.value;
  if (!amount || amount < 1) return;
  const newHp = Math.min(companion.max_hp, companion.current_hp + amount);
  await updateCompanion({ id: companion.id, update: { current_hp: newHp } });
  hpAmount.value = 1;
}

async function addCondition() {
  if (!companion || !newCondition.value) return;
  if (newCondition.value === "Exhaustion") {
    await setExhaustion(1);
  } else {
    const updated = [...companion.conditions, newCondition.value];
    await updateCompanion({ id: companion.id, update: { conditions: updated } });
  }
  newCondition.value = "";
  addingCondition.value = false;
}

async function removeCondition(cond: string) {
  if (!companion) return;
  const updated = companion.conditions.filter((c) => c !== cond);
  await updateCompanion({ id: companion.id, update: { conditions: updated } });
}

async function setExhaustion(level: number) {
  if (!companion) return;
  const updated = setExhaustionLevel(companion.conditions, level);
  await updateCompanion({ id: companion.id, update: { conditions: updated } });
}

async function setCombatReady(ready: boolean) {
  if (!companion) return;
  await updateCompanion({ id: companion.id, update: { combat_ready: ready } });
}

function handleEdit() {
  if (!companion) return;
  emit("edit", companion);
}

async function handleDelete() {
  if (!companion) return;
  if (!await confirm(`Remove "${companion.name || "this companion"}"?`)) return;
  await deleteCompanionMutation(companion);
  emit("close");
}
</script>
