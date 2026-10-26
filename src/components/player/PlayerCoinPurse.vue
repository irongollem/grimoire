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
        <p class="text-eyebrow text-muted-foreground mb-2">
          Drop to Chat
        </p>
        <div class="grid grid-cols-5 gap-1.5 mb-3">
          <div
            v-for="coin in COINS"
            :key="coin.key"
            class="flex flex-col items-center gap-1"
          >
            <span
              class="text-label font-bold"
              :class="coin.color"
              :title="coin.label"
            >{{ coin.symbol }}</span>
            <input
              :value="coinDrop[coin.key]"
              type="number"
              min="0"
              :max="memberCoins[coin.key]"
              class="w-full bg-muted/30 border border-border rounded px-1 py-0.5 text-heading-sm text-foreground text-center focus:outline-none focus:ring-1 focus:ring-ring"
              :class="coinDrop[coin.key] > memberCoins[coin.key] ? 'border-destructive' : ''"
              :title="`Max: ${memberCoins[coin.key]}`"
              @input="$emit('update-drop', coin.key, Number(($event.target as HTMLInputElement).value))"
            />
            <span class="text-label text-muted-foreground/60">/ {{ memberCoins[coin.key] }}</span>
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
            <option v-for="m in coinGiveRecipients" :key="m.id" :value="m.id">{{ m.name }}</option>
          </AppSelect>
        </label>
        <div class="grid grid-cols-5 gap-1.5 mb-2">
          <label
            v-for="coin in COINS"
            :key="coin.key"
            class="flex flex-col items-center gap-1"
          >
            <span class="text-label font-bold" :class="coin.color" :title="coin.label">{{ coin.symbol }}</span>
            <AppInput
              :model-value="String(coinGive[coin.key])"
              type="number"
              min="0"
              size="body-xs"
              align="center"
              :aria-label="`${coin.label} to give`"
              :class="coinGive[coin.key] > memberCoins[coin.key] || coinGive[coin.key] < 0 ? 'border-destructive' : ''"
              @update:model-value="(v) => $emit('update-give', coin.key, Number(v))"
            />
          </label>
        </div>
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
import { COINS } from '@/rules/currency';
import type { CoinKey } from '@/types/downtime.types';
import { IconCoins, IconMessage } from '@/lib/icons';
import type { PartyMember } from '@/types/party.types';
import AppInput from '@/components/common/controls/AppInput.vue';
import AppSelect from '@/components/common/controls/AppSelect.vue';
import AppButton from '@/components/common/controls/AppButton.vue';
import CoinRow from '@/components/inventory/CoinRow.vue';

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
  memberCoins: Record<CoinKey, number>;
  showCoinDrop: boolean;
  coinDrop: Record<CoinKey, number>;
  coinDropHasValue: boolean;
  coinDropOverLimit: boolean;
  showCoinGive: boolean;
  coinGive: Record<CoinKey, number>;
  coinGiveTo: string;
  /** Party members other than this character. */
  coinGiveRecipients: PartyMember[];
  coinGiveCanSend: boolean;
  coinGiveLeaves: string;
  coinGiveLabel: string;
}>();

defineEmits<{
  'set-currency': [key: CoinKey, value: number];
  'open-drop': [];
  'cancel-drop': [];
  'submit-drop': [];
  'update-drop': [key: CoinKey, value: number];
  'open-give': [];
  'cancel-give': [];
  'submit-give': [];
  'update-give': [key: CoinKey, value: number];
  'update-give-to': [memberId: string];
}>();
</script>
