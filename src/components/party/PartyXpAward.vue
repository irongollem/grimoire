<template>
  <div class="rounded-lg border border-border bg-card overflow-hidden">
    <div class="flex items-center justify-between px-4 py-2 border-b border-border bg-muted/20">
      <span class="text-label-lg font-semibold text-muted-foreground">Award Experience</span>
    </div>

    <div class="p-3 flex flex-wrap items-end gap-2">
      <!-- Amount -->
      <label class="flex flex-col gap-1">
        <span class="text-eyebrow text-muted-foreground">XP</span>
        <input
          v-model.number="amount"
          type="number"
          min="0"
          step="10"
          placeholder="0"
          class="w-24 bg-background border border-border rounded-md px-3 py-1.5 text-body text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
      </label>

      <!-- Target: Everyone or a specific member -->
      <label class="flex flex-col gap-1 min-w-44 flex-1 max-w-xs">
        <span class="text-eyebrow text-muted-foreground">To</span>
        <EntityCombobox v-model="targetId" :options="targetOptions" placeholder="Everyone" />
      </label>

      <button
        type="button"
        :disabled="!canAward || saving"
        class="inline-flex items-center gap-1.5 rounded-md bg-primary px-4 py-1.5 text-label-lg font-semibold text-primary-foreground hover:opacity-90 transition-opacity disabled:opacity-40"
        @click="award"
      >
        {{ saving ? "Awarding…" : "Award" }}
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from "vue";
import { useUpdatePartyMember } from "@/composables/useParty";
import { useToast } from "@/composables/useToast";
import { levelForXp } from "@/types/party.types";
import type { PartyMember } from "@/types/party.types";
import EntityCombobox from "@/components/common/EntityCombobox.vue";

const { party } = defineProps<{ party: PartyMember[] }>();

const { mutateAsync: updateMember } = useUpdatePartyMember();
const toast = useToast();

const ALL = "__all__";
const amount = ref<number | null>(null);
const targetId = ref<string>(ALL);
const saving = ref(false);

const targetOptions = computed(() => [
  { id: ALL, name: "Everyone" },
  ...party.map((m) => ({ id: m.id, name: m.name || "Unnamed" })),
]);

const canAward = computed(() => (amount.value ?? 0) > 0 && party.length > 0);

async function award() {
  const delta = amount.value ?? 0;
  if (delta <= 0) return;
  const targets = targetId.value === ALL ? party : party.filter((m) => m.id === targetId.value);
  if (!targets.length) return;

  saving.value = true;
  try {
    for (const m of targets) {
      const next = Math.max(0, (m.experience_points ?? 0) + delta);
      const leveled = levelForXp(next) > levelForXp(m.experience_points ?? 0);
      await updateMember({ id: m.id, update: { experience_points: next } });
      if (leveled) toast.info(`${m.name || "A hero"} can now level up!`);
    }
    toast.success(
      targets.length === 1
        ? `Awarded ${delta} XP to ${targets[0].name || "the hero"}.`
        : `Awarded ${delta} XP to ${targets.length} heroes.`,
    );
    amount.value = null;
  } catch (e) {
    toast.error(toast.fromError(e, "Could not award XP."));
  } finally {
    saving.value = false;
  }
}
</script>
