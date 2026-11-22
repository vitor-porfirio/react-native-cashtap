/**
 * Tema do modal (E6-H3), a partir dos tokens do design (`docs/design/cashtap-tokens.json`).
 * O integrador muda como o fluxo parece, nunca o que acontece: nenhum token altera transições.
 */
export type CashTapColors = {
  primary: string;
  primaryStrong: string;
  primarySoft: string;
  onPrimary: string;
  /** Fundo da folha do modal. */
  background: string;
  /** Véu sobre o app hospedeiro. */
  scrim: string;
  /** Superfície translúcida (botões secundários, chips, cartões). */
  surface: string;
  surfaceStrong: string;
  border: string;
  /** Traço de ilustrações (silhueta do celular). */
  line: string;
  text: string;
  textMuted: string;
  success: string;
  successSoft: string;
  onSuccess: string;
  error: string;
  errorSoft: string;
  warning: string;
  warningSoft: string;
  onWarning: string;
  /** Cartão ilustrado. */
  card: string;
};

export type CashTapTexts = {
  brandName: string;
  secureBadge: string;
  amountLabel: string;
  checkingTitle: string;
  checkingHint: string;
  waitingTitle: string;
  waitingHint: string;
  waitingRetryHint: string;
  readingTitle: string;
  readingHint: string;
  cancelling: string;
  recoverableTitle: string;
  processingTitle: string;
  processingHint: string;
  successTitle: string;
  successHint: string;
  timeoutTitle: string;
  /** `{seconds}` é substituído. */
  timeoutHint: string;
  errorTitle: string;
  unsupportedBrandTitle: string;
  nfcDisabledTitle: string;
  nfcDisabledHint: string;
  cancel: string;
  close: string;
  openSettings: string;
  recheck: string;
  /** `{current}` e `{total}` são substituídos. */
  attempt: string;
  expiryLabel: string;
};

export type CashTapTheme = {
  colors: CashTapColors;
  /** Fonte do texto; `undefined` usa a fonte do sistema. */
  fontFamily?: string;
  /** Fonte monoespaçada (número mascarado, códigos). */
  monoFontFamily: string;
  /** Raio de botões e cartões; a folha usa o dobro. */
  borderRadius: number;
};

/** Aparência informada pelo integrador: tudo opcional, mesclado sobre o padrão. */
export type CashTapAppearance = {
  /** Base: `'dark'` (padrão) ou `'light'`. */
  mode?: 'dark' | 'light';
  colors?: Partial<CashTapColors>;
  fontFamily?: string;
  borderRadius?: number;
  texts?: Partial<CashTapTexts>;
};

export const DARK_COLORS: CashTapColors = {
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
};

export const LIGHT_COLORS: CashTapColors = {
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
};

export const DEFAULT_TEXTS: CashTapTexts = {
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
};

export const DEFAULT_THEME: CashTapTheme = {
  colors: DARK_COLORS,
  fontFamily: undefined,
  monoFontFamily: 'monospace',
  borderRadius: 16,
};

export type ResolvedAppearance = { theme: CashTapTheme; texts: CashTapTexts };

// ---- Derivação de cores (tokens.sdkTheme.derived) ----

function parseHex(color: string): [number, number, number] | null {
  const match = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(
    color.trim()
  );
  if (!match) return null;
  return [
    parseInt(match[1] ?? '0', 16),
    parseInt(match[2] ?? '0', 16),
    parseInt(match[3] ?? '0', 16),
  ];
}

function toHex([r, g, b]: [number, number, number]): string {
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
function mix(
  color: string,
  target: [number, number, number],
  amount: number
): string | null {
  const rgb = parseHex(color);
  if (!rgb) return null;
  return toHex([
    rgb[0] + (target[0] - rgb[0]) * amount,
    rgb[1] + (target[1] - rgb[1]) * amount,
    rgb[2] + (target[2] - rgb[2]) * amount,
  ]);
}

function alpha(color: string, opacity: number): string | null {
  const rgb = parseHex(color);
  return rgb ? `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, ${opacity})` : null;
}

/**
 * Quando o integrador troca só a cor base (ex.: `primary`), as variações que ele não
 * informou são derivadas dela — senão o tema ficaria metade na cor nova, metade violeta.
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
    derive('primaryStrong', mix(overrides.primary, [0, 0, 0], 0.12));
    derive('primarySoft', mix(overrides.primary, [255, 255, 255], 0.25));
    derive('card', overrides.primary);
  }
  if (overrides.success) derive('successSoft', alpha(overrides.success, 0.25));
  if (overrides.error) derive('errorSoft', alpha(overrides.error, 0.12));
  return colors;
}

function defined<T extends object>(value: Partial<T> | undefined): Partial<T> {
  if (!value) return {};
  return Object.fromEntries(
    Object.entries(value).filter(([, v]) => v !== undefined)
  ) as Partial<T>;
}

/** Mescla camadas de aparência (Provider → captura). Valores ausentes usam o padrão. */
export function resolveAppearance(
  ...layers: Array<CashTapAppearance | undefined>
): ResolvedAppearance {
  const mode = layers.reduce<'dark' | 'light'>((m, l) => l?.mode ?? m, 'dark');
  let colors = mode === 'light' ? LIGHT_COLORS : DARK_COLORS;
  let texts = DEFAULT_TEXTS;
  let fontFamily = DEFAULT_THEME.fontFamily;
  let borderRadius = DEFAULT_THEME.borderRadius;
  for (const layer of layers) {
    if (!layer) continue;
    colors = deriveColors(colors, defined(layer.colors));
    texts = { ...texts, ...defined(layer.texts) };
    if (layer.fontFamily !== undefined) fontFamily = layer.fontFamily;
    if (layer.borderRadius !== undefined) borderRadius = layer.borderRadius;
  }
  return {
    theme: {
      colors,
      fontFamily,
      monoFontFamily: DEFAULT_THEME.monoFontFamily,
      borderRadius,
    },
    texts,
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
