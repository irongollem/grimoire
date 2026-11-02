import { computed, type ComputedRef } from "vue";
import { useCampaignStore } from "@/stores/campaign";
import { activeGameSystem, defaultCurrencyFor } from "@/systems/registry";
import {
  formatCoins as formatWith,
  parsePrice as parseWith,
  type Coins,
  type CurrencyConfig,
} from "@/lib/currency/currency";

/** The active campaign's currency, or its game system's default outside a campaign. */
export function useCurrency(): {
  currency: ComputedRef<CurrencyConfig>;
  formatCoins: (coins: Coins) => string;
  parsePrice: (text: string) => Coins | null;
} {
  const store = useCampaignStore();
  const currency = computed<CurrencyConfig>(
    () => store.activeCampaign?.currency ?? defaultCurrencyFor(activeGameSystem()),
  );
  return {
    currency,
    formatCoins: (coins) => formatWith(coins, currency.value),
    parsePrice: (text) => parseWith(text, currency.value),
  };
}
