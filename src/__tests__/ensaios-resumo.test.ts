import { afterAll, describe, expect, it } from '@jest/globals';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { measurementsToCsv, toMeasurementRow } from '../core/measurements';
import { createError } from '../errors';
import type { CaptureMeta, CaptureResult } from '../types';

/**
 * #32 — o script que gera as tabelas do capítulo de resultados, alimentado por CSVs
 * no formato exato exportado pela tela de ensaios.
 */
const SCRIPT = join(__dirname, '..', '..', 'scripts', 'ensaios-resumo.mjs');

const meta = (id: string, extra: Partial<CaptureMeta> = {}): CaptureMeta => ({
  captureId: id,
  startedAt: 0,
  durationMs: 2000,
  attempts: 1,
  stepTimings: [],
  ...extra,
});

const read = (id: string, ciclo: number, attempts = 1): CaptureResult => ({
  status: 'success',
  card: {
    pan: '4761739001010010',
    panMasked: '476173******0010',
    expiry: '2512',
    brand: 'visa',
    aid: 'A0000000031010',
  },
  meta: meta(id, {
    attempts,
    detectionMs: 1000,
    readDurationMs: ciclo,
    stepTimings: [
      { step: 'SELECT_PPSE', durationMs: 20 },
      { step: 'SELECT_AID', durationMs: 20 },
      { step: 'GET_PROCESSING_OPTIONS', durationMs: 100 },
      { step: 'READ_RECORD', durationMs: 60 },
    ],
  }),
});

function csv(
  rows: Array<[CaptureResult, number, 'visa' | 'mastercard']>
): string {
  return measurementsToCsv(
    rows.map(([result, sessao, cartao], i) => ({
      ...toMeasurementRow(result),
      n: i + 1,
      sessao,
      cartao,
    })),
    ['n', 'sessao', 'cartao']
  );
}

const created: string[] = [];
afterAll(() => {
  for (const dir of created) rmSync(dir, { recursive: true, force: true });
});

function run(files: Record<string, string>) {
  const dir = mkdtempSync(join(tmpdir(), 'ensaios-'));
  created.push(dir);
  const paths = Object.entries(files).map(([name, content]) => {
    const path = join(dir, name);
    writeFileSync(path, content);
    return path;
  });
  const out = spawnSync(process.execPath, [SCRIPT, ...paths], {
    encoding: 'utf8',
  });
  return { status: out.status, stdout: out.stdout, stderr: out.stderr };
}

const session1 = csv([
  [read('ct_1', 300), 1, 'visa'],
  [read('ct_2', 500, 2), 1, 'visa'],
  [
    {
      status: 'timeout',
      error: createError('TIMEOUT'),
      meta: meta('ct_3', { durationMs: 30_000 }),
    },
    1,
    'visa',
  ],
  [
    {
      status: 'error',
      error: createError('UNSUPPORTED_BRAND'),
      meta: meta('ct_4'),
    },
    1,
    'mastercard',
  ],
  [{ status: 'cancelled', meta: meta('ct_5') }, 1, 'mastercard'],
]);

describe('scripts/ensaios-resumo.mjs (#32)', () => {
  it('expirado conta como falha de detecção no denominador, com IC de Wilson', () => {
    const { status, stdout } = run({ 'sessao-1.csv': session1 });
    expect(status).toBe(0);
    const visa = stdout.split('### Mastercard')[0] ?? '';
    // 2 lidos em 3 válidas; 1ª leitura 1 em 3
    expect(visa).toContain(
      '| 3 | 1 | 1 | 0 | 1 | 0 | 66,7% (20,8–93,9%) | 33,3% (6,1–79,2%) |'
    );
    expect(visa).toContain('TIMEOUT (não detectado) (1)');
    // mediana de t_ciclo (300, 500) e overhead = ciclo − 200 ms das etapas
    expect(visa).toContain('| t_ciclo | 2 | 400,0 | 480,0 | 400,0 | 141,4 |');
    expect(visa).toContain(
      '| overhead † | 2 | 200,0 | 280,0 | 200,0 | 141,4 |'
    );
  });

  it('cancelada fora da lista de descartes conta como falha e é avisada', () => {
    const { stdout, stderr } = run({ 'sessao-1.csv': session1 });
    expect(stderr).toContain('1 cancelada(s) sem registro de descarte');
    expect(stdout).toContain('cancelada sem descarte (1)');
  });

  it('descartes explícitos saem do denominador', () => {
    const { stdout } = run({
      'sessao-1.csv': session1,
      'descartes.csv':
        'captura,motivo\nct_5,cartão errado aproximado\nct_3,operador saiu\n',
    });
    expect(stdout).toContain('descartadas: 2 · válidas: 3');
    const visa = stdout.split('### Mastercard')[0] ?? '';
    expect(visa).toContain('| 2 | 1 | 1 | 0 | 0 | 0 | 100,0%');
  });

  it('linhas repetidas entre arquivos contam uma vez, com aviso', () => {
    const { status, stdout, stderr } = run({
      'sessao-1.csv': session1,
      'sessao-2.csv': session1,
    });
    expect(status).toBe(0);
    expect(stderr).toContain('5 linha(s) repetida(s) ignorada(s)');
    expect(stdout).toContain('tentativas: 5');
  });

  it('mesma captura com dados diferentes aborta', () => {
    const changed = session1.replace('ct_1,sucesso', 'ct_1,falha');
    const { status, stderr } = run({ 'a.csv': session1, 'b.csv': changed });
    expect(status).toBe(2);
    expect(stderr).toContain('captura ct_1 aparece com dados diferentes');
  });

  it('cabeçalho sem coluna obrigatória aborta em vez de imprimir zeros', () => {
    const { status, stderr } = run({
      'x.csv': 'captura,desfecho\nct_1,sucesso\n',
    });
    expect(status).toBe(2);
    expect(stderr).toContain('faltam colunas');
  });

  it('descartes salvos por planilha (com BOM) são lidos', () => {
    const { status, stdout } = run({
      'sessao-1.csv': session1,
      'descartes.csv': '\uFEFFcaptura,motivo\nct_5,cartão errado\n',
    });
    expect(status).toBe(0);
    expect(stdout).toContain('descartadas: 1');
  });

  it('nenhuma saída carrega PAN (RN-23)', () => {
    const { stdout } = run({ 'sessao-1.csv': session1 });
    expect(session1).not.toContain('4761739001010010');
    expect(stdout).not.toContain('4761739001010010');
  });
});
