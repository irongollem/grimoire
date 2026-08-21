<template>
  <div class="rounded-lg border border-border bg-card p-5 flex flex-col gap-4">
    <h2 class="font-cinzel text-sm font-bold text-foreground tracking-wider uppercase">
      Party Members
    </h2>
    <div v-if="partyLoading" class="flex justify-center py-4">
      <LoadingSpinner />
    </div>
    <p v-else-if="!party?.length" class="text-body text-muted-foreground italic">
      No party members found. Add heroes in the Party Tracker first.
    </p>
    <div v-else class="flex flex-col gap-2">
      <AppCheckbox
        v-for="member in party"
        :key="member.id"
        :model-value="partyMemberIds.includes(member.id)"
        label-layout="row"
        :class="[
          'gap-3 rounded-md border border-border p-3 hover:border-primary/40 transition-colors',
          partyMemberIds.includes(member.id) ? 'border-primary/50 bg-primary/5' : '',
        ]"
        @update:model-value="$emit('toggle-party-member', member.id)"
      >
        <div class="flex-1 min-w-0">
          <span class="font-cinzel text-sm font-semibold text-foreground">{{ member.name }}</span>
          <span class="ml-2 text-caption text-muted-foreground italic">
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
        <span class="font-cinzel text-2xs text-muted-foreground shrink-0">
          Lv {{ memberLevelDisplay(member.id, member.level) }}
        </span>
        <AppSelect
          v-if="partyMemberIds.includes(member.id)"
          :model-value="partyMemberFactions[member.id] ?? 'players'"
          tone="filled"
          size="xs"
          weight="normal"
          class="shrink-0"
          :style="{
            borderColor:
              factions.find((f) => f.id === (partyMemberFactions[member.id] ?? 'players'))?.color ?? undefined,
          }"
          @click.stop
          @update:model-value="(v) => $emit('set-member-faction', member.id, v)"
        >
          <option v-for="f in factions" :key="f.id" :value="f.id">{{ f.name }}</option>
        </AppSelect>
      </AppCheckbox>

      <!-- Companions -->
      <template v-if="companions?.length">
        <div class="mt-1 mb-0.5 flex items-center gap-2">
          <div class="h-px flex-1 bg-border" />
          <span class="text-eyebrow text-muted-foreground shrink-0">Companions</span>
          <div class="h-px flex-1 bg-border" />
        </div>
        <AppCheckbox
          v-for="comp in companions"
          :key="comp.id"
          :model-value="companionIds.includes(comp.id)"
          label-layout="row"
          :class="[
            'gap-3 rounded-md border border-border p-3 hover:border-primary/40 transition-colors',
            companionIds.includes(comp.id) ? 'border-primary/50 bg-primary/5' : '',
          ]"
          @update:model-value="$emit('toggle-companion', comp.id)"
        >
          <div class="flex-1 min-w-0">
            <span class="font-cinzel text-sm font-semibold text-foreground">{{ comp.name }}</span>
            <span class="ml-2 text-caption text-muted-foreground italic capitalize">
              {{ comp.companion_type.replace('_', ' ') }}
            </span>
          </div>
          <span class="font-cinzel text-2xs text-muted-foreground shrink-0">
            {{ comp.current_hp }}/{{ comp.max_hp }} HP
          </span>
          <AppSelect
            v-if="companionIds.includes(comp.id)"
            :model-value="partyMemberFactions[comp.id] ?? 'players'"
            tone="filled"
            size="xs"
            weight="normal"
            class="shrink-0"
            :style="{
              borderColor:
                factions.find((f) => f.id === (partyMemberFactions[comp.id] ?? 'players'))?.color ?? undefined,
            }"
            @click.stop
            @update:model-value="(v) => $emit('set-member-faction', comp.id, v)"
          >
            <option v-for="f in factions" :key="f.id" :value="f.id">{{ f.name }}</option>
          </AppSelect>
        </AppCheckbox>
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
import AppSelect from '@/components/common/AppSelect.vue';
import AppCheckbox from '@/components/common/AppCheckbox.vue';

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
