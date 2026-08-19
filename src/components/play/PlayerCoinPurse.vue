<template>
  <div class="rounded-lg border border-border bg-card p-4">
    <p class="text-label-lg font-semibold text-muted-foreground mb-3">
      Coin Purse
    </p>
    <div v-if="!hasMember" class="text-center py-4">
      <p class="text-body text-muted-foreground italic">No character selected.</p>
    </div>
    <template v-else>
      <!-- Compact 5-coin grid -->
      <div class="grid grid-cols-5 gap-1.5">
        <CoinRow
          v-for="coin in COINS"
          :key="coin.key"
          :label="coin.label"
          :symbol="coin.symbol"
          :color="coin.color"
          :value="memberCoins[coin.key]"
          @commit="(v) => $emit('set-currency', coin.key, v)"
        />
      </div>

      <!-- Drop form -->
      <div v-if="showCoinDrop" class="mt-3 border-t border-border pt-3">
        <p class="text-eyebrow md:text-sm text-muted-foreground mb-2">
          Drop to Chat
        </p>
        <div class="grid grid-cols-5 gap-1.5 mb-3">
          <div
            v-for="coin in COINS"
            :key="coin.key"
            class="flex flex-col items-center gap-1"
          >
            <span
              class="font-cinzel text-2xs md:text-sm font-bold"
              :class="coin.color"
              :title="coin.label"
            >{{ coin.symbol }}</span>
            <input
              :value="coinDrop[coin.key]"
              type="number"
              min="0"
              :max="memberCoins[coin.key]"
              class="w-full bg-muted/30 border border-border rounded px-1 py-0.5 font-cinzel text-sm text-foreground text-center focus:outline-none focus:ring-1 focus:ring-ring"
              :class="coinDrop[coin.key] > memberCoins[coin.key] ? 'border-destructive' : ''"
              :title="`Max: ${memberCoins[coin.key]}`"
              @input="$emit('update-drop', coin.key, Number(($event.target as HTMLInputElement).value))"
            />
            <span class="font-cinzel text-2xs md:text-sm text-muted-foreground/60">/ {{ memberCoins[coin.key] }}</span>
          </div>
        </div>
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
      <AppButton
        v-else
        variant="subtle"
        size="sm"
        block
        class="mt-2 border-dashed"
        :icon="IconMessage"
        icon-size="xs"
        label="Drop Coins to Chat"
        @click="$emit('open-drop')"
      />
    </template>
  </div>
</template>

<script setup lang="ts">
import { COINS, type CoinKey } from '@/rules/currency';
import { IconMessage } from '@/lib/icons';
import AppButton from '@/components/common/AppButton.vue';
import CoinRow from '@/components/inventory/CoinRow.vue';

const {
  hasMember,
  memberCoins,
  showCoinDrop,
  coinDrop,
  coinDropHasValue,
  coinDropOverLimit,
} = defineProps<{
  hasMember: boolean;
  memberCoins: Record<CoinKey, number>;
  showCoinDrop: boolean;
  coinDrop: Record<CoinKey, number>;
  coinDropHasValue: boolean;
  coinDropOverLimit: boolean;
}>();

defineEmits<{
  'set-currency': [key: CoinKey, value: number];
  'open-drop': [];
  'cancel-drop': [];
  'submit-drop': [];
  'update-drop': [key: CoinKey, value: number];
}>();
</script>
