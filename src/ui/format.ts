/** ISO 4217 numérico → alfabético, para formatação. */
const CURRENCY_ALPHA: Record<string, string> = {
  '986': 'BRL',
  '840': 'USD',
  '978': 'EUR',
  '032': 'ARS',
  '152': 'CLP',
  '858': 'UYU',
};

/** Valor em centavos formatado na moeda (§12.3: a formatação só existe na UI). */
export function formatAmount(
  amountCents: number,
  currencyCode: string
): string {
  const currency = CURRENCY_ALPHA[currencyCode];
  const value = amountCents / 100;
  if (currency) {
    try {
      return new Intl.NumberFormat('pt-BR', {
        style: 'currency',
        currency,
      }).format(value);
    } catch {
      // Ambiente sem Intl completo: cai para o formato manual abaixo.
    }
  }
  const prefix = currency === 'BRL' || !currency ? 'R$' : currency;
  const [int, cents] = value.toFixed(2).split('.');
  const grouped = (int ?? '0').replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return `${prefix} ${grouped},${cents}`;
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
