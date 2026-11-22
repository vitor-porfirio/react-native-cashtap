export function formatBRL(cents: number): string {
  const [int, dec] = (cents / 100).toFixed(2).split('.');
  return `R$ ${(int ?? '0').replace(/\B(?=(\d{3})+(?!\d))/g, '.')},${dec}`;
}

/** AAMM → MM/AA */
export function formatExpiry(yymm: string): string {
  return yymm.length === 4 ? `${yymm.slice(2)}/${yymm.slice(0, 2)}` : yymm;
}

export function formatTime(epochMs: number): string {
  const d = new Date(epochMs);
  return [d.getHours(), d.getMinutes(), d.getSeconds()]
    .map((n) => String(n).padStart(2, '0'))
    .join(':');
}

export function formatMs(ms: number): string {
  return `${Math.round(ms).toLocaleString('pt-BR')} ms`;
}

export function formatSeconds(ms: number): string {
  return `${(ms / 1000).toFixed(2).replace('.', ',')} s`;
}
