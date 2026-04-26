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

export function formatCents(cents: number, currency: string): string {
  return new Intl.NumberFormat(navigator.language, {
    style: 'currency',
    currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(cents / 100)
}
