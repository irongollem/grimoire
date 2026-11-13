<template>
  <div class="rounded-lg border border-border bg-card p-4">
    <p class="text-label-lg font-semibold text-muted-foreground mb-3">
      Coin Purse
    </p>
    <div v-if="!hasMember" class="text-center py-4">
      <p class="text-body text-muted-foreground italic">No character selected.</p>
    </div>
    <template v-else>
      <!-- One row per denomination of the campaign -->
      <div class="grid gap-1.5" :style="gridStyle">
        <CoinRow
          v-for="d in currency.denominations"
          :key="d.key"
          :label="d.name"
          :symbol="d.abbr"
          :color="d.color"
          :value="memberCoins[d.key] ?? 0"
          @adjust="(delta) => $emit('adjust-currency', d.key, delta)"
          @set="(count) => $emit('set-currency', d.key, count)"
        />
      </div>

      <!-- Drop form -->
      <div v-if="showCoinDrop" class="mt-3 border-t border-border pt-3">
        <p class="text-eyebrow text-muted-foreground mb-2">
          Drop to Chat
        </p>
        <CoinInput
          class="mb-3"
          :model-value="coinDrop"
          :max="purseCap"
          @update:model-value="(c) => $emit('update-drop', c ?? {})"
        />
        <div class="flex gap-2">
          <AppButton
            variant="primary"
            size="sm"
            class="flex-1"
            label="Drop"
            :disabled="!coinDropHasValue || coinDropOverLimit"
            @click="$emit('submit-drop')"
          />
          <AppButton
            variant="subtle"
            size="sm"
            label="Cancel"
            @click="$emit('cancel-drop')"
          />
        </div>
      </div>
      <!-- Give form: a slip on the purse, hands coin to another character -->
      <div
        v-else-if="showCoinGive"
        data-slip
        class="mt-3 rounded-md border border-border bg-popover p-3"
      >
        <p class="text-eyebrow text-muted-foreground mb-2">
          Give Coins
        </p>
        <label class="block mb-3">
          <span class="text-label text-muted-foreground">To</span>
          <AppSelect
            :model-value="coinGiveTo"
            block
            aria-label="Give coins to"
            @update:model-value="(v) => $emit('update-give-to', v)"
          >
            <option value="" disabled>Choose who…</option>
            <option v-for="m in coinGiveRecipients" :key="m.id" :value="m.id">{{ m.name }}</option>
          </AppSelect>
        </label>
        <CoinInput
          class="mb-2"
          :model-value="coinGive"
          :max="purseCap"
          @update:model-value="(c) => $emit('update-give', c ?? {})"
        />
        <p class="text-caption text-muted-foreground mb-3">
          {{ coinGiveLeaves }}
        </p>
        <div class="flex gap-2">
          <AppButton
            variant="primary"
            size="sm"
            class="flex-1"
            :label="coinGiveLabel"
            :disabled="!coinGiveCanSend"
            @click="$emit('submit-give')"
          />
          <AppButton variant="subtle" size="sm" label="Cancel" @click="$emit('cancel-give')" />
        </div>
      </div>
      <div v-else class="mt-2 flex flex-col gap-2">
        <AppButton
          variant="subtle"
          size="sm"
          block
          class="border-dashed"
          :icon="IconMessage"
          icon-size="xs"
          label="Drop Coins to Chat"
          @click="$emit('open-drop')"
        />
        <AppButton
          v-if="coinGiveRecipients.length"
          variant="subtle"
          size="sm"
          block
          class="border-dashed"
          :icon="IconCoins"
          icon-size="xs"
          label="Give coins…"
          @click="$emit('open-give')"
        />
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import type { Coins } from '@/lib/currency/currency';
import { useCurrency } from '@/composables/currency/useCurrency';
import { IconCoins, IconMessage } from '@/lib/icons';
import type { PartyMember } from '@/types/party.types';
import AppSelect from '@/components/common/controls/AppSelect.vue';
import AppButton from '@/components/common/controls/AppButton.vue';
import CoinRow from '@/components/inventory/CoinRow.vue';
import CoinInput from '@/components/currency/CoinInput.vue';

const {
  hasMember,
  memberCoins,
  showCoinDrop,
  coinDrop,
  coinDropHasValue,
  coinDropOverLimit,
  showCoinGive,
  coinGive,
  coinGiveTo,
  coinGiveRecipients,
  coinGiveCanSend,
  coinGiveLeaves,
  coinGiveLabel,
} = defineProps<{
  hasMember: boolean;
  memberCoins: Coins;
  showCoinDrop: boolean;
  coinDrop: Coins;
  coinDropHasValue: boolean;
  coinDropOverLimit: boolean;
  showCoinGive: boolean;
  coinGive: Coins;
  coinGiveTo: string;
  /** Party members other than this character. */
  coinGiveRecipients: PartyMember[];
  coinGiveCanSend: boolean;
  coinGiveLeaves: string;
  coinGiveLabel: string;
}>();

defineEmits<{
  'adjust-currency': [key: string, delta: number];
  'set-currency': [key: string, count: number];
  'open-drop': [];
  'cancel-drop': [];
  'submit-drop': [];
  'update-drop': [coins: Coins];
  'open-give': [];
  'cancel-give': [];
  'submit-give': [];
  'update-give': [coins: Coins];
  'update-give-to': [memberId: string];
}>();

const { currency } = useCurrency();
// A coin the purse does not hold caps at 0; CoinInput leaves an absent key uncapped.
const purseCap = computed((): Coins =>
  Object.fromEntries(currency.value.denominations.map((d) => [d.key, memberCoins[d.key] ?? 0])),
);
// Up to five coins to a row; a longer currency wraps rather than squeezing the inputs.
const gridStyle = computed(() => ({
  gridTemplateColumns: `repeat(${Math.min(currency.value.denominations.length, 5)}, minmax(0, 1fr))`,
}));
</script>
