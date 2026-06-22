import type { CurrencyOption, TaxBehavior } from '@/types/subscription.types'

export function detectCurrency(): string {
  try {
    const region = new Intl.Locale(navigator.language).region ?? 'US'
    const eurozone = ['AT','BE','CY','EE','FI','FR','DE','GR','IE','IT','LV','LT','LU','MT','NL','PT','SK','SI','ES']
    if (eurozone.includes(region)) return 'EUR'
    const regionMap: Record<string, string> = { GB: 'GBP', AU: 'AUD', CA: 'CAD', NZ: 'NZD', CH: 'CHF', SE: 'SEK', NO: 'NOK', DK: 'DKK' }
    return regionMap[region] ?? 'USD'
  } catch {
    return 'USD'
  }
}

export function resolveAmount(
  defaultAmount: number | null | undefined,
  defaultCurrency: string | null | undefined,
  currencyOptions: Record<string, CurrencyOption> | null | undefined,
  selectedCurrency: string,
): { amount: number; currency: string; taxBehavior: TaxBehavior | null } | null {
  if (!defaultAmount || !defaultCurrency) return null;
  const sel = selectedCurrency.toLowerCase();
  const base = defaultCurrency.toLowerCase();
  // Stripe surfaces the base currency inside currency_options on read too, so we
  // can always look up its tax_behavior there.
  if (sel === base) {
    return { amount: defaultAmount, currency: base, taxBehavior: currencyOptions?.[base]?.tax_behavior ?? null };
  }
  const opt = currencyOptions?.[sel];
  if (opt?.unit_amount) return { amount: opt.unit_amount, currency: sel, taxBehavior: opt.tax_behavior ?? null };
  return { amount: defaultAmount, currency: base, taxBehavior: currencyOptions?.[base]?.tax_behavior ?? null };
}

/**
 * Short, qualitative tax hint to show next to a price. We deliberately never
 * render a computed tax *amount* — only Stripe knows the exact rate at checkout
 * (it depends on the customer's location + our registrations), and a wrong
 * number on our own page is exactly what causes disputes. This only sets the
 * expectation: inclusive prices are final, exclusive prices get tax on top.
 */
export function taxNote(taxBehavior: TaxBehavior | null | undefined): string | null {
  if (taxBehavior === 'inclusive') return 'incl. VAT'
  if (taxBehavior === 'exclusive') return '+ tax'
  return null
}

export function availableCurrencies(
  defaultCurrency: string | null | undefined,
  ...currencyOptionsMaps: (Record<string, { unit_amount: number }> | null | undefined)[]
): string[] {
  const set = new Set<string>();
  if (defaultCurrency) set.add(defaultCurrency.toUpperCase());
  for (const opts of currencyOptionsMaps) {
    for (const key of Object.keys(opts ?? {})) set.add(key.toUpperCase());
  }
  return [...set].sort();
}

export function formatCents(cents: number, currency: string): string {
  return new Intl.NumberFormat(navigator.language, {
    style: 'currency',
    currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(cents / 100)
}
