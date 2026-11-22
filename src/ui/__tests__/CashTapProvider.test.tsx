import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  jest,
} from '@jest/globals';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { useEffect } from 'react';
import { AccessibilityInfo, StyleSheet, Text, Vibration } from 'react-native';
import {
  __resetForTests,
  __setDepsForTests,
  capture,
} from '../../core/controller';
import { DEFAULT_DISPLAY_DURATIONS, type NativePort } from '../../core/session';
import type {
  DiagnosticExchange,
  NativeCardRead,
  NativeReadOutcome,
} from '../../native';
import type { CaptureResult, NfcStatus } from '../../types';
import { CashTapProvider } from '../CashTapProvider';
import { CHECKING_GRACE_MS } from '../CashTapModal';
import {
  DARK_COLORS,
  DEFAULT_TEXTS,
  type CashTapAppearance,
  type CashTapTexts,
} from '../theme';
import { onStateChange } from '../../core/controller';

const mockOpenSettings = jest.fn();
jest.mock('../../native', () => {
  const actual =
    jest.requireActual<typeof import('../../native')>('../../native');
  return { ...actual, nativeOpenNfcSettings: () => mockOpenSettings() };
});

const card: NativeCardRead = {
  pan: '5413330089010434',
  panMasked: '541333******0434',
  expiry: '2512',
  brand: 'mastercard',
  aid: 'A0000000041010',
  cryptogramPresent: false,
  stepDurationsMs: {
    SELECT_PPSE: 1,
    SELECT_AID: 1,
    GET_PROCESSING_OPTIONS: 1,
    READ_RECORD: 1,
  },
};

class FakeNative implements NativePort {
  startResult: Awaited<ReturnType<NativePort['startReaderMode']>> = {
    ok: true,
  };
  private pendingRead: ((o: NativeReadOutcome) => void) | null = null;
  private tagListeners = new Set<() => void>();
  private diagListeners = new Set<(e: DiagnosticExchange) => void>();
  startReaderMode = jest.fn(async () => this.startResult);
  stopReaderMode = jest.fn(async () => {});
  readCard = jest.fn(
    () =>
      new Promise<NativeReadOutcome>((resolve) => (this.pendingRead = resolve))
  );
  cancelRead = jest.fn();
  onTagDetected = (l: () => void) => {
    this.tagListeners.add(l);
    return () => this.tagListeners.delete(l);
  };
  onNfcStatusChange = (_l: (s: NfcStatus) => void) => () => {};
  onDiagnostic = (l: (e: DiagnosticExchange) => void) => {
    this.diagListeners.add(l);
    return () => this.diagListeners.delete(l);
  };
  tap() {
    this.tagListeners.forEach((l) => l());
  }
  step(step: DiagnosticExchange['step'], sw = '9000') {
    this.diagListeners.forEach((l) =>
      l({ step, command: '', response: '', sw, durationMs: 1 })
    );
  }
  finishRead(o: NativeReadOutcome) {
    this.pendingRead?.(o);
  }
}

let native: FakeNative;

/** Resolve promises pendentes e timers de 0 ms, sempre dentro de um act aguardado. */
async function settle() {
  await act(async () => {
    for (let i = 0; i < 5; i++) {
      await jest.advanceTimersByTimeAsync(0);
    }
  });
}

async function advance(ms: number) {
  await act(async () => {
    await jest.advanceTimersByTimeAsync(ms);
  });
  await settle();
}

const flat = (testID: string) =>
  StyleSheet.flatten(screen.getByTestId(testID).props.style);

async function renderApp(appearance?: CashTapAppearance) {
  return await render(
    <CashTapProvider appearance={appearance}>
      <Text>app do integrador</Text>
    </CashTapProvider>
  );
}

async function start(
  params: Parameters<typeof capture>[0] = { amountCents: 1050 }
) {
  let result: CaptureResult | undefined;
  await act(async () => {
    capture(params).then((r) => (result = r));
  });
  await settle();
  return () => result;
}

beforeEach(() => {
  // Vibration e AccessibilityInfo já são jest.fn no preset do RN: spyOn não zera as chamadas.
  jest.clearAllMocks();
  jest.useFakeTimers();
  native = new FakeNative();
  __resetForTests();
  __setDepsForTests({ native }, { requireUiHost: true });
  jest.spyOn(Vibration, 'vibrate').mockImplementation(() => {});
});

afterEach(() => {
  jest.useRealTimers();
  jest.restoreAllMocks();
});

describe('CashTapProvider (E6-H1)', () => {
  it('sem captura ativa, só o app do integrador aparece', async () => {
    await renderApp();
    expect(screen.getByText('app do integrador')).toBeTruthy();
    expect(screen.queryByTestId('cashtap-state-waiting')).toBeNull();
  });

  it('capture() sem Provider montado rejeita (erro de integração)', async () => {
    await expect(capture({ amountCents: 100 })).rejects.toThrow(
      /CashTapProvider/
    );
  });

  it('desmontar o Provider volta a exigir o Provider', async () => {
    const { unmount } = await renderApp();
    await unmount();
    await expect(capture({ amountCents: 100 })).rejects.toThrow(
      /CashTapProvider/
    );
  });

  it('conduz o fluxo inteiro pela UI do SDK e fecha ao resolver', async () => {
    await renderApp();
    const result = await start();

    expect(screen.getByTestId('cashtap-state-waiting')).toBeTruthy();
    expect(screen.getByText('Leitura segura')).toBeTruthy();
    expect(
      String(screen.getByTestId('cashtap-amount').props.children).replace(
        /\s/g,
        ' '
      )
    ).toBe('R$ 10,50');
    expect(screen.getByText('Aproxime o cartão')).toBeTruthy();
    // ilustração decorativa: escondida da acessibilidade de propósito
    expect(
      screen.getByTestId('cashtap-pulse', { includeHiddenElements: true })
    ).toBeTruthy();

    await act(async () => native.tap());
    await settle();
    expect(screen.getByTestId('cashtap-state-reading')).toBeTruthy();
    expect(screen.getByText('Lendo cartão… não afaste')).toBeTruthy();
    expect(Vibration.vibrate).toHaveBeenCalledWith(15);

    await act(async () => native.finishRead({ ok: true, card }));
    await settle();
    expect(screen.getByTestId('cashtap-state-success')).toBeTruthy();
    expect(screen.getByTestId('cashtap-card').props.children).toBe(
      '541333******0434'
    );
    expect(screen.getByText('Validade 12/25')).toBeTruthy();
    expect(screen.queryByText(card.pan)).toBeNull();
    expect(Vibration.vibrate).toHaveBeenCalledWith([0, 40, 60, 40]);

    await advance(DEFAULT_DISPLAY_DURATIONS.success);
    expect(screen.queryByTestId('cashtap-state-success')).toBeNull();
    expect(result()).toMatchObject({ status: 'success' });
  });

  it('verificação demorada mostra o spinner e o texto do design após a tolerância', async () => {
    native.startReaderMode.mockImplementationOnce(() => new Promise(() => {}));
    await renderApp();
    await start();
    expect(screen.queryByTestId('cashtap-state-checking')).toBeNull();
    await advance(CHECKING_GRACE_MS);
    expect(screen.getByTestId('cashtap-state-checking')).toBeTruthy();
    expect(screen.getByText('Preparando o leitor NFC')).toBeTruthy();
  });

  it('anuncia cada troca de estado ao leitor de tela (TalkBack)', async () => {
    const announce = jest
      .spyOn(AccessibilityInfo, 'announceForAccessibility')
      .mockImplementation(() => {});
    await renderApp();
    await start();
    await act(async () => native.tap());
    await settle();
    expect(announce.mock.calls.map(([text]) => text)).toEqual([
      'Aproxime o cartão',
      'Lendo cartão… não afaste',
    ]);
  });

  it('barra de progresso avança com as etapas do diálogo', async () => {
    await renderApp();
    await start();
    await act(async () => native.tap());
    await settle();
    const bar = () => screen.getByRole('progressbar');
    expect(bar().props.accessibilityValue).toEqual({ min: 0, max: 4, now: 0 });
    await act(async () => {
      native.step('SELECT_PPSE');
      native.step('SELECT_AID', '6A82');
      native.step('SELECT_AID');
    });
    await settle();
    expect(bar().props.accessibilityValue).toEqual({ min: 0, max: 4, now: 2 });
    expect(flat('cashtap-progress-fill').width).toBe('50%');
    // concluídas no texto, a atual em destaque, as próximas apagadas
    expect(flat('cashtap-step-0').color).toBe(DARK_COLORS.text);
    expect(flat('cashtap-step-1').color).toBe(DARK_COLORS.text);
    expect(flat('cashtap-step-2').color).toBe(DARK_COLORS.primarySoft);
    expect(flat('cashtap-step-3').color).toBe(DARK_COLORS.textMuted);
    // rótulos neutros, sem jargão de protocolo para o operador
    expect(screen.getByText('Conexão')).toBeTruthy();
    expect(screen.queryByText('PPSE')).toBeNull();
  });

  it('falha recuperável mostra a orientação e o contador de tentativas', async () => {
    await renderApp();
    await start();
    await act(async () => native.tap());
    await settle();
    await act(async () =>
      native.finishRead({ ok: false, code: 'CARD_REMOVED', detail: '' })
    );
    await settle();
    expect(screen.getByTestId('cashtap-state-recoverable')).toBeTruthy();
    expect(
      screen.getByText('Não foi possível ler. Aproxime novamente.')
    ).toBeTruthy();
    expect(screen.getByTestId('cashtap-attempt').props.children).toBe(
      'Tentativa 2 de 3'
    );
    expect(Vibration.vibrate).toHaveBeenCalledWith(30);
    await advance(DEFAULT_DISPLAY_DURATIONS.recovery);
    expect(
      screen.getByText('Aproxime o cartão novamente e mantenha-o parado')
    ).toBeTruthy();
    expect(screen.getByTestId('cashtap-attempt')).toBeTruthy();
  });

  it('RN-10: cancelar pela UI encerra a captura', async () => {
    await renderApp();
    const result = await start();
    await fireEvent.press(screen.getByTestId('cashtap-cancel'));
    await settle();
    expect(result()).toMatchObject({ status: 'cancelled' });
    expect(screen.queryByTestId('cashtap-state-waiting')).toBeNull();
  });

  it('RN-10: cancelar em READING mostra "Cancelando…" bloqueado até a leitura terminar', async () => {
    await renderApp();
    await start();
    await act(async () => native.tap());
    await settle();
    await fireEvent.press(screen.getByTestId('cashtap-cancel'));
    await settle();
    expect(screen.getByTestId('cashtap-cancelling')).toBeTruthy();
    expect(screen.getByText('Cancelando…')).toBeTruthy();
    expect(native.cancelRead).toHaveBeenCalledTimes(1);
    expect(
      screen.getByTestId('cashtap-cancelling').props.accessibilityState
    ).toMatchObject({ disabled: true });
    await fireEvent.press(screen.getByTestId('cashtap-cancelling'));
    await settle();
    expect(native.cancelRead).toHaveBeenCalledTimes(1);
    expect(screen.queryByTestId('cashtap-cancel')).toBeNull();
    await act(async () =>
      native.finishRead({ ok: false, code: 'CANCELLED_BY_USER', detail: '' })
    );
    await settle();
    expect(screen.queryByTestId('cashtap-state-reading')).toBeNull();
  });

  it('erro de bandeira mostra título, mensagem e código do catálogo e fecha pelo botão', async () => {
    await renderApp();
    const result = await start();
    await act(async () => native.tap());
    await settle();
    await act(async () =>
      native.finishRead({ ok: false, code: 'UNSUPPORTED_BRAND', detail: '' })
    );
    await settle();
    expect(screen.getByTestId('cashtap-state-error')).toBeTruthy();
    expect(screen.getByText('Cartão não aceito')).toBeTruthy();
    expect(
      screen.getByText(
        'Este cartão não é aceito. Tente um cartão Visa ou Mastercard.'
      )
    ).toBeTruthy();
    expect(screen.getByTestId('cashtap-error-code').props.children).toBe(
      'UNSUPPORTED_BRAND'
    );
    expect(Vibration.vibrate).toHaveBeenCalledWith([0, 80, 40, 80]);
    await fireEvent.press(screen.getByTestId('cashtap-close'));
    await settle();
    expect(result()).toMatchObject({
      status: 'error',
      error: { code: 'UNSUPPORTED_BRAND' },
    });
  });

  it('outros erros usam o título genérico', async () => {
    await renderApp();
    await start();
    await act(async () => native.tap());
    await settle();
    await act(async () =>
      native.finishRead({ ok: false, code: 'INCOMPLETE_DATA', detail: '' })
    );
    await settle();
    expect(screen.getByText('Não foi possível concluir')).toBeTruthy();
  });

  it('tempo esgotado tem tela própria com o tempo configurado', async () => {
    await renderApp();
    await start({ amountCents: 100, timeoutMs: 10_000 });
    await advance(10_000);
    expect(screen.getByTestId('cashtap-state-timeout')).toBeTruthy();
    expect(
      screen.getByText('Nenhum cartão foi aproximado em 10 segundos.')
    ).toBeTruthy();
  });

  it('RN-02: NFC desligado oferece abrir configurações, reverificar e cancelar', async () => {
    native.startResult = { ok: false, code: 'NFC_DISABLED', detail: '' };
    await renderApp();
    const result = await start();
    expect(screen.getByTestId('cashtap-state-nfc-disabled')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('cashtap-open-settings'));
    expect(mockOpenSettings).toHaveBeenCalled();

    native.startResult = { ok: true };
    await fireEvent.press(screen.getByTestId('cashtap-recheck'));
    await settle();
    expect(screen.getByTestId('cashtap-state-waiting')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('cashtap-cancel'));
    await settle();
    expect(result()).toMatchObject({ status: 'cancelled' });
  });

  it('RN-01: sem NFC no aparelho, a folha nunca aparece — nem por um instante', async () => {
    let answer: (() => void) | null = null;
    native.startReaderMode.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          answer = () =>
            resolve({ ok: false, code: 'NFC_UNSUPPORTED', detail: '' });
        })
    );
    await renderApp();
    let result: CaptureResult | undefined;
    await act(async () => {
      capture({ amountCents: 100 }).then((r) => (result = r));
    });
    // verificação em curso, dentro da tolerância: nada na tela
    expect(screen.queryByTestId('cashtap-sheet')).toBeNull();
    // resposta chega; só microtarefas, nenhum timer avançado (FINISH ainda pendente)
    await act(async () => {
      answer?.();
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(screen.queryByTestId('cashtap-sheet')).toBeNull();
    expect(screen.queryByTestId('cashtap-state-error')).toBeNull();
    expect(Vibration.vibrate).not.toHaveBeenCalled();
    await settle();
    expect(screen.queryByTestId('cashtap-sheet')).toBeNull();
    expect(result).toMatchObject({ error: { code: 'NFC_UNSUPPORTED' } });
  });

  it('verificação rápida não pisca a tela "Verificando…"', async () => {
    const announce = jest
      .spyOn(AccessibilityInfo, 'announceForAccessibility')
      .mockImplementation(() => {});
    await renderApp();
    await start();
    expect(screen.getByTestId('cashtap-state-waiting')).toBeTruthy();
    expect(announce).not.toHaveBeenCalledWith('Verificando…');
  });

  it('botão voltar do Android cancela a captura', async () => {
    await renderApp();
    const result = await start();
    await act(async () => {
      screen.getByTestId('cashtap-modal').props.onRequestClose();
    });
    await settle();
    expect(result()).toMatchObject({ status: 'cancelled' });
  });

  it('processando tem tela própria', async () => {
    await renderApp();
    await start();
    await act(async () => native.tap());
    await settle();
    await act(async () => {
      native.finishRead({ ok: true, card });
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(screen.getByTestId('cashtap-state-processing')).toBeTruthy();
  });
});

describe('Provider (E6-H1, D020)', () => {
  it('filho que chama capture() no próprio efeito de montagem não recebe erro de integração', async () => {
    let outcome: unknown;
    function AutoCharge() {
      useEffect(() => {
        capture({ amountCents: 100 }).then(
          (r) => (outcome = r),
          (e) => (outcome = e)
        );
      }, []);
      return null;
    }
    await render(
      <CashTapProvider>
        <AutoCharge />
      </CashTapProvider>
    );
    await settle();
    expect(screen.getByTestId('cashtap-state-waiting')).toBeTruthy();
    expect(outcome).toBeUndefined();
  });

  it('dois Providers montados exibem um único modal e avisam em desenvolvimento', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    await render(
      <CashTapProvider>
        <CashTapProvider>
          <Text>app</Text>
        </CashTapProvider>
      </CashTapProvider>
    );
    await start();
    expect(screen.getAllByTestId('cashtap-sheet')).toHaveLength(1);
    expect(warn).toHaveBeenCalledTimes(1);
  });
});

describe('personalização (E6-H3)', () => {
  it('textos customizados do Provider aparecem; os demais usam o padrão', async () => {
    await renderApp({ texts: { waitingTitle: 'Encoste o cartão aqui' } });
    await start();
    expect(screen.getByText('Encoste o cartão aqui')).toBeTruthy();
    expect(screen.getByText('Cancelar')).toBeTruthy();
  });

  it('aparência da captura sobrepõe a do Provider', async () => {
    await renderApp({ texts: { cancel: 'Voltar' } });
    await start({
      amountCents: 100,
      appearance: { texts: { cancel: 'Desistir' } },
    });
    expect(screen.getByText('Desistir')).toBeTruthy();
  });

  const FEIRA_VERDE: CashTapAppearance = {
    mode: 'light',
    colors: {
      primary: '#0B7A55',
      background: '#FAFAF7',
      text: '#0E2219',
      success: '#0B7A55',
      error: '#B42318',
    },
    borderRadius: 8,
    fontFamily: 'IBM Plex Sans',
  };

  it('cores, fonte e raio do tema chegam aos elementos do modal', async () => {
    await renderApp(FEIRA_VERDE);
    await start({ amountCents: 100, timeoutMs: 10_000 });
    expect(flat('cashtap-sheet')).toMatchObject({
      backgroundColor: '#FAFAF7',
      borderTopLeftRadius: 16,
      borderTopRightRadius: 16,
    });
    expect(flat('cashtap-amount')).toMatchObject({
      color: '#0E2219',
      fontFamily: 'IBM Plex Sans',
    });
    expect(
      StyleSheet.flatten(screen.getByText('Aproxime o cartão').props.style)
    ).toMatchObject({ color: '#0E2219', fontFamily: 'IBM Plex Sans' });
    expect(flat('cashtap-cancel')).toMatchObject({ borderRadius: 8 });
    expect(
      StyleSheet.flatten(screen.getByText('Cancelar').props.style)
    ).toMatchObject({ fontFamily: 'IBM Plex Sans' });
    await advance(10_000);
    expect(flat('cashtap-close')).toMatchObject({
      backgroundColor: '#0B7A55',
      borderRadius: 8,
    });
  });

  it('haptics: false desliga a vibração sem mudar o fluxo', async () => {
    await renderApp({ haptics: false });
    const result = await start();
    await act(async () => native.tap());
    await settle();
    await act(async () => native.finishRead({ ok: true, card }));
    await settle();
    expect(screen.getByTestId('cashtap-state-success')).toBeTruthy();
    expect(Vibration.vibrate).not.toHaveBeenCalled();
    await advance(DEFAULT_DISPLAY_DURATIONS.success);
    expect(result()).toMatchObject({ status: 'success' });
  });
});

/**
 * Critério #26: nenhuma opção de aparência altera transições. O mesmo roteiro roda sem
 * aparência, com aparência no Provider e com aparência na captura; o rastro tem de ser idêntico.
 */
describe('aparência não altera o fluxo (#26)', () => {
  const LOOK: CashTapAppearance = {
    mode: 'light',
    colors: { primary: '#0B7A55', text: '#0E2219', background: '#FFFFFF' },
    borderRadius: 4,
    fontFamily: 'IBM Plex Sans',
    texts: { cancel: 'Voltar', waitingTitle: 'Encoste' },
    haptics: false,
  };
  type Variant = 'none' | 'provider' | 'capture';
  type Script = 'success' | 'cancel' | 'timeout' | 'retry';

  async function trace(variant: Variant, script: Script) {
    const states: string[] = [];
    const unsubscribe = onStateChange((e) => states.push(e.state));
    const cancelVisible: boolean[] = [];
    const look = () =>
      cancelVisible.push(screen.queryByTestId('cashtap-cancel') !== null);
    const view = await renderApp(variant === 'provider' ? LOOK : undefined);
    const result = await start({
      amountCents: 100,
      timeoutMs: 10_000,
      ...(variant === 'capture' && { appearance: LOOK }),
    });
    look();
    if (script === 'timeout') {
      await advance(10_000);
      await advance(DEFAULT_DISPLAY_DURATIONS.failure);
    } else if (script === 'cancel') {
      await fireEvent.press(screen.getByTestId('cashtap-cancel'));
      await settle();
    } else {
      await act(async () => native.tap());
      await settle();
      look();
      if (script === 'retry') {
        await act(async () =>
          native.finishRead({ ok: false, code: 'CARD_REMOVED', detail: '' })
        );
        await settle();
        look();
        await advance(DEFAULT_DISPLAY_DURATIONS.recovery);
        await act(async () => native.tap());
        await settle();
      }
      await act(async () => native.finishRead({ ok: true, card }));
      await settle();
      await advance(DEFAULT_DISPLAY_DURATIONS.success);
    }
    const final = result();
    unsubscribe();
    await view.unmount();
    __resetForTests();
    native = new FakeNative();
    __setDepsForTests({ native }, { requireUiHost: true });
    return {
      states,
      cancelVisible,
      status: final?.status,
      attempts: final?.meta.attempts,
      durationMs: final?.meta.durationMs,
    };
  }

  it.each<Script>(['success', 'cancel', 'timeout', 'retry'])(
    'roteiro %s: mesmo rastro com e sem aparência',
    async (script) => {
      const base = await trace('none', script);
      expect(base.status).toBeDefined();
      expect(await trace('provider', script)).toEqual(base);
      expect(await trace('capture', script)).toEqual(base);
    }
  );
});

describe('textos customizados (E6-H3)', () => {
  const KEYS = Object.keys(DEFAULT_TEXTS) as Array<keyof CashTapTexts>;
  const custom = Object.fromEntries(
    KEYS.map((key) => {
      const original = DEFAULT_TEXTS[key];
      const placeholders = original.match(/\{\w+\}/g) ?? [];
      return [key, `«${key}»${placeholders.join(' ')}`];
    })
  ) as CashTapTexts;
  const seen = new Set<string>();
  const collect = () => {
    for (const key of KEYS) {
      if (screen.queryAllByText(new RegExp(`«${key}»`)).length > 0) {
        seen.add(key);
      }
    }
  };

  it('cada texto de CashTapTexts aparece na tela do estado correspondente', async () => {
    // espera, leitura, cancelamento em curso
    native.startReaderMode.mockImplementationOnce(
      () =>
        new Promise((resolve) => setTimeout(() => resolve({ ok: true }), 1000))
    );
    let view = await renderApp({ texts: custom });
    await start({ amountCents: 100, maxRetries: 1 });
    await advance(CHECKING_GRACE_MS);
    collect(); // verificando
    await advance(1000);
    collect(); // aguardando
    await act(async () => native.tap());
    await settle();
    collect(); // lendo + etapas
    await act(async () =>
      native.finishRead({ ok: false, code: 'CARD_REMOVED', detail: '' })
    );
    await settle();
    collect(); // falha recuperável + tentativa
    await advance(DEFAULT_DISPLAY_DURATIONS.recovery);
    collect(); // aguardando de novo (dica de retentativa)
    await act(async () => native.tap());
    await settle();
    await fireEvent.press(screen.getByTestId('cashtap-cancel'));
    await settle();
    collect(); // cancelando
    await act(async () => {
      native.finishRead({ ok: true, card });
      await Promise.resolve();
      await Promise.resolve();
    });
    await settle();
    await view.unmount();

    // processando e sucesso
    __resetForTests();
    native = new FakeNative();
    __setDepsForTests({ native }, { requireUiHost: true });
    view = await renderApp({ texts: custom });
    await start();
    await act(async () => native.tap());
    await settle();
    await act(async () => {
      native.finishRead({ ok: true, card });
      await Promise.resolve();
      await Promise.resolve();
    });
    collect(); // processando
    await settle();
    collect(); // sucesso + validade
    await advance(DEFAULT_DISPLAY_DURATIONS.success);
    await view.unmount();

    // tempo esgotado
    __resetForTests();
    native = new FakeNative();
    __setDepsForTests({ native }, { requireUiHost: true });
    view = await renderApp({ texts: custom });
    await start({ amountCents: 100, timeoutMs: 10_000 });
    await advance(10_000);
    collect();
    await view.unmount();

    // erros: genérico e bandeira
    for (const code of ['UNSUPPORTED_BRAND', 'INCOMPLETE_DATA'] as const) {
      __resetForTests();
      native = new FakeNative();
      __setDepsForTests({ native }, { requireUiHost: true });
      view = await renderApp({ texts: custom });
      await start();
      await act(async () => native.tap());
      await settle();
      await act(async () => native.finishRead({ ok: false, code, detail: '' }));
      await settle();
      collect();
      await view.unmount();
    }

    // NFC desligado
    __resetForTests();
    native = new FakeNative();
    __setDepsForTests({ native }, { requireUiHost: true });
    native.startResult = { ok: false, code: 'NFC_DISABLED', detail: '' };
    view = await renderApp({ texts: custom });
    await start();
    collect();
    await view.unmount();

    const missing = KEYS.filter((key) => !seen.has(key));
    expect(missing).toEqual([]);
  });
});
