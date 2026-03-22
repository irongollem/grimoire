<template>
  <div class="flex flex-col gap-2 rounded-lg border border-border bg-card/60 px-3 py-2.5">
    <!-- Header row -->
    <div class="flex items-center gap-2">
      <!-- Token avatar -->
      <div class="shrink-0 w-8 h-8 rounded-full overflow-hidden border border-border bg-muted">
        <FocalImage
          v-if="companion.portrait_url"
          :src="companion.portrait_url"
          format="token"
          :focal-point="companion.portrait_focal_point ?? null"
        />
        <div v-else class="w-full h-full rounded-full" :style="{ backgroundColor: COMPANION_TYPE_COLORS[companion.companion_type] + '33' }" />
      </div>

      <!-- Type indicator -->
      <span
        class="shrink-0 h-2 w-2 rounded-full"
        :style="{ backgroundColor: COMPANION_TYPE_COLORS[companion.companion_type] }"
        :title="COMPANION_TYPE_LABELS[companion.companion_type]"
      />

      <!-- Name + type badge -->
      <div class="min-w-0 flex-1">
        <p class="font-cinzel text-sm font-semibold text-foreground truncate leading-tight">
          {{ companion.name || "Unnamed" }}
        </p>
        <p class="font-fell text-[10px] text-muted-foreground italic leading-tight">
          {{ COMPANION_TYPE_LABELS[companion.companion_type] }}
          <template v-if="sourceName">
            · <RouterLink :to="sourceLink ?? '#'" class="hover:text-primary transition-colors">{{ sourceName }}</RouterLink>
          </template>
        </p>
      </div>

      <!-- HP -->
      <div class="text-right shrink-0">
        <span class="font-cinzel text-sm font-bold" :class="hpTextColor">{{ companion.current_hp }}</span>
        <span class="font-fell text-[11px] text-muted-foreground">/{{ companion.max_hp }}</span>
      </div>

      <!-- Edit / delete -->
      <div class="flex items-center gap-1 shrink-0">
        <button
          type="button"
          class="p-1 text-muted-foreground hover:text-foreground transition-colors rounded"
          title="Edit companion"
          @click="$emit('edit', companion)"
        >
          <Pencil class="h-3 w-3" />
        </button>
        <button
          type="button"
          class="p-1 text-muted-foreground hover:text-destructive transition-colors rounded"
          title="Remove companion"
          @click="$emit('delete', companion)"
        >
          <X class="h-3 w-3" />
        </button>
      </div>
    </div>

    <!-- HP bar -->
    <div class="h-1 w-full rounded-full bg-muted overflow-hidden">
      <div
        class="h-full rounded-full transition-all"
        :class="hpBarColor"
        :style="{ width: `${hpPct}%` }"
      />
    </div>

    <!-- Quick stats + HP controls -->
    <div class="flex items-center gap-2 flex-wrap">
      <span class="font-cinzel text-[10px] text-muted-foreground tracking-wider px-1.5 py-0.5 rounded bg-muted" title="Armour Class">
        AC {{ companion.ac }}
      </span>
      <span class="font-cinzel text-[10px] text-muted-foreground tracking-wider px-1.5 py-0.5 rounded bg-muted" title="Speed">
        {{ companion.speed }} ft
      </span>

      <!-- Damage -->
      <div class="flex items-center gap-1 ml-auto">
        <input
          v-model.number="hpAmount"
          type="number"
          min="1"
          placeholder="HP"
          class="w-12 bg-muted border border-border rounded px-1.5 py-0.5 font-fell text-xs text-foreground text-center focus:outline-none focus:ring-1 focus:ring-ring"
        />
        <button
          type="button"
          class="px-1.5 py-0.5 rounded bg-red-500/10 border border-red-500/30 font-cinzel text-[10px] font-semibold text-red-400 hover:bg-red-500/20 transition-colors"
          title="Deal damage"
          @click="damage"
        >
          DMG
        </button>
        <button
          type="button"
          class="px-1.5 py-0.5 rounded bg-green-500/10 border border-green-500/30 font-cinzel text-[10px] font-semibold text-green-400 hover:bg-green-500/20 transition-colors"
          title="Heal"
          @click="heal"
        >
          HEAL
        </button>
      </div>
    </div>

    <!-- Conditions -->
    <div v-if="companion.conditions.length" class="flex flex-wrap gap-1">
      <span
        v-for="cond in companion.conditions"
        :key="cond"
        class="flex items-center gap-1 px-1.5 py-0.5 rounded bg-destructive/10 border border-destructive/20 font-cinzel text-[10px] text-destructive tracking-wider"
      >
        {{ cond }}
        <button type="button" class="leading-none hover:opacity-70" @click="removeCondition(cond)">×</button>
      </span>
      <button
        v-if="!addingCondition"
        type="button"
        class="px-1.5 py-0.5 rounded border border-dashed border-border font-cinzel text-[10px] text-muted-foreground hover:text-foreground hover:border-border/80 transition-colors"
        @click="addingCondition = true"
      >
        + Condition
      </button>
    </div>

    <!-- Add condition inline input -->
    <div v-if="addingCondition" class="flex items-center gap-1">
      <select
        v-model="newCondition"
        class="flex-1 bg-card border border-border rounded px-2 py-1 font-fell text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
      >
        <option value="">Pick condition…</option>
        <option v-for="c in availableConditions" :key="c" :value="c">{{ c }}</option>
      </select>
      <button type="button" class="text-primary hover:opacity-80 font-cinzel text-xs px-2" @click="addCondition">Add</button>
      <button type="button" class="text-muted-foreground hover:text-foreground font-cinzel text-xs px-1" @click="addingCondition = false; newCondition = ''">✕</button>
    </div>

    <!-- Add condition button when no conditions yet -->
    <div v-else-if="!companion.conditions.length">
      <button
        type="button"
        class="px-1.5 py-0.5 rounded border border-dashed border-border font-cinzel text-[10px] text-muted-foreground hover:text-foreground hover:border-border/80 transition-colors"
        @click="addingCondition = true"
      >
        + Condition
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from "vue";
import { Pencil, X } from "lucide-vue-next";
import { useUpdateCompanion } from "@/composables/useCompanions";
import { CONDITIONS } from "@/types/party.types";
import {
  COMPANION_TYPE_LABELS,
  COMPANION_TYPE_COLORS,
} from "@/types/companion.types";
import type { Companion } from "@/types/companion.types";
import FocalImage from "@/components/common/FocalImage.vue";

const props = defineProps<{
  companion: Companion;
  sourceName?: string;
  sourceLink?: string;
}>();

defineEmits<{
  edit: [companion: Companion];
  delete: [companion: Companion];
}>();

const { mutateAsync: updateCompanion } = useUpdateCompanion();

const hpAmount = ref(1);
const addingCondition = ref(false);
const newCondition = ref("");

const hpPct = computed(() =>
  props.companion.max_hp > 0
    ? Math.max(0, Math.min(100, (props.companion.current_hp / props.companion.max_hp) * 100))
    : 0,
);

const hpTextColor = computed(() => {
  const pct = hpPct.value / 100;
  if (pct <= 0)    return "text-muted-foreground";
  if (pct <= 0.25) return "text-red-500";
  if (pct <= 0.5)  return "text-amber-500";
  return "text-green-500";
});

const hpBarColor = computed(() => {
  const pct = hpPct.value / 100;
  if (pct <= 0)    return "bg-muted-foreground/40";
  if (pct <= 0.25) return "bg-red-500";
  if (pct <= 0.5)  return "bg-amber-500";
  return "bg-green-500";
});

const availableConditions = computed(() =>
  CONDITIONS.filter((c) => !props.companion.conditions.includes(c)),
);

async function damage() {
  const amount = hpAmount.value;
  if (!amount || amount < 1) return;
  const newHp = Math.max(0, props.companion.current_hp - amount);
  await updateCompanion({ id: props.companion.id, update: { current_hp: newHp } });
  hpAmount.value = 1;
}

async function heal() {
  const amount = hpAmount.value;
  if (!amount || amount < 1) return;
  const newHp = Math.min(props.companion.max_hp, props.companion.current_hp + amount);
  await updateCompanion({ id: props.companion.id, update: { current_hp: newHp } });
  hpAmount.value = 1;
}

async function addCondition() {
  if (!newCondition.value) return;
  const updated = [...props.companion.conditions, newCondition.value];
  await updateCompanion({ id: props.companion.id, update: { conditions: updated } });
  newCondition.value = "";
  addingCondition.value = false;
}

async function removeCondition(cond: string) {
  const updated = props.companion.conditions.filter((c) => c !== cond);
  await updateCompanion({ id: props.companion.id, update: { conditions: updated } });
}
</script>
