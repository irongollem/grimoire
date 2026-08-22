<template>
  <div v-if="spellcasting?.entries?.length && spellsByLevel.size" class="flex flex-col gap-2 font-stat">
    <h3 class="text-xl font-normal text-primary border-b border-primary/30 pb-1">
      Spellcasting
    </h3>
    <p v-if="castingInfo" class="text-sm text-muted-foreground">{{ castingInfo }}</p>

    <!-- One collapsible <details> per spell level -->
    <details
      v-for="[level, items] in spellsByLevel"
      :key="level"
      open
      class="group"
    >
      <summary class="flex items-center gap-1 cursor-pointer list-none text-base text-primary font-semibold select-none py-0.5">
        <IconChevronRight class="h-3.5 w-3.5 transition-transform group-open:rotate-90 shrink-0" />
        {{ levelGroupLabel(level) }}
        <span class="ml-1 font-normal text-muted-foreground text-sm">({{ items.length }})</span>
      </summary>

      <div class="flex flex-col gap-0.5 pl-4 pt-1">
        <div
          v-for="item in items"
          :key="item.spellId"
          class="flex items-baseline gap-2"
        >
          <button
            v-if="item.spell"
            type="button"
            class="font-stat text-sm text-primary hover:underline text-left"
            @click="openModal(item.spell!)"
          >
            {{ item.spell.name }}
          </button>
          <span v-else class="font-stat text-sm text-muted-foreground italic">Unknown Spell</span>
          <span v-if="item.frequency" class="text-caption text-muted-foreground italic shrink-0">{{ item.frequency }}</span>
        </div>
      </div>
    </details>
  </div>

  <!-- Spell detail modal -->
  <AppModal
    :open="modalSpell !== null"
    size="lg"
    panel-class="max-h-[90vh]"
    @close="modalSpell = null"
  >
    <ModalHeader :title="modalSpell?.name ?? ''" closeable @close="modalSpell = null" />
    <div class="min-h-0 flex-1 overflow-y-auto overscroll-contain p-4">
      <SpellSheet v-if="modalSpell" :spell="modalSpell" />
    </div>
  </AppModal>
</template>

<script setup lang="ts">
import { ref, computed } from "vue";
import { IconChevronRight } from '@/lib/icons';
import AppModal from "@/components/common/AppModal.vue";
import ModalHeader from "@/components/common/ModalHeader.vue";
import { useSpells } from "@/composables/useSpells";
import SpellSheet from "@/components/spells/SpellSheet.vue";
import type { SpellcastingBlock } from "@/types/npc.types";
import type { Spell } from "@/types/spell.types";

const props = defineProps<{ spellcasting?: SpellcastingBlock }>();

const { data: allSpells } = useSpells();

const spellMap = computed(() => {
  const m = new Map<string, Spell>();
  for (const s of allSpells.value ?? []) m.set(s.id, s);
  return m;
});

interface SpellItem {
  spellId: string;
  spell: Spell | null;
  frequency: string;
}

const spellsByLevel = computed(() => {
  const map = new Map<number, SpellItem[]>();
  for (const entry of props.spellcasting?.entries ?? []) {
    for (const spellId of entry.spell_ids) {
      const spell = spellMap.value.get(spellId) ?? null;
      const level = spell?.level ?? -1; // -1 = unknown, sort last
      const group = map.get(level) ?? [];
      group.push({ spellId, spell, frequency: entry.frequency });
      map.set(level, group);
    }
  }
  return new Map(
    [...map.entries()].sort((a, b) => {
      if (a[0] === -1) return 1;
      if (b[0] === -1) return -1;
      return a[0] - b[0];
    }),
  );
});

function levelGroupLabel(level: number): string {
  if (level === -1) return "Unknown Level";
  if (level === 0) return "Cantrips";
  const suffixes: Record<number, string> = { 1: "st", 2: "nd", 3: "rd" };
  return `${level}${suffixes[level] ?? "th"} Level`;
}

const castingInfo = computed(() => {
  const s = props.spellcasting;
  if (!s) return "";
  const parts: string[] = [];
  if (s.ability) parts.push(`${s.ability}-based`);
  if (s.save_dc !== null && s.save_dc !== undefined) parts.push(`Spell save DC ${s.save_dc}`);
  if (s.attack_bonus !== null && s.attack_bonus !== undefined) parts.push(`${s.attack_bonus >= 0 ? "+" : ""}${s.attack_bonus} to hit`);
  return parts.join(" · ");
});

const modalSpell = ref<Spell | null>(null);
function openModal(spell: Spell) {
  modalSpell.value = spell;
}
</script>

