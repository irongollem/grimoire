import { computed } from "vue";
import { usePlan } from "@/composables/billing/usePlan";
import { detectCurrency, formatCents, resolveAmount } from "@/lib/pricing";

/**
 * The Pro plan's price and monthly credit allowance, in the viewer's detected
 * currency — what an upsell needs to say "Pro DM, €X/mo, N credits a month".
 *
 * Prices come from the Stripe-synced columns (the single source of truth), not
 * the legacy `prices` jsonb, which the admin Stripe sync does not populate and
 * would drift from the amount actually charged. BillingView keeps its own
 * wiring because it lets the viewer switch currency; the upsell dialogs do not.
 */
export function useProPricing() {
  const { data: proPlan } = usePlan("pro");
  const currency = detectCurrency();

  const monthly = computed(() =>
    resolveAmount(
      proPlan.value?.stripe_monthly_unit_amount,
      proPlan.value?.stripe_currency,
      proPlan.value?.stripe_monthly_currency_options,
      currency,
    ),
  );
  const annual = computed(() =>
    resolveAmount(
      proPlan.value?.stripe_annual_unit_amount,
      proPlan.value?.stripe_currency,
      proPlan.value?.stripe_annual_currency_options,
      currency,
    ),
  );

  const monthlyLabel = computed(() =>
    monthly.value ? formatCents(monthly.value.amount, monthly.value.currency) : null,
  );
  const yearlyLabel = computed(() =>
    annual.value ? formatCents(annual.value.amount, annual.value.currency) : null,
  );
  const savedMonths = computed(() => {
    const mo = monthly.value;
    const yr = annual.value;
    if (!mo || !yr) return 0;
    return Math.round((mo.amount * 12 - yr.amount) / mo.amount);
  });
  const monthlyCredits = computed(() => proPlan.value?.monthly_credits ?? 0);

  return { monthlyLabel, yearlyLabel, savedMonths, monthlyCredits };
}
