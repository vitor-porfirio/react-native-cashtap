import { describe, expect, it } from '@jest/globals';
import * as main from '../index';
import * as dev from '../dev';

/**
 * D020 — cada export é uma promessa pública. Mudar esta lista é decisão de API
 * (registrar em DECISIONS.md), nunca efeito colateral de refatoração.
 */
describe('superfície pública (D010, D020)', () => {
  it('react-native-cashtap exporta só a API de captura', () => {
    expect(Object.keys(main).sort()).toEqual(
      [
        'CashTapProvider',
        'cancel',
        'capture',
        'getNfcStatus',
        'onNfcStatusChange',
        'onStateChange',
        'openNfcSettings',
      ].sort()
    );
  });

  it('react-native-cashtap/dev reúne diagnóstico e medições', () => {
    expect(Object.keys(dev).sort()).toEqual(
      [
        'CashTapDiagnostics',
        'MEASUREMENT_COLUMNS',
        'diagnosticsToText',
        'getLastDiagnostics',
        'measurementsToCsv',
        'onDiagnosticsChange',
        'toMeasurementRow',
      ].sort()
    );
  });

  it('constantes exportadas são imutáveis', () => {
    expect(Object.isFrozen(dev.MEASUREMENT_COLUMNS)).toBe(true);
  });
});
