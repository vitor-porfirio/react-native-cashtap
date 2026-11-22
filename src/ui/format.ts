/** ISO 4217 numérico → alfabético e casas decimais (expoente da unidade menor). */
const CURRENCIES: Record<string, { alpha: string; exponent: number }> = {
  '986': { alpha: 'BRL', exponent: 2 },
  '840': { alpha: 'USD', exponent: 2 },
  '978': { alpha: 'EUR', exponent: 2 },
  '032': { alpha: 'ARS', exponent: 2 },
  '152': { alpha: 'CLP', exponent: 0 },
  '858': { alpha: 'UYU', exponent: 2 },
};

function manual(prefix: string, value: number, exponent: number): string {
  const [int, decimals] = value.toFixed(exponent).split('.');
  const grouped = (int ?? '0').replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return `${prefix} ${grouped}${decimals ? `,${decimals}` : ''}`;
}

/**
 * Valor na unidade menor da moeda (centavos), formatado (§12.3: a formatação só existe
 * na UI). Moeda fora da tabela mostra o código numérico, nunca um símbolo errado.
 */
export function formatAmount(
  amountCents: number,
  currencyCode: string
): string {
  const currency = CURRENCIES[currencyCode];
  if (!currency) return manual(currencyCode, amountCents / 100, 2);
  const value = amountCents / 10 ** currency.exponent;
  try {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: currency.alpha,
      minimumFractionDigits: currency.exponent,
      maximumFractionDigits: currency.exponent,
    }).format(value);
  } catch {
    // Ambiente sem Intl completo: formato manual.
    const prefix = currency.alpha === 'BRL' ? 'R$' : currency.alpha;
    return manual(prefix, value, currency.exponent);
  }
}

/** AAMM → MM/AA. */
export function formatExpiry(expiry: string): string {
  return /^\d{4}$/.test(expiry)
    ? `${expiry.slice(2)}/${expiry.slice(0, 2)}`
    : expiry;
}

export function brandLabel(brand: string): string {
  return brand === 'visa'
    ? 'Visa'
    : brand === 'mastercard'
      ? 'Mastercard'
      : brand;
}
