import { describe, expect, it } from '@jest/globals';
import { brandLabel, formatAmount, formatExpiry } from '../format';
import type { CashTapAppearance } from '../../types';
import {
  DARK_COLORS,
  DEFAULT_TEXTS,
  LIGHT_COLORS,
  fill,
  resolveAppearance,
} from '../theme';

describe('resolveAppearance (E6-H3)', () => {
  it('sem tema informado, usa o tema escuro padrão do design', () => {
    const { theme, texts } = resolveAppearance();
    expect(theme.colors).toEqual(DARK_COLORS);
    expect(theme.borderRadius).toBe(16);
    expect(texts).toEqual(DEFAULT_TEXTS);
  });

  it('mode light troca a base inteira', () => {
    expect(resolveAppearance({ mode: 'light' }).theme.colors).toEqual(
      LIGHT_COLORS
    );
  });

  it('aplica cores primária, de fundo e de texto informadas', () => {
    const { theme } = resolveAppearance({
      colors: { primary: '#0B7A55', background: '#FFFFFF', text: '#0E2219' },
    });
    expect(theme.colors).toMatchObject({
      primary: '#0B7A55',
      background: '#FFFFFF',
      text: '#0E2219',
    });
  });

  it('deriva as variações da primária quando o integrador informa só ela', () => {
    const { theme } = resolveAppearance({ colors: { primary: '#0B7A55' } });
    expect(theme.colors.primaryStrong).not.toBe(DARK_COLORS.primaryStrong);
    expect(theme.colors.primarySoft).not.toBe(DARK_COLORS.primarySoft);
    expect(theme.colors.card).toBe('#0B7A55');
    // mais escura e mais clara que a base
    const lum = (hex: string) =>
      parseInt(hex.slice(1, 3), 16) +
      parseInt(hex.slice(3, 5), 16) +
      parseInt(hex.slice(5, 7), 16);
    expect(lum(theme.colors.primaryStrong)).toBeLessThan(lum('#0B7A55'));
    expect(lum(theme.colors.primarySoft)).toBeGreaterThan(lum('#0B7A55'));
  });

  it('variação informada explicitamente não é sobrescrita pela derivação', () => {
    const { theme } = resolveAppearance({
      colors: { primary: '#0B7A55', primaryStrong: '#000000' },
    });
    expect(theme.colors.primaryStrong).toBe('#000000');
  });

  it('cor nomeada (não derivável) não quebra a derivação', () => {
    const { theme } = resolveAppearance({
      colors: { primary: 'purple', success: 'green', error: 'red' },
    });
    expect(theme.colors.primary).toBe('purple');
    expect(theme.colors.primaryStrong).toBe(DARK_COLORS.primaryStrong);
    expect(theme.colors.successSoft).toBe(DARK_COLORS.successSoft);
  });

  it('rgb() também é derivado', () => {
    const { theme } = resolveAppearance({
      colors: { primary: 'rgb(11, 122, 85)' },
    });
    expect(theme.colors.primaryStrong).toBe(
      resolveAppearance({ colors: { primary: '#0B7A55' } }).theme.colors
        .primaryStrong
    );
  });

  it('trocar texto e fundo deriva texto secundário e superfícies (contraste)', () => {
    const { theme } = resolveAppearance({
      colors: { background: '#FFFFFF', text: '#0E2219' },
    });
    // 30% do caminho entre o texto e o fundo: escuro o bastante sobre branco
    expect(theme.colors.textMuted).toBe('#56645E');
    expect(theme.colors.surface).toBe('rgba(14, 34, 25, 0.07)');
    expect(theme.colors.surfaceStrong).toBe('rgba(14, 34, 25, 0.14)');
    expect(theme.colors.border).toBe('rgba(14, 34, 25, 0.14)');
    expect(theme.colors.line).toBe('rgba(14, 34, 25, 0.24)');
  });

  it('só o fundo trocado ainda recalcula o texto secundário', () => {
    const { theme } = resolveAppearance({
      mode: 'light',
      colors: { background: 'rgba(250, 250, 250, 0.9)' },
    });
    expect(theme.colors.textMuted).not.toBe(LIGHT_COLORS.textMuted);
    expect(theme.colors.surface).toBe(LIGHT_COLORS.surface);
  });

  it('aparência inválida vinda de JS sem tipos é ignorada, sem derrubar o modal', () => {
    const { theme, texts, haptics } = resolveAppearance({
      mode: 'neon',
      colors: { primary: 42, text: '' },
      texts: { waitingTitle: { nested: true }, cancel: 'Voltar' },
      fontFamily: 7,
      borderRadius: -3,
      haptics: 'sim',
    } as unknown as CashTapAppearance);
    expect(theme.colors).toEqual(DARK_COLORS);
    expect(texts.waitingTitle).toBe(DEFAULT_TEXTS.waitingTitle);
    expect(texts.cancel).toBe('Voltar');
    expect(theme.fontFamily).toBeUndefined();
    expect(theme.borderRadius).toBe(16);
    expect(haptics).toBe(true);
    expect(
      resolveAppearance({ borderRadius: Infinity }).theme.borderRadius
    ).toBe(16);
  });

  it('haptics pode ser desligado pelo integrador', () => {
    expect(resolveAppearance().haptics).toBe(true);
    expect(resolveAppearance({ haptics: false }).haptics).toBe(false);
  });

  it('paletas e textos padrão são imutáveis', () => {
    expect(Object.isFrozen(DARK_COLORS)).toBe(true);
    expect(Object.isFrozen(LIGHT_COLORS)).toBe(true);
    expect(Object.isFrozen(DEFAULT_TEXTS)).toBe(true);
  });

  it('deriva os tons suaves de sucesso e erro', () => {
    const { theme } = resolveAppearance({
      colors: { success: '#0B7A55', error: '#B42318' },
    });
    expect(theme.colors.successSoft).toBe('rgba(11, 122, 85, 0.25)');
    expect(theme.colors.errorSoft).toBe('rgba(180, 35, 24, 0.12)');
  });

  it('textos customizados substituem os padrões; os não informados mantêm o padrão', () => {
    const { texts } = resolveAppearance({
      texts: { waitingTitle: 'Encoste aqui' },
    });
    expect(texts.waitingTitle).toBe('Encoste aqui');
    expect(texts.readingTitle).toBe(DEFAULT_TEXTS.readingTitle);
  });

  it('camada da captura sobrepõe a do Provider', () => {
    const { theme, texts } = resolveAppearance(
      {
        colors: { primary: '#111111' },
        borderRadius: 4,
        fontFamily: 'Sora',
        texts: { cancel: 'Voltar' },
      },
      { colors: { primary: '#222222' }, mode: 'light' }
    );
    expect(theme.colors.primary).toBe('#222222');
    expect(theme.colors.text).toBe(LIGHT_COLORS.text);
    expect(theme.borderRadius).toBe(4);
    expect(theme.fontFamily).toBe('Sora');
    expect(texts.cancel).toBe('Voltar');
  });

  it('valores undefined não apagam o padrão', () => {
    expect(
      resolveAppearance({ colors: { primary: undefined } }).theme.colors.primary
    ).toBe(DARK_COLORS.primary);
  });

  it('fill substitui todos os marcadores', () => {
    expect(fill(DEFAULT_TEXTS.attempt, { current: 2, total: 3 })).toBe(
      'Tentativa 2 de 3'
    );
    expect(fill(DEFAULT_TEXTS.timeoutHint, { seconds: 30 })).toBe(
      'Nenhum cartão foi aproximado em 30 segundos.'
    );
  });
});

describe('formatação (§12.3)', () => {
  it('E6-H1: valor em centavos formatado em reais', () => {
    expect(formatAmount(1050, '986').replace(/\s/g, ' ')).toBe('R$ 10,50');
    expect(formatAmount(123456789, '986').replace(/\s/g, ' ')).toBe(
      'R$ 1.234.567,89'
    );
  });

  it('moeda fora da tabela mostra o código numérico, nunca um símbolo errado', () => {
    expect(formatAmount(500, '826')).toBe('826 5,00');
    expect(formatAmount(123456, '999')).toBe('999 1.234,56');
  });

  it('respeita o expoente da moeda (CLP não tem centavos)', () => {
    expect(formatAmount(5000, '152').replace(/\s/g, ' ')).toMatch(/5\.000$/);
    expect(formatAmount(5000, '152')).not.toContain(',');
    expect(formatAmount(1050, '840').replace(/\s/g, ' ')).toMatch(/10,50$/);
  });

  it('validade AAMM vira MM/AA', () => {
    expect(formatExpiry('2512')).toBe('12/25');
    expect(formatExpiry('x')).toBe('x');
  });

  it('rótulo da bandeira', () => {
    expect(brandLabel('visa')).toBe('Visa');
    expect(brandLabel('mastercard')).toBe('Mastercard');
    expect(brandLabel('outra')).toBe('outra');
  });
});
