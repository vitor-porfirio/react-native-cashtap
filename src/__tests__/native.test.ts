import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { Platform } from 'react-native';
import { getNfcStatus, onNfcStatusChange, openNfcSettings } from '../api';
import { isNfcStatus } from '../native';

type Listener = (value: string) => void;

const listeners = new Set<Listener>();
const mockModule = {
  getNfcStatus: jest.fn<() => Promise<string>>(),
  openNfcSettings: jest.fn(),
  onNfcStatusChange: jest.fn((listener: Listener) => {
    listeners.add(listener);
    return { remove: () => listeners.delete(listener) };
  }),
};

jest.mock('../NativeCashtap', () => ({
  __esModule: true,
  get default() {
    return mockModule;
  },
}));

function emitNfcStatus(value: string) {
  listeners.forEach((listener) => listener(value));
}

describe('fronteira nativa', () => {
  beforeEach(() => {
    jest.replaceProperty(Platform, 'OS', 'android');
    listeners.clear();
    jest.clearAllMocks();
  });

  describe('getNfcStatus', () => {
    it.each(['READY', 'DISABLED', 'UNSUPPORTED'])(
      'repassa o status %s vindo do nativo',
      async (status) => {
        mockModule.getNfcStatus.mockResolvedValue(status);
        await expect(getNfcStatus()).resolves.toBe(status);
      }
    );

    it('rejeita valor fora do contrato em vez de repassá-lo', async () => {
      mockModule.getNfcStatus.mockResolvedValue('BANANA');
      await expect(getNfcStatus()).rejects.toThrow(/BANANA/);
    });

    it('fora do Android responde UNSUPPORTED sem tocar no nativo', async () => {
      jest.replaceProperty(Platform, 'OS', 'ios');
      await expect(getNfcStatus()).resolves.toBe('UNSUPPORTED');
      expect(mockModule.getNfcStatus).not.toHaveBeenCalled();
    });
  });

  describe('onNfcStatusChange (E1-H3)', () => {
    it('entrega ao listener o payload emitido pelo nativo', () => {
      const listener = jest.fn();
      onNfcStatusChange(listener);

      emitNfcStatus('DISABLED');

      expect(listener).toHaveBeenCalledWith('DISABLED');
    });

    it('não chama o listener depois de removido', () => {
      const listener = jest.fn();
      const unsubscribe = onNfcStatusChange(listener);

      unsubscribe();
      emitNfcStatus('READY');

      expect(listener).not.toHaveBeenCalled();
      expect(listeners.size).toBe(0);
    });

    it('ignora payload fora do contrato', () => {
      const listener = jest.fn();
      onNfcStatusChange(listener);

      emitNfcStatus('BANANA');

      expect(listener).not.toHaveBeenCalled();
    });

    it('fora do Android devolve unsubscribe inofensivo', () => {
      jest.replaceProperty(Platform, 'OS', 'ios');
      const unsubscribe = onNfcStatusChange(jest.fn());
      expect(() => unsubscribe()).not.toThrow();
      expect(mockModule.onNfcStatusChange).not.toHaveBeenCalled();
    });
  });

  describe('openNfcSettings', () => {
    it('delega ao nativo no Android', () => {
      openNfcSettings();
      expect(mockModule.openNfcSettings).toHaveBeenCalledTimes(1);
    });

    it('não faz nada fora do Android', () => {
      jest.replaceProperty(Platform, 'OS', 'ios');
      openNfcSettings();
      expect(mockModule.openNfcSettings).not.toHaveBeenCalled();
    });
  });

  it('isNfcStatus aceita só os três valores do contrato', () => {
    expect(isNfcStatus('READY')).toBe(true);
    expect(isNfcStatus('ready')).toBe(false);
    expect(isNfcStatus(undefined)).toBe(false);
  });
});
