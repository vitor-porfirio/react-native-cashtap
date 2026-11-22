import { describe, expect, it } from '@jest/globals';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { ResultScreen } from '../../example/src/screens/ResultScreen';
import { createError } from '../errors';
import type { CaptureMeta, CaptureResult } from '../types';

/**
 * E7-H1 — tela de resultado do app de exemplo: o que o integrador vê depois de capture().
 * Fica aqui (e não em example/) para rodar na mesma bateria do pacote.
 */
const meta: CaptureMeta = {
  captureId: 'ct_9',
  startedAt: 1_795_000_000_000,
  durationMs: 2_400,
  attempts: 1,
  readDurationMs: 412,
  stepTimings: [],
};

const success: CaptureResult = {
  status: 'success',
  card: {
    pan: '4761739001010010',
    panMasked: '476173******0010',
    expiry: '2512',
    brand: 'visa',
    aid: 'A0000000031010',
  },
  meta,
};

const noop = () => {};

describe('E7-H1: tela de resultado do exemplo', () => {
  it('sucesso mostra PAN mascarado, validade, duração da leitura e JSON sem o número completo', async () => {
    await render(
      <ResultScreen
        result={success}
        amountCents={1050}
        onNewCharge={noop}
        onRetry={noop}
      />
    );
    expect(screen.getByTestId('result-card').props.children).toContain(
      '476173******0010'
    );
    expect(screen.getByText('12/25')).toBeTruthy();
    expect(screen.getByText('412 ms')).toBeTruthy();
    await fireEvent.press(screen.getByText('JSON para o backend'));
    const json = String(screen.getByTestId('result-json').props.children);
    expect(json).toContain('"panMasked": "476173******0010"');
    expect(json).not.toContain('4761739001010010');
    expect(json).not.toMatch(/cryptogram|9f26|atc/i);
    expect(screen.queryByText('4761739001010010')).toBeNull();
  });

  it('erro mostra título, código e mensagem do catálogo, com nova tentativa', async () => {
    await render(
      <ResultScreen
        result={{
          status: 'error',
          error: createError('UNSUPPORTED_BRAND'),
          meta,
        }}
        amountCents={1050}
        onNewCharge={noop}
        onRetry={noop}
      />
    );
    expect(screen.getByTestId('result-title').props.children).toBe(
      'Cartão não aceito'
    );
    expect(screen.getByTestId('result-error-code').props.children).toBe(
      'UNSUPPORTED_BRAND'
    );
    expect(
      screen.getByText(
        'Este cartão não é aceito. Tente um cartão Visa ou Mastercard.'
      )
    ).toBeTruthy();
    expect(screen.getByTestId('result-retry')).toBeTruthy();
  });

  it('aparelho sem NFC não oferece "Tentar novamente"', async () => {
    await render(
      <ResultScreen
        result={{
          status: 'error',
          error: createError('NFC_UNSUPPORTED'),
          meta,
        }}
        amountCents={1050}
        onNewCharge={noop}
        onRetry={noop}
      />
    );
    expect(screen.getByTestId('result-title').props.children).toBe(
      'Aparelho sem NFC'
    );
    expect(screen.queryByTestId('result-retry')).toBeNull();
  });

  it('tempo esgotado tem título próprio', async () => {
    await render(
      <ResultScreen
        result={{ status: 'timeout', error: createError('TIMEOUT'), meta }}
        amountCents={1050}
        onNewCharge={noop}
        onRetry={noop}
      />
    );
    expect(screen.getByTestId('result-title').props.children).toBe(
      'Tempo esgotado'
    );
    expect(screen.getByTestId('result-error-code').props.children).toBe(
      'TIMEOUT'
    );
  });
});
