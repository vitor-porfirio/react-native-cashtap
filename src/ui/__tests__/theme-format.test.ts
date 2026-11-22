import { describe, expect, it } from '@jest/globals';
import { brandLabel, formatAmount, formatExpiry } from '../format';
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

  it('cor não hexadecimal não quebra a derivação', () => {
    const { theme } = resolveAppearance({
      colors: { primary: 'rgb(1,2,3)', success: 'green', error: 'red' },
    });
    expect(theme.colors.primary).toBe('rgb(1,2,3)');
    expect(theme.colors.primaryStrong).toBe(DARK_COLORS.primaryStrong);
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

  it('moeda desconhecida cai no formato manual', () => {
    expect(formatAmount(500, '999')).toBe('R$ 5,00');
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
