<template>
  <div class="rounded-lg border border-border bg-card overflow-hidden">
    <div class="px-3 py-2 border-b border-border bg-muted/20">
      <span class="font-cinzel text-xs font-semibold text-muted-foreground tracking-wider">
        Traps &amp; Hazards
        <span v-if="linkedGroups.length" class="font-fell font-normal">({{ trapIds.length }})</span>
      </span>
    </div>
    <div class="p-2 flex flex-col gap-1">
      <!-- Empty state -->
      <p
        v-if="!linkedGroups.length"
        class="font-fell text-xs text-muted-foreground italic px-2 py-1"
      >
        No traps linked. Add hazards to include them in the difficulty calculation.
      </p>

      <!-- Linked traps (grouped with qty) -->
      <div
        v-for="{ trap, qty } in linkedGroups"
        :key="trap.id"
        class="flex items-center gap-2 group rounded px-2 py-1.5 hover:bg-muted/40 transition-colors"
      >
        <Crosshair class="h-3.5 w-3.5 text-muted-foreground shrink-0" />
        <button
          type="button"
          class="font-fell text-sm text-foreground flex-1 truncate text-left hover:text-primary transition-colors"
          @click="previewTrap = trap"
        >{{ trap.name }}</button>
        <span v-if="trap.cr" class="font-cinzel text-[10px] text-muted-foreground shrink-0">
          CR {{ trap.cr }} · {{ crToXp(trap.cr) * qty }} XP
        </span>

        <!-- Qty controls -->
        <div class="flex items-center gap-1 shrink-0">
          <button
            type="button"
            class="w-5 h-5 rounded bg-muted border border-border flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors"
            @click="decrement(trap.id)"
          >
            <Minus class="h-3 w-3" />
          </button>
          <span class="font-cinzel text-xs font-bold text-foreground w-5 text-center">{{ qty }}</span>
          <button
            type="button"
            class="w-5 h-5 rounded bg-muted border border-border flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors"
            @click="increment(trap.id)"
          >
            <Plus class="h-3 w-3" />
          </button>
        </div>

        <button
          type="button"
          class="[@media(hover:hover)]:opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-destructive shrink-0"
          title="Remove all"
          @click="removeAll(trap.id)"
        >
          <X class="h-3.5 w-3.5" />
        </button>
      </div>

      <!-- Add control -->
      <div
        class="flex items-center gap-2"
        :class="linkedGroups.length ? 'border-t border-border/50 pt-2 mt-1' : 'pt-1'"
      >
        <EntityCombobox
          v-model="selectedId"
          :options="allTraps"
          placeholder="Add trap or hazard…"
        />
        <button
          type="button"
          :disabled="!selectedId"
          class="text-muted-foreground hover:text-primary transition-colors disabled:opacity-40 shrink-0"
          @click="addTrap"
        >
          <Plus class="h-4 w-4" />
        </button>
      </div>
    </div>
  </div>

  <TrapPreviewModal :trap="previewTrap" @close="previewTrap = null" />
</template>

<script setup lang="ts">
import { ref, computed } from "vue";
import { Crosshair, X, Plus, Minus } from "lucide-vue-next";
import EntityCombobox from "@/components/common/EntityCombobox.vue";
import TrapPreviewModal from "@/components/traps/TrapPreviewModal.vue";
import { crToXp } from "@/types/encounter.types";
import type { Trap } from "@/types/trap.types";

const props = defineProps<{
  trapIds: string[];
  allTraps: Trap[];
}>();

const emit = defineEmits<{
  "update:trapIds": [v: string[]];
}>();

const selectedId = ref("");
const previewTrap = ref<Trap | null>(null);

const trapCounts = computed(() => {
  const counts = new Map<string, number>();
  for (const id of props.trapIds) {
    counts.set(id, (counts.get(id) ?? 0) + 1);
  }
  return counts;
});

const linkedGroups = computed(() => {
  const seen = new Set<string>();
  const groups: { trap: Trap; qty: number }[] = [];
  for (const id of props.trapIds) {
    if (seen.has(id)) continue;
    seen.add(id);
    const trap = props.allTraps.find((t) => t.id === id);
    if (trap) groups.push({ trap, qty: trapCounts.value.get(id) ?? 1 });
  }
  return groups;
});

function addTrap() {
  if (!selectedId.value) return;
  emit("update:trapIds", [...props.trapIds, selectedId.value]);
  selectedId.value = "";
}

function increment(id: string) {
  emit("update:trapIds", [...props.trapIds, id]);
}

function decrement(id: string) {
  const idx = [...props.trapIds].lastIndexOf(id);
  if (idx === -1) return;
  const next = [...props.trapIds];
  next.splice(idx, 1);
  emit("update:trapIds", next);
}

function removeAll(id: string) {
  emit("update:trapIds", props.trapIds.filter((i) => i !== id));
}
</script>
