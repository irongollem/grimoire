<template>
  <div class="rounded-lg border border-border bg-card p-5 flex flex-col gap-4">
    <h2 class="font-cinzel text-sm font-bold text-foreground tracking-wider uppercase">
      Party Members
    </h2>
    <div v-if="partyLoading" class="flex justify-center py-4">
      <LoadingSpinner />
    </div>
    <p v-else-if="!party?.length" class="font-fell text-sm text-muted-foreground italic">
      No party members found. Add heroes in the Party Tracker first.
    </p>
    <div v-else class="flex flex-col gap-2">
      <label
        v-for="member in party"
        :key="member.id"
        class="flex items-center gap-3 rounded-md border border-border p-3 cursor-pointer hover:border-primary/40 transition-colors"
        :class="partyMemberIds.includes(member.id) ? 'border-primary/50 bg-primary/5' : ''"
      >
        <input
          type="checkbox"
          :checked="partyMemberIds.includes(member.id)"
          class="accent-primary"
          @change="$emit('toggle-party-member', member.id)"
        />
        <div class="flex-1 min-w-0">
          <span class="font-cinzel text-sm font-semibold text-foreground">{{ member.name }}</span>
          <span class="ml-2 font-fell text-xs text-muted-foreground italic">
            {{
              [
                speciesNameMap.get(member.species_id ?? '') ?? null,
                memberClassLabel(member.id, member.class),
                memberLevelDisplay(member.id, member.level) ? `Lv${memberLevelDisplay(member.id, member.level)}` : '',
              ]
                .filter(Boolean)
                .join(' · ')
            }}
          </span>
        </div>
        <span class="font-cinzel text-[10px] text-muted-foreground shrink-0">
          Lv {{ memberLevelDisplay(member.id, member.level) }}
        </span>
        <select
          v-if="partyMemberIds.includes(member.id)"
          :value="partyMemberFactions[member.id] ?? 'players'"
          class="shrink-0 bg-muted border border-border rounded px-2 py-0.5 font-cinzel text-[10px] text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
          :style="{
            borderColor:
              factions.find((f) => f.id === (partyMemberFactions[member.id] ?? 'players'))?.color ?? undefined,
          }"
          @click.stop
          @change="(e) => $emit('set-member-faction', member.id, (e.target as HTMLSelectElement).value)"
        >
          <option v-for="f in factions" :key="f.id" :value="f.id">{{ f.name }}</option>
        </select>
      </label>

      <!-- Companions -->
      <template v-if="companions?.length">
        <div class="mt-1 mb-0.5 flex items-center gap-2">
          <div class="h-px flex-1 bg-border" />
          <span class="font-cinzel text-[10px] text-muted-foreground tracking-wider uppercase shrink-0">Companions</span>
          <div class="h-px flex-1 bg-border" />
        </div>
        <label
          v-for="comp in companions"
          :key="comp.id"
          class="flex items-center gap-3 rounded-md border border-border p-3 cursor-pointer hover:border-primary/40 transition-colors"
          :class="companionIds.includes(comp.id) ? 'border-primary/50 bg-primary/5' : ''"
        >
          <input
            type="checkbox"
            :checked="companionIds.includes(comp.id)"
            class="accent-primary"
            @change="$emit('toggle-companion', comp.id)"
          />
          <div class="flex-1 min-w-0">
            <span class="font-cinzel text-sm font-semibold text-foreground">{{ comp.name }}</span>
            <span class="ml-2 font-fell text-xs text-muted-foreground italic capitalize">
              {{ comp.companion_type.replace('_', ' ') }}
            </span>
          </div>
          <span class="font-cinzel text-[10px] text-muted-foreground shrink-0">
            {{ comp.current_hp }}/{{ comp.max_hp }} HP
          </span>
          <select
            v-if="companionIds.includes(comp.id)"
            :value="partyMemberFactions[comp.id] ?? 'players'"
            class="shrink-0 bg-muted border border-border rounded px-2 py-0.5 font-cinzel text-[10px] text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
            :style="{
              borderColor:
                factions.find((f) => f.id === (partyMemberFactions[comp.id] ?? 'players'))?.color ?? undefined,
            }"
            @click.stop
            @change="(e) => $emit('set-member-faction', comp.id, (e.target as HTMLSelectElement).value)"
          >
            <option v-for="f in factions" :key="f.id" :value="f.id">{{ f.name }}</option>
          </select>
        </label>
      </template>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { useAllCampaignCharacterClasses } from '@/composables/useCharacterClasses';
import { formatMulticlassLabel, totalLevel } from '@/types/multiclass.types';
import type { CharacterClass } from '@/types/multiclass.types';
import type { PartyMember } from '@/types/party.types';
import type { Companion } from '@/types/companion.types';
import type { FactionDef } from '@/types/encounter.types';
import LoadingSpinner from '@/components/common/LoadingSpinner.vue';

const {
  party = null,
  partyLoading = false,
  companions = null,
  partyMemberIds,
  companionIds,
  partyMemberFactions,
  factions,
  speciesNameMap,
} = defineProps<{
  party: PartyMember[] | null | undefined;
  partyLoading: boolean;
  companions: Companion[] | null | undefined;
  partyMemberIds: string[];
  companionIds: string[];
  partyMemberFactions: Record<string, string>;
  factions: FactionDef[];
  speciesNameMap: Map<string, string>;
}>();

defineEmits<{
  'toggle-party-member': [memberId: string];
  'toggle-companion': [companionId: string];
  'set-member-faction': [memberId: string, factionId: string];
}>();

const { data: allCharacterClasses } = useAllCampaignCharacterClasses();
const classesByMember = computed(() => {
  const m = new Map<string, CharacterClass[]>();
  for (const cc of allCharacterClasses.value ?? []) {
    const list = m.get(cc.party_member_id) ?? [];
    list.push(cc);
    m.set(cc.party_member_id, list);
  }
  return m;
});

function memberClassLabel(memberId: string, legacyClass: string | null): string {
  const list = classesByMember.value.get(memberId) ?? [];
  if (list.length > 1) return formatMulticlassLabel(list);
  if (list.length === 1) return list[0].class_name;
  return legacyClass ?? '';
}

function memberLevelDisplay(memberId: string, legacyLevel: number): number {
  const list = classesByMember.value.get(memberId) ?? [];
  return list.length > 0 ? totalLevel(list) : legacyLevel;
}
</script>
