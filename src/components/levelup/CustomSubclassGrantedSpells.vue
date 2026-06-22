<template>
  <section class="rounded-lg border border-border bg-card p-4 space-y-4">
    <h2 class="font-cinzel text-xs tracking-widest uppercase text-muted-foreground">Granted Spells per Level</h2>
    <p class="font-fell text-sm text-muted-foreground">
      Spells the subclass grants automatically — always prepared, and they don't count toward the
      prepared-spell limit (oath / domain / circle spells). Pick from the SRD or your
      <RouterLink to="/spells" class="text-primary hover:underline">custom spells</RouterLink>.
    </p>

    <div v-if="populatedLevels.length > 0" class="space-y-3">
      <div v-for="lvl in populatedLevels" :key="lvl" class="flex items-start gap-3">
        <span class="font-cinzel text-xs text-primary tracking-wider w-8 pt-2 shrink-0">{{ lvl }}</span>
        <div class="flex-1 min-w-0 space-y-2">
          <div v-if="(grantedSpells[lvl.toString()] ?? []).length > 0" class="flex flex-wrap gap-1.5">
            <span
              v-for="sid in grantedSpells[lvl.toString()]"
              :key="sid"
              class="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 px-2.5 py-0.5 font-fell text-xs text-emerald-600 dark:text-emerald-400"
            >
              {{ spellNameById(sid) }}
              <button
                type="button"
                class="ml-0.5 text-emerald-500/60 hover:text-destructive transition-colors leading-none"
                @click="removeSpellFromLevel(lvl, sid)"
              >×</button>
            </span>
          </div>
          <EntityCombobox
            model-value=""
            :options="availableSpellsForLevel(lvl)"
            placeholder="Add spell…"
            @update:model-value="(sid) => sid && addSpellToLevel(lvl, sid)"
          />
        </div>
      </div>
    </div>

    <div class="flex items-center gap-2 pt-1">
      <select
        v-model="addSpellLevel"
        class="bg-card border border-border rounded-md px-2 py-1.5 font-cinzel text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
      >
        <option value="" disabled>Level…</option>
        <option v-for="n in 20" :key="n" :value="n">{{ n }}</option>
      </select>
      <button
        type="button"
        :disabled="!addSpellLevel || populatedLevels.includes(Number(addSpellLevel))"
        class="inline-flex items-center gap-1 rounded-md border border-border px-3 py-1.5 font-cinzel text-xs text-foreground hover:bg-muted/40 transition-colors disabled:opacity-40"
        @click="addLevel"
      >
        <IconAdd class="h-3 w-3" />
        Add level
      </button>
    </div>
  </section>
</template>

<script setup lang="ts">
import { ref, computed } from "vue";
import { RouterLink } from "vue-router";
import { IconAdd } from "@/lib/icons";
import EntityCombobox from "@/components/common/EntityCombobox.vue";

const { grantedSpells, allSpellOptions } = defineProps<{
  grantedSpells: Record<string, string[]>;
  allSpellOptions: { id: string; name: string }[];
}>();

const emit = defineEmits<{
  "update:grantedSpells": [value: Record<string, string[]>];
}>();

const populatedLevels = computed<number[]>(() =>
  Object.keys(grantedSpells).map(Number).sort((a, b) => a - b),
);

const addSpellLevel = ref<number | "">("");

function spellNameById(spellId: string): string {
  return allSpellOptions.find(s => s.id === spellId)?.name ?? spellId;
}

function availableSpellsForLevel(level: number) {
  const selected = new Set(grantedSpells[level.toString()] ?? []);
  return allSpellOptions.filter(s => !selected.has(s.id));
}

function addSpellToLevel(level: number, spellId: string) {
  const key = level.toString();
  const current = grantedSpells[key] ?? [];
  if (!current.includes(spellId)) {
    emit("update:grantedSpells", { ...grantedSpells, [key]: [...current, spellId] });
  }
}

function removeSpellFromLevel(level: number, spellId: string) {
  const key = level.toString();
  const next = (grantedSpells[key] ?? []).filter(id => id !== spellId);
  if (next.length === 0) {
    const copy = { ...grantedSpells };
    delete copy[key];
    emit("update:grantedSpells", copy);
  } else {
    emit("update:grantedSpells", { ...grantedSpells, [key]: next });
  }
}

function addLevel() {
  if (!addSpellLevel.value) return;
  const key = addSpellLevel.value.toString();
  if (grantedSpells[key] === undefined) {
    emit("update:grantedSpells", { ...grantedSpells, [key]: [] });
  }
  addSpellLevel.value = "";
}
</script>
