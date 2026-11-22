import type { CashTapAppearance, CashTapColors, CashTapTexts } from '../types';

/**
 * Tema do modal (E6-H3), a partir dos tokens do design (tabela em D019).
 * O integrador muda como o fluxo parece, nunca o que acontece: nenhum token altera transições.
 */
export type { CashTapAppearance, CashTapColors, CashTapTexts };

export type CashTapTheme = {
  colors: CashTapColors;
  /** Fonte do texto; `undefined` usa a fonte do sistema. */
  fontFamily?: string;
  /** Fonte monoespaçada (número mascarado, códigos). */
  monoFontFamily: string;
  /** Raio de botões e cartões; a folha usa o dobro. */
  borderRadius: number;
};

export const DARK_COLORS: Readonly<CashTapColors> = Object.freeze({
  primary: '#7C4DFF',
  primaryStrong: '#5A2EE6',
  primarySoft: '#B79CFF',
  onPrimary: '#FFFFFF',
  // Sem blur (zero dependências nativas, D019): folha quase opaca para manter o contraste.
  background: 'rgba(28, 18, 58, 0.97)',
  scrim: 'rgba(6, 3, 15, 0.62)',
  surface: 'rgba(255, 255, 255, 0.07)',
  surfaceStrong: 'rgba(255, 255, 255, 0.14)',
  border: 'rgba(255, 255, 255, 0.14)',
  line: 'rgba(255, 255, 255, 0.24)',
  text: '#F5F2FF',
  textMuted: '#B9B0DA',
  success: '#3DDC97',
  successSoft: 'rgba(61, 220, 151, 0.28)',
  onSuccess: '#05291A',
  error: '#FF7A8C',
  errorSoft: 'rgba(255, 122, 140, 0.16)',
  warning: '#FFC46B',
  warningSoft: 'rgba(255, 196, 107, 0.16)',
  onWarning: '#2E1C00',
  card: '#7B52F0',
});

export const LIGHT_COLORS: Readonly<CashTapColors> = Object.freeze({
  primary: '#6A3BF0',
  primaryStrong: '#4F22D6',
  primarySoft: '#8E6BFF',
  onPrimary: '#FFFFFF',
  background: 'rgba(255, 255, 255, 0.98)',
  scrim: 'rgba(30, 20, 60, 0.32)',
  surface: 'rgba(90, 46, 230, 0.06)',
  surfaceStrong: 'rgba(90, 46, 230, 0.12)',
  border: 'rgba(90, 46, 230, 0.14)',
  line: 'rgba(40, 20, 90, 0.24)',
  text: '#160F2E',
  textMuted: '#544C72',
  success: '#0E8A5A',
  successSoft: 'rgba(14, 138, 90, 0.25)',
  onSuccess: '#FFFFFF',
  error: '#C8264A',
  errorSoft: 'rgba(200, 38, 74, 0.10)',
  warning: '#B26F00',
  warningSoft: 'rgba(178, 111, 0, 0.12)',
  onWarning: '#FFFFFF',
  card: '#6A3BF0',
});

export const DEFAULT_TEXTS: Readonly<CashTapTexts> = Object.freeze({
  brandName: 'CashTap',
  secureBadge: 'Leitura segura',
  amountLabel: 'Valor a cobrar',
  checkingTitle: 'Verificando…',
  checkingHint: 'Preparando o leitor NFC',
  waitingTitle: 'Aproxime o cartão',
  waitingHint: 'Encoste o cartão na parte de trás do celular, perto da câmera',
  waitingRetryHint: 'Aproxime o cartão novamente e mantenha-o parado',
  readingTitle: 'Lendo cartão… não afaste',
  readingHint: 'Mantenha o cartão parado por um instante',
  stepConnect: 'Conexão',
  stepApplication: 'Aplicação',
  stepAuthorize: 'Autorização',
  stepRecords: 'Dados',
  cancelling: 'Cancelando…',
  recoverableTitle: 'Não foi possível ler. Aproxime novamente.',
  processingTitle: 'Processando…',
  processingHint: 'Validando os dados do cartão',
  successTitle: 'Cartão lido',
  successHint: 'Pode afastar o cartão',
  timeoutTitle: 'Tempo esgotado',
  timeoutHint: 'Nenhum cartão foi aproximado em {seconds} segundos.',
  errorTitle: 'Não foi possível concluir',
  unsupportedBrandTitle: 'Cartão não aceito',
  nfcDisabledTitle: 'NFC desligado',
  nfcDisabledHint:
    'Ative o NFC em Configurações › Conexões para receber pagamentos por aproximação.',
  cancel: 'Cancelar',
  close: 'Fechar',
  openSettings: 'Abrir configurações',
  recheck: 'Verificar novamente',
  attempt: 'Tentativa {current} de {total}',
  expiryLabel: 'Validade',
});

export const DEFAULT_THEME: CashTapTheme = {
  colors: DARK_COLORS,
  fontFamily: undefined,
  monoFontFamily: 'monospace',
  borderRadius: 16,
};

export type ResolvedAppearance = {
  theme: CashTapTheme;
  texts: CashTapTexts;
  haptics: boolean;
};

// ---- Derivação de cores (tokens.sdkTheme.derived do design) ----

type Rgb = [number, number, number];

/** `#RRGGBB` ou `rgb(a)(r, g, b[, a])`; o canal alfa é ignorado. */
function parseColor(color: string): Rgb | null {
  const hex = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(color.trim());
  if (hex) {
    return [
      parseInt(hex[1] ?? '0', 16),
      parseInt(hex[2] ?? '0', 16),
      parseInt(hex[3] ?? '0', 16),
    ];
  }
  const rgb =
    /^rgba?\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})\s*(?:,\s*[\d.]+\s*)?\)$/i.exec(
      color.trim()
    );
  if (rgb) {
    return [Number(rgb[1]), Number(rgb[2]), Number(rgb[3])];
  }
  return null;
}

function toHex([r, g, b]: Rgb): string {
  return `#${[r, g, b]
    .map((c) =>
      Math.round(Math.max(0, Math.min(255, c)))
        .toString(16)
        .padStart(2, '0')
    )
    .join('')
    .toUpperCase()}`;
}

/** Mistura `color` com `target` (0 = cor original, 1 = alvo). */
function mix(color: string, target: string, amount: number): string | null {
  const from = parseColor(color);
  const to = parseColor(target);
  if (!from || !to) return null;
  return toHex([
    from[0] + (to[0] - from[0]) * amount,
    from[1] + (to[1] - from[1]) * amount,
    from[2] + (to[2] - from[2]) * amount,
  ]);
}

function alpha(color: string, opacity: number): string | null {
  const rgb = parseColor(color);
  return rgb ? `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, ${opacity})` : null;
}

/**
 * Quando o integrador troca só a cor base (ex.: `primary` ou `text`), as variações que ele
 * não informou são derivadas dela — senão o tema ficaria metade na cor nova, metade no
 * padrão (ex.: texto secundário claro sobre fundo branco, sem contraste).
 */
function deriveColors(
  base: CashTapColors,
  overrides: Partial<CashTapColors>
): CashTapColors {
  const colors = { ...base, ...overrides };
  const derive = (key: keyof CashTapColors, value: string | null) => {
    if (overrides[key] === undefined && value) colors[key] = value;
  };
  if (overrides.primary) {
    derive('primaryStrong', mix(overrides.primary, '#000000', 0.12));
    derive('primarySoft', mix(overrides.primary, '#FFFFFF', 0.25));
    derive('card', overrides.primary);
  }
  if (overrides.text || overrides.background) {
    derive('textMuted', mix(colors.text, colors.background, 0.3));
  }
  if (overrides.text) {
    derive('surface', alpha(overrides.text, 0.07));
    derive('surfaceStrong', alpha(overrides.text, 0.14));
    derive('border', alpha(overrides.text, 0.14));
    derive('line', alpha(overrides.text, 0.24));
  }
  if (overrides.success) derive('successSoft', alpha(overrides.success, 0.25));
  if (overrides.error) derive('errorSoft', alpha(overrides.error, 0.12));
  return colors;
}

/**
 * Só strings não vazias entram: um integrador JS que passe outro tipo (ex.: objeto em
 * `texts`) não pode derrubar a árvore no meio de uma captura.
 */
function strings<T extends object>(value: unknown): Partial<T> {
  if (!value || typeof value !== 'object') return {};
  return Object.fromEntries(
    Object.entries(value).filter(
      ([, v]) => typeof v === 'string' && v.length > 0
    )
  ) as Partial<T>;
}

/** Mescla camadas de aparência (Provider → captura). Valores ausentes ou inválidos usam o padrão. */
export function resolveAppearance(
  ...layers: Array<CashTapAppearance | undefined>
): ResolvedAppearance {
  const mode = layers.reduce<'dark' | 'light'>(
    (m, l) => (l?.mode === 'light' || l?.mode === 'dark' ? l.mode : m),
    'dark'
  );
  let colors: CashTapColors = mode === 'light' ? LIGHT_COLORS : DARK_COLORS;
  let texts: CashTapTexts = DEFAULT_TEXTS;
  let fontFamily = DEFAULT_THEME.fontFamily;
  let borderRadius = DEFAULT_THEME.borderRadius;
  let haptics = true;
  for (const layer of layers) {
    if (!layer) continue;
    colors = deriveColors(colors, strings<CashTapColors>(layer.colors));
    texts = { ...texts, ...strings<CashTapTexts>(layer.texts) };
    if (typeof layer.fontFamily === 'string' && layer.fontFamily) {
      fontFamily = layer.fontFamily;
    }
    if (
      typeof layer.borderRadius === 'number' &&
      Number.isFinite(layer.borderRadius) &&
      layer.borderRadius >= 0
    ) {
      borderRadius = layer.borderRadius;
    }
    if (typeof layer.haptics === 'boolean') haptics = layer.haptics;
  }
  return {
    theme: {
      colors,
      fontFamily,
      monoFontFamily: DEFAULT_THEME.monoFontFamily,
      borderRadius,
    },
    texts,
    haptics,
  };
}

export function fill(
  template: string,
  values: Record<string, string | number>
): string {
  return Object.entries(values).reduce(
    (text, [key, value]) => text.split(`{${key}}`).join(String(value)),
    template
  );
}
