<template>
  <div
    class="max-w-[90%] rounded-lg border overflow-hidden"
    :class="
      empty
        ? 'border-border bg-muted/40'
        : 'border-amber-500/30 bg-amber-500/5'
    "
  >
    <div class="px-3 py-2 border-b border-border/50 flex items-center gap-2">
      <IconPackageOpen class="h-3.5 w-3.5 text-amber-400 shrink-0" />
      <span class="font-cinzel text-[10px] text-muted-foreground tracking-wider flex-1 truncate">
        {{ senderName }} dropped {{ meta.loot_table_name }}
      </span>
      <span class="font-cinzel text-[10px] text-muted-foreground tracking-wider shrink-0">
        {{ meta.claims?.length ?? 0 }} / {{ meta.claims_total ?? 0 }}
      </span>
    </div>

    <div class="px-3 py-2.5 flex flex-col gap-2.5">
      <img
        v-if="meta.chest_image_url"
        :src="meta.chest_image_url"
        alt="Chest"
        class="w-full rounded object-cover max-h-40"
      />

      <ul class="flex flex-col gap-1.5">
        <li
          v-for="atom in meta.rolled_atoms ?? []"
          :key="atom.atom_id"
          class="flex items-center gap-2 rounded px-2 py-1.5 transition-colors"
          :class="
            atomClaim(atom.atom_id)
              ? 'bg-muted/40 opacity-70'
              : 'bg-muted/20 hover:bg-muted/40'
          "
        >
          <!-- Item atom -->
          <template v-if="(atom.type ?? 'item') === 'item'">
            <img
              v-if="atom.item_image_url"
              :src="atom.item_image_url"
              :alt="atom.item_name"
              class="w-7 h-7 rounded object-cover shrink-0"
            />
            <IconPackage v-else class="w-5 h-5 text-muted-foreground shrink-0" />
            <div class="flex-1 min-w-0">
              <div class="flex items-baseline gap-2">
                <span class="font-fell text-sm font-semibold text-foreground truncate">{{ atom.item_name }}</span>
                <span v-if="atom.item_rarity" class="font-cinzel text-[9px] uppercase tracking-wider text-muted-foreground shrink-0">{{ atom.item_rarity }}</span>
              </div>
              <span v-if="atomClaim(atom.atom_id)" class="font-fell text-[10px] text-muted-foreground italic">
                claimed by {{ atomClaim(atom.atom_id)!.claimed_by_name }}
              </span>
            </div>
          </template>

          <!-- Currency atom -->
          <template v-else-if="atom.type === 'currency'">
            <IconCoins class="w-5 h-5 text-amber-400 shrink-0" />
            <div class="flex-1 min-w-0">
              <div class="flex items-baseline gap-2">
                <span class="font-fell text-sm font-semibold text-foreground truncate">
                  {{ atom.currency_label ? atom.currency_label + ': ' : '' }}{{ formatCoinParts(atom.pp ?? 0, atom.gp ?? 0, atom.ep ?? 0, atom.sp ?? 0, atom.cp ?? 0).join(', ') || '0 GP' }}
                </span>
              </div>
              <span v-if="atomClaim(atom.atom_id)" class="font-fell text-[10px] text-muted-foreground italic">
                claimed by {{ atomClaim(atom.atom_id)!.claimed_by_name }}
              </span>
            </div>
          </template>

          <!-- Fallback (unknown future atom types) -->
          <template v-else>
            <IconPackage class="w-5 h-5 text-muted-foreground shrink-0" />
            <div class="flex-1 min-w-0">
              <span class="font-fell text-sm font-semibold text-foreground truncate">{{ atom.item_name }}</span>
              <span v-if="atomClaim(atom.atom_id)" class="font-fell text-[10px] text-muted-foreground italic block">
                claimed by {{ atomClaim(atom.atom_id)!.claimed_by_name }}
              </span>
            </div>
          </template>

          <button
            v-if="!atomClaim(atom.atom_id) && !empty"
            type="button"
            class="font-cinzel text-[11px] font-semibold tracking-wider px-2.5 py-1 rounded bg-primary text-primary-foreground hover:opacity-90 transition-opacity shrink-0"
            @click="emit('claim-loot-chest', { messageId, atomId: atom.atom_id })"
          >
            Claim
          </button>
        </li>
      </ul>

      <p
        v-if="empty"
        class="font-fell text-[11px] text-muted-foreground italic text-center"
      >
        Chest is empty.
      </p>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { IconCoins, IconPackage, IconPackageOpen } from '@/lib/icons';
import { formatCoinParts } from '@/lib/currency';
import type { LootChestMetadata, LootChestClaim } from '@/types/chat.types';

const {
  messageId,
  meta,
  senderName,
} = defineProps<{
  messageId: string;
  meta: LootChestMetadata;
  senderName: string | null;
}>();

const emit = defineEmits<{
  'claim-loot-chest': [payload: { messageId: string; atomId: string }];
}>();

const empty = computed(
  () => (meta.claims?.length ?? 0) >= (meta.claims_total ?? 0),
);

function atomClaim(atomId: string): LootChestClaim | null {
  return meta.claims?.find(c => c.atom_id === atomId) ?? null;
}
</script>
