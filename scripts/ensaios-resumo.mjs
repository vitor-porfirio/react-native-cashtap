#!/usr/bin/env node
/**
 * Resumo dos ensaios (docs/ensaios/protocolo.md): lê os CSVs exportados pela tela
 * Ensaios e imprime as métricas em Markdown. Sem dependências.
 *
 *   node scripts/ensaios-resumo.mjs docs/ensaios/dados/*.csv
 *
 * Um CSV com as colunas `captura,motivo` (ex.: dados/descartes.csv) é lido como a
 * lista de descartes; os demais, como tentativas. Linhas repetidas (mesma `captura`)
 * contam uma vez; a mesma captura com conteúdo diferente aborta a análise.
 *
 * Estatística: quantis por interpolação linear entre ordens (tipo 7, o padrão do R e do
 * NumPy); desvio-padrão amostral (n − 1); intervalo de confiança de 95% de Wilson.
 */
import { readFileSync } from 'node:fs';

const REQUIRED = [
  'captura',
  'cartao',
  'desfecho',
  'categoria',
  't_deteccao',
  't_ciclo',
  't_total',
  't_ppse',
  't_aid',
  't_gpo',
  't_read',
];
const OUTCOMES = ['sucesso', 'recuperado', 'falha', 'expirado', 'cancelado'];
const STEPS = ['t_ppse', 't_aid', 't_gpo', 't_read'];
const CONTEXT_TIMES = ['t_deteccao', 't_total'];

function parseCsv(text) {
  const rows = [];
  let row = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (ch === '"') {
        quoted = false;
      } else {
        cell += ch;
      }
    } else if (ch === '"') {
      quoted = true;
    } else if (ch === ',') {
      row.push(cell);
      cell = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
    } else {
      cell += ch;
    }
  }
  if (cell !== '' || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }
  const [header = [], ...body] = rows.filter((r) => r.some((c) => c !== ''));
  return {
    header,
    rows: body.map((r) =>
      Object.fromEntries(header.map((h, i) => [h, r[i] ?? '']))
    ),
  };
}

function quantile(sorted, q) {
  const pos = (sorted.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
}

function stats(values) {
  const v = values.filter((x) => Number.isFinite(x)).sort((a, b) => a - b);
  if (v.length === 0) return null;
  const mean = v.reduce((s, x) => s + x, 0) / v.length;
  const sd =
    v.length > 1
      ? Math.sqrt(v.reduce((s, x) => s + (x - mean) ** 2, 0) / (v.length - 1))
      : 0;
  return {
    n: v.length,
    median: quantile(v, 0.5),
    p90: quantile(v, 0.9),
    mean,
    sd,
  };
}

/** Intervalo de 95% de Wilson para k sucessos em n. */
function wilson(k, n, z = 1.96) {
  if (n === 0) return null;
  const p = k / n;
  const denom = 1 + (z * z) / n;
  const center = (p + (z * z) / (2 * n)) / denom;
  const half =
    (z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n))) / denom;
  return [Math.max(0, center - half), Math.min(1, center + half)];
}

const num = (x, digits = 1) =>
  Number.isFinite(x) ? x.toFixed(digits).replace('.', ',') : '—';
const pct = (a, b) => (b === 0 ? '—' : `${num((a / b) * 100)}%`);
const ci = (k, n) => {
  const w = wilson(k, n);
  return w ? `${num(w[0] * 100)}–${num(w[1] * 100)}%` : '—';
};
const toNumber = (cell) => (cell === '' ? NaN : Number(cell));

function summarize(label, rows) {
  const count = (outcome) => rows.filter((r) => r.desfecho === outcome).length;
  const success = count('sucesso');
  const recovered = count('recuperado');
  const ok = success + recovered;
  const n = rows.length;
  const lines = [`### ${label}`, ''];
  lines.push(
    '| Tentativas válidas | Sucesso | Recuperado | Falha | Expirado | Cancelado | Taxa de sucesso (IC 95%) | Taxa 1ª leitura (IC 95%) |',
    '|---|---|---|---|---|---|---|---|',
    `| ${n} | ${success} | ${recovered} | ${count('falha')} | ${count('expirado')} | ${count('cancelado')} | ${pct(ok, n)} (${ci(ok, n)}) | ${pct(success, n)} (${ci(success, n)}) |`
  );
  const failures = new Map();
  for (const r of rows) {
    if (r.desfecho === 'sucesso' || r.desfecho === 'recuperado') continue;
    const key =
      r.desfecho === 'expirado'
        ? 'TIMEOUT (não detectado)'
        : r.desfecho === 'cancelado'
          ? 'cancelada sem descarte'
          : r.categoria || '(sem código)';
    failures.set(key, (failures.get(key) ?? 0) + 1);
  }
  lines.push(
    '',
    '**Falhas por categoria:** ' +
      (failures.size === 0
        ? 'nenhuma'
        : [...failures].map(([k, c]) => `${k} (${c})`).join(', '))
  );
  const read = rows.filter(
    (r) => r.desfecho === 'sucesso' || r.desfecho === 'recuperado'
  );
  const overhead = read.map(
    (r) =>
      toNumber(r.t_ciclo) -
      STEPS.reduce((sum, step) => sum + toNumber(r[step]), 0)
  );
  lines.push(
    '',
    '| Tempo (ms, leituras com sucesso) | n | Mediana | p90 | Média | Desvio-padrão |',
    '|---|---|---|---|---|---|'
  );
  const row = (name, values) => {
    const s = stats(values);
    lines.push(
      s
        ? `| ${name} | ${s.n} | ${num(s.median)} | ${num(s.p90)} | ${num(s.mean)} | ${num(s.sd)} |`
        : `| ${name} | 0 | — | — | — | — |`
    );
  };
  for (const column of ['t_ciclo', ...STEPS]) {
    row(
      column,
      read.map((r) => toNumber(r[column]))
    );
  }
  row('overhead †', overhead);
  for (const column of CONTEXT_TIMES) {
    row(
      `${column} *`,
      read.map((r) => toNumber(r[column]))
    );
  }
  lines.push(
    '',
    '† `t_ciclo` − (t_ppse + t_aid + t_gpo + t_read): ponte nativa, extração e runner.',
    '\\* depende do tempo de reação do operador; não entra na comparação entre bandeiras.',
    ''
  );
  return lines.join('\n');
}

function fail(message) {
  console.error(`ensaios-resumo: ${message}`);
  process.exit(2);
}

function main(files) {
  if (files.length === 0) {
    console.error('uso: node scripts/ensaios-resumo.mjs <arquivo.csv> [...]');
    process.exit(1);
  }
  const byId = new Map();
  const discarded = new Map();
  let duplicates = 0;
  for (const file of files) {
    // Planilhas costumam salvar CSV com BOM, que estragaria o nome da 1ª coluna.
    const text = readFileSync(file, 'utf8').replace(/^\uFEFF/, '');
    const { header, rows } = parseCsv(text);
    if (header.includes('motivo') && header.includes('captura')) {
      for (const r of rows) discarded.set(r.captura, r.motivo);
      continue;
    }
    const missing = REQUIRED.filter((column) => !header.includes(column));
    if (missing.length > 0) {
      fail(`${file}: faltam colunas ${missing.join(', ')}`);
    }
    for (const r of rows) {
      if (!OUTCOMES.includes(r.desfecho)) {
        fail(`${file}: desfecho desconhecido "${r.desfecho}" (${r.captura})`);
      }
      const key = JSON.stringify(REQUIRED.map((c) => r[c]));
      const previous = byId.get(r.captura);
      if (previous) {
        if (previous.key !== key) {
          fail(`captura ${r.captura} aparece com dados diferentes`);
        }
        duplicates++;
        continue;
      }
      byId.set(r.captura, { key, row: r });
    }
  }
  if (duplicates > 0) {
    console.error(
      `ensaios-resumo: ${duplicates} linha(s) repetida(s) ignorada(s)`
    );
  }
  const all = [...byId.values()].map((v) => v.row);
  const unknownDiscards = [...discarded.keys()].filter((id) => !byId.has(id));
  if (unknownDiscards.length > 0) {
    console.error(
      `ensaios-resumo: descartes sem tentativa correspondente: ${unknownDiscards.join(', ')}`
    );
  }
  const valid = all.filter((r) => !discarded.has(r.captura));
  const cancelled = valid.filter((r) => r.desfecho === 'cancelado').length;
  if (cancelled > 0) {
    console.error(
      `ensaios-resumo: ${cancelled} cancelada(s) sem registro de descarte contam como falha`
    );
  }
  const sessions = [...new Set(all.map((r) => r.sessao))].sort();
  const brand = (b) => valid.filter((r) => r.cartao === b);
  console.log(
    `## Resultados dos ensaios\n\nArquivos: ${files.length} · sessões: ${sessions.join(', ') || '—'} · tentativas: ${all.length} · descartadas: ${all.length - valid.length} · válidas: ${valid.length}\n`
  );
  console.log(summarize('Visa', brand('visa')));
  console.log(summarize('Mastercard', brand('mastercard')));
  console.log(summarize('Total', valid));
}

main(process.argv.slice(2));
