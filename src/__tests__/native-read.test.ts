import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { Platform } from 'react-native';
import type { DiagnosticEvent } from '../NativeCashtap';
import {
  nativeCancelRead,
  nativeReadCard,
  nativeStartReaderMode,
  nativeStopReaderMode,
  parseCardRead,
  subscribeDiagnostic,
  subscribeTagDetected,
} from '../native';

const TEST_PAN = '4761739001010010';

const validRead = {
  pan: TEST_PAN,
  panMasked: '476173******0010',
  expiry: '2512',
  brand: 'visa',
  aid: 'A0000000031010',
  applicationLabel: 'VISA CREDITO',
  panSequenceNumber: '01',
  cryptogramPresent: true,
  stepDurationsMs: {
    SELECT_PPSE: 21.5,
    SELECT_AID: 18,
    GET_PROCESSING_OPTIONS: 95.2,
    READ_RECORD: 40,
  },
};

function nativeError(code: string, message: string) {
  return Object.assign(new Error(message), { code });
}

const tagListeners = new Set<(e: { detectedAt: number }) => void>();
const diagnosticListeners = new Set<(e: DiagnosticEvent) => void>();

const mockModule = {
  startReaderMode: jest.fn<() => Promise<void>>(),
  stopReaderMode: jest.fn<() => Promise<void>>(),
  readCard:
    jest.fn<
      (
        amount: number,
        currency: string,
        diagnostics: boolean
      ) => Promise<string>
    >(),
  cancelRead: jest.fn(),
  onTagDetected: jest.fn((listener: (e: { detectedAt: number }) => void) => {
    tagListeners.add(listener);
    return { remove: () => tagListeners.delete(listener) };
  }),
  onDiagnostic: jest.fn((listener: (e: DiagnosticEvent) => void) => {
    diagnosticListeners.add(listener);
    return { remove: () => diagnosticListeners.delete(listener) };
  }),
};

jest.mock('../NativeCashtap', () => ({
  __esModule: true,
  get default() {
    return mockModule;
  },
}));

describe('fronteira nativa: sessão e leitura', () => {
  beforeEach(() => {
    jest.replaceProperty(Platform, 'OS', 'android');
    tagListeners.clear();
    diagnosticListeners.clear();
    jest.clearAllMocks();
  });

  describe('startReaderMode', () => {
    it('resolve ok quando o nativo liga o reader mode', async () => {
      mockModule.startReaderMode.mockResolvedValue();
      await expect(nativeStartReaderMode()).resolves.toEqual({ ok: true });
    });

    it.each(['NFC_UNSUPPORTED', 'NFC_DISABLED'])(
      'RN-01: rejeição %s vira falha como valor, sem exceção',
      async (code) => {
        mockModule.startReaderMode.mockRejectedValue(nativeError(code, code));
        await expect(nativeStartReaderMode()).resolves.toMatchObject({
          ok: false,
          code,
        });
      }
    );

    it('código desconhecido vira UNKNOWN', async () => {
      mockModule.startReaderMode.mockRejectedValue(
        nativeError('E_WEIRD', 'falhou')
      );
      await expect(nativeStartReaderMode()).resolves.toEqual({
        ok: false,
        code: 'UNKNOWN',
        detail: 'falhou',
      });
    });

    it('fora do Android responde NFC_UNSUPPORTED', async () => {
      jest.replaceProperty(Platform, 'OS', 'ios');
      await expect(nativeStartReaderMode()).resolves.toMatchObject({
        ok: false,
        code: 'NFC_UNSUPPORTED',
      });
    });
  });

  describe('stopReaderMode', () => {
    it('RN-11: nunca lança, mesmo se o nativo falhar', async () => {
      mockModule.stopReaderMode.mockRejectedValue(new Error('x'));
      await expect(nativeStopReaderMode()).resolves.toBeUndefined();
    });

    it('fora do Android não faz nada', async () => {
      jest.replaceProperty(Platform, 'OS', 'ios');
      await nativeStopReaderMode();
      expect(mockModule.stopReaderMode).not.toHaveBeenCalled();
    });
  });

  describe('readCard', () => {
    it('repassa valor, moeda e diagnóstico ao nativo e valida o resultado', async () => {
      mockModule.readCard.mockResolvedValue(JSON.stringify(validRead));

      const outcome = await nativeReadCard(1050, '0986', true);

      expect(mockModule.readCard).toHaveBeenCalledWith(1050, '0986', true);
      expect(outcome).toEqual({ ok: true, card: validRead });
    });

    it.each([
      'CARD_REMOVED',
      'UNSUPPORTED_BRAND',
      'PROTOCOL_ERROR',
      'PARSE_ERROR',
      'INCOMPLETE_DATA',
      'CANCELLED_BY_USER',
    ])('erro %s do nativo vira falha como valor', async (code) => {
      mockModule.readCard.mockRejectedValue(nativeError(code, 'detalhe'));
      await expect(nativeReadCard(100, '0986', false)).resolves.toEqual({
        ok: false,
        code,
        detail: 'detalhe',
      });
    });

    it('rejeição sem código vira UNKNOWN', async () => {
      mockModule.readCard.mockRejectedValue('boom');
      await expect(nativeReadCard(100, '0986', false)).resolves.toMatchObject({
        ok: false,
        code: 'UNKNOWN',
      });
    });

    it('INV-4: JSON fora do contrato vira PARSE_ERROR sem vazar o conteúdo (RN-23)', async () => {
      mockModule.readCard.mockResolvedValue(
        JSON.stringify({ ...validRead, expiry: undefined })
      );
      const outcome = await nativeReadCard(100, '0986', false);
      expect(outcome).toMatchObject({ ok: false, code: 'PARSE_ERROR' });
      expect(JSON.stringify(outcome)).not.toContain(TEST_PAN);
    });

    it('fora do Android falha como UNKNOWN', async () => {
      jest.replaceProperty(Platform, 'OS', 'ios');
      await expect(nativeReadCard(100, '0986', false)).resolves.toMatchObject({
        ok: false,
        code: 'UNKNOWN',
      });
    });
  });

  describe('parseCardRead (INV-4, RN-21)', () => {
    const variants: Array<[string, Record<string, unknown>]> = [
      ['PAN ausente', { pan: undefined }],
      ['PAN com letras', { pan: '47617390010100AB' }],
      ['PAN curto', { pan: '41111' }],
      ['máscara igual ao PAN', { panMasked: TEST_PAN }],
      ['máscara só de asteriscos', { panMasked: '*'.repeat(16) }],
      ['máscara de outro PAN', { panMasked: '411111******1111' }],
      ['validade ausente', { expiry: undefined }],
      ['mês 13', { expiry: '2513' }],
      ['bandeira desconhecida', { brand: 'elo' }],
      ['AID não hex', { aid: 'xyz' }],
      ['rótulo não string', { applicationLabel: 3 }],
      ['criptograma não booleano', { cryptogramPresent: 'sim' }],
      ['etapa faltando', { stepDurationsMs: { SELECT_PPSE: 1 } }],
      [
        'duração negativa',
        { stepDurationsMs: { ...validRead.stepDurationsMs, READ_RECORD: -1 } },
      ],
    ];

    it.each(variants)('rejeita: %s', (_, patch) => {
      expect(
        parseCardRead(JSON.stringify({ ...validRead, ...patch }))
      ).toBeNull();
    });

    it('rejeita JSON inválido e não-objeto', () => {
      expect(parseCardRead('{')).toBeNull();
      expect(parseCardRead('[]')).toBeNull();
      expect(parseCardRead('null')).toBeNull();
    });

    it('aceita campos opcionais ausentes, sem criar chaves undefined', () => {
      const { applicationLabel, panSequenceNumber, ...minimal } = validRead;
      expect(applicationLabel).toBeDefined();
      expect(panSequenceNumber).toBeDefined();
      const parsed = parseCardRead(JSON.stringify(minimal));
      expect(parsed).toMatchObject({ pan: TEST_PAN });
      expect(parsed).not.toHaveProperty('applicationLabel');
    });

    it('descarta chaves extras nas durações', () => {
      const parsed = parseCardRead(
        JSON.stringify({
          ...validRead,
          stepDurationsMs: { ...validRead.stepDurationsMs, EXTRA: 1 },
        })
      );
      expect(parsed?.stepDurationsMs).toEqual(validRead.stepDurationsMs);
    });
  });

  it('RN-10: cancelRead delega ao nativo', () => {
    nativeCancelRead();
    expect(mockModule.cancelRead).toHaveBeenCalledTimes(1);
  });

  describe('eventos', () => {
    it('E2-H2: onTagDetected chega ao listener e para após remover', () => {
      const listener = jest.fn();
      const unsubscribe = subscribeTagDetected(listener);

      tagListeners.forEach((l) => l({ detectedAt: 1 }));
      unsubscribe();
      tagListeners.forEach((l) => l({ detectedAt: 2 }));

      expect(listener).toHaveBeenCalledTimes(1);
    });

    it('E7-H3: diagnóstico repassa trocas com etapa válida e descarta as demais', () => {
      const listener = jest.fn();
      subscribeDiagnostic(listener);
      const exchange = {
        step: 'SELECT_PPSE',
        command: '00A404000E325041592E5359532E444446303100',
        response: '6F23',
        sw: '9000',
        durationMs: 12,
      };

      diagnosticListeners.forEach((l) => l(exchange));
      diagnosticListeners.forEach((l) => l({ ...exchange, step: 'BOGUS' }));

      expect(listener).toHaveBeenCalledTimes(1);
      expect(listener).toHaveBeenCalledWith(exchange);
    });

    it('fora do Android as assinaturas são inofensivas', () => {
      jest.replaceProperty(Platform, 'OS', 'ios');
      expect(() => subscribeTagDetected(jest.fn())()).not.toThrow();
      expect(() => subscribeDiagnostic(jest.fn())()).not.toThrow();
      nativeCancelRead();
      expect(mockModule.cancelRead).not.toHaveBeenCalled();
    });
  });
});
