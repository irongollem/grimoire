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
  currencyOptions: Record<string, { unit_amount: number }> | null | undefined,
  selectedCurrency: string,
): { amount: number; currency: string } | null {
  if (!defaultAmount || !defaultCurrency) return null;
  const sel = selectedCurrency.toLowerCase();
  const base = defaultCurrency.toLowerCase();
  if (sel === base) return { amount: defaultAmount, currency: base };
  const opt = currencyOptions?.[sel];
  if (opt?.unit_amount) return { amount: opt.unit_amount, currency: sel };
  return { amount: defaultAmount, currency: base };
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
