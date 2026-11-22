import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { Share } from 'react-native';
import { diagnosticsRecorder } from '../../core/diagnostics';
import { CashTapDiagnostics } from '../CashTapDiagnostics';

const PAN = '4761739001010010';

describe('CashTapDiagnostics (E7-H3)', () => {
  beforeEach(() => diagnosticsRecorder.reset());

  it('estado vazio com ação opcional', async () => {
    const action = jest.fn();
    await render(<CashTapDiagnostics onEmptyAction={action} />);
    expect(screen.getByTestId('cashtap-diagnostics-empty')).toBeTruthy();
    await fireEvent.press(screen.getByText('Ir para cobrança'));
    expect(action).toHaveBeenCalled();
  });

  it('mostra criptograma presente, tempos por etapa, transições e comandos mascarados', async () => {
    await render(<CashTapDiagnostics />);
    await act(async () => {
      diagnosticsRecorder.start('ct_1', 1_795_000_000_000, 0);
      diagnosticsRecorder.transition('CHECKING', 0);
      diagnosticsRecorder.transition('READING', 120);
      diagnosticsRecorder.exchange(
        {
          step: 'SELECT_PPSE',
          command: '00A404000E325041592E5359532E444446303100',
          response: '6F1A8400',
          sw: '9000',
          durationMs: 21,
        },
        150
      );
      diagnosticsRecorder.exchange(
        {
          step: 'READ_RECORD',
          command: '00B2010C00',
          response: '7012' + '5A08' + '**'.repeat(8),
          sw: '9000',
          durationMs: 40,
        },
        300
      );
      diagnosticsRecorder.finish({
        status: 'success',
        card: {
          pan: PAN,
          panMasked: '476173******0010',
          expiry: '2512',
          brand: 'visa',
          aid: 'A0000000031010',
        },
        meta: {
          captureId: 'ct_1',
          startedAt: 1_795_000_000_000,
          durationMs: 500,
          attempts: 1,
          readDurationMs: 420,
          cryptogramPresent: true,
          stepTimings: [
            { step: 'SELECT_PPSE', durationMs: 21 },
            { step: 'SELECT_AID', durationMs: 18 },
            { step: 'GET_PROCESSING_OPTIONS', durationMs: 95 },
            { step: 'READ_RECORD', durationMs: 40 },
          ],
        },
      });
    });
    expect(screen.getByTestId('cashtap-diagnostics')).toBeTruthy();
    expect(screen.getByText('✓ Sim')).toBeTruthy();
    // t_total e t_ciclo rotulados separadamente (D018)
    expect(
      screen.getByTestId('cashtap-diagnostics-outcome').props.children
    ).toBe('500 ms');
    expect(screen.getByText('Leitura do cartão: 420 ms')).toBeTruthy();
    expect(screen.getByText('GPO')).toBeTruthy();
    expect(screen.getByText('Lendo')).toBeTruthy();
    expect(screen.getAllByTestId('cashtap-diagnostics-exchange')).toHaveLength(
      2
    );
    expect(JSON.stringify(screen.toJSON())).not.toContain(PAN);
  });

  it('desfecho de erro mostra o código no lugar do tempo', async () => {
    await render(<CashTapDiagnostics />);
    await act(async () => {
      diagnosticsRecorder.start('ct_2', 0, 0);
      diagnosticsRecorder.finish({
        status: 'error',
        error: { code: 'UNSUPPORTED_BRAND', message: 'x', recoverable: false },
        meta: {
          captureId: 'ct_2',
          startedAt: 0,
          durationMs: 1,
          attempts: 1,
          stepTimings: [],
          cryptogramPresent: false,
        },
      });
    });
    expect(
      screen.getByTestId('cashtap-diagnostics-outcome').props.children
    ).toBe('UNSUPPORTED_BRAND');
    expect(screen.getByText('Não')).toBeTruthy();
    expect(screen.getByText('Nenhum comando registrado.')).toBeTruthy();
  });

  it('exporta o relatório em texto', async () => {
    const share = jest
      .spyOn(Share, 'share')
      .mockResolvedValue({ action: 'sharedAction', activityType: undefined });
    await act(async () => diagnosticsRecorder.start('ct_3', 0, 0));
    await render(<CashTapDiagnostics />);
    await fireEvent.press(screen.getByTestId('cashtap-diagnostics-export'));
    expect(share).toHaveBeenCalledWith({
      message: expect.stringContaining('ct_3'),
    });
  });
});
