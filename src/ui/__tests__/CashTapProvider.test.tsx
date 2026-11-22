import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  jest,
} from '@jest/globals';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { Text, Vibration } from 'react-native';
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
import type { CashTapAppearance } from '../theme';

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
  step(step: DiagnosticExchange['step']) {
    this.diagListeners.forEach((l) =>
      l({ step, command: '00', response: '', sw: '9000', durationMs: 1 })
    );
  }
  finishRead(o: NativeReadOutcome) {
    this.pendingRead?.(o);
  }
}

let native: FakeNative;

async function settle() {
  await act(async () => {
    for (let i = 0; i < 5; i++) {
      await Promise.resolve();
      jest.advanceTimersByTime(0);
    }
  });
}

async function advance(ms: number) {
  await act(async () => {
    jest.advanceTimersByTime(ms);
  });
  await settle();
}

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

  it('verificando mostra o spinner e o texto do design', async () => {
    native.startReaderMode.mockImplementationOnce(() => new Promise(() => {}));
    await renderApp();
    await start();
    expect(screen.getByTestId('cashtap-state-checking')).toBeTruthy();
    expect(screen.getByText('Preparando o leitor NFC')).toBeTruthy();
  });

  it('barra de progresso avança com as etapas do diálogo', async () => {
    await renderApp();
    await start();
    await act(async () => native.tap());
    await settle();
    const width = () => screen.getByTestId('cashtap-progress-fill').props.style;
    const before = JSON.stringify(width());
    await act(async () => {
      native.step('SELECT_PPSE');
      native.step('SELECT_AID');
    });
    await settle();
    expect(JSON.stringify(width())).not.toBe(before);
    expect(JSON.stringify(width())).toContain('50%');
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
    expect(native.cancelRead).toHaveBeenCalled();
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

  it('RN-01: sem NFC no aparelho, nenhuma tela é aberta', async () => {
    native.startResult = { ok: false, code: 'NFC_UNSUPPORTED', detail: '' };
    await renderApp();
    const result = await start();
    expect(screen.queryByTestId('cashtap-state-error')).toBeNull();
    expect(result()).toMatchObject({ error: { code: 'NFC_UNSUPPORTED' } });
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

  it('tema não altera o fluxo: mesmas telas e mesmo timeout', async () => {
    await renderApp({
      mode: 'light',
      colors: { primary: '#0B7A55' },
      borderRadius: 8,
      fontFamily: 'IBM Plex Sans',
    });
    await start({ amountCents: 100, timeoutMs: 10_000 });
    expect(screen.getByTestId('cashtap-state-waiting')).toBeTruthy();
    await advance(10_000);
    expect(screen.getByTestId('cashtap-state-timeout')).toBeTruthy();
  });
});
