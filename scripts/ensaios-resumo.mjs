#!/usr/bin/env node
/**
 * Resumo dos ensaios (docs/ensaios/protocolo.md): lê os CSVs exportados pela tela
 * Ensaios e imprime as métricas em Markdown. Sem dependências.
 *
 * Uso: node scripts/ensaios-resumo.mjs docs/ensaios/dados/*.csv
 */
import { readFileSync } from 'node:fs';

const TIMES = ['t_ciclo', 't_ppse', 't_aid', 't_gpo', 't_read'];
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
  return body.map((r) =>
    Object.fromEntries(header.map((h, i) => [h, r[i] ?? '']))
  );
}

function quantile(sorted, q) {
  if (sorted.length === 0) return NaN;
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

const pct = (a, b) => (b === 0 ? '—' : `${((a / b) * 100).toFixed(1)}%`);
const ms = (x) => (Number.isFinite(x) ? x.toFixed(1) : '—');

function summarize(label, rows) {
  const count = (outcome) => rows.filter((r) => r.desfecho === outcome).length;
  const success = count('sucesso');
  const recovered = count('recuperado');
  const valid = rows.length - count('cancelado') - count('expirado');
  const lines = [`### ${label}`, ''];
  lines.push(
    '| Tentativas | Válidas | Sucesso | Recuperado | Falha | Expirado | Cancelado | Taxa de sucesso | Taxa 1ª leitura |'
  );
  lines.push('|---|---|---|---|---|---|---|---|---|');
  lines.push(
    `| ${rows.length} | ${valid} | ${success} | ${recovered} | ${count('falha')} | ${count('expirado')} | ${count('cancelado')} | ${pct(success + recovered, valid)} | ${pct(success, valid)} |`
  );
  const failures = new Map();
  for (const r of rows) {
    if (r.desfecho === 'falha') {
      const key = r.categoria || '(sem código)';
      failures.set(key, (failures.get(key) ?? 0) + 1);
    }
  }
  lines.push(
    '',
    '**Falhas por categoria:** ' +
      (failures.size === 0
        ? 'nenhuma'
        : [...failures].map(([k, n]) => `${k} (${n})`).join(', '))
  );
  const ok = rows.filter(
    (r) => r.desfecho === 'sucesso' || r.desfecho === 'recuperado'
  );
  lines.push(
    '',
    '| Tempo (ms, leituras com sucesso) | n | Mediana | p90 | Média | Desvio-padrão |',
    '|---|---|---|---|---|---|'
  );
  for (const column of [...TIMES, ...CONTEXT_TIMES]) {
    const s = stats(
      ok.map((r) => (r[column] === '' ? NaN : Number(r[column])))
    );
    const name = CONTEXT_TIMES.includes(column) ? `${column} *` : column;
    lines.push(
      s
        ? `| ${name} | ${s.n} | ${ms(s.median)} | ${ms(s.p90)} | ${ms(s.mean)} | ${ms(s.sd)} |`
        : `| ${name} | 0 | — | — | — | — |`
    );
  }
  lines.push(
    '',
    '\\* depende do tempo de reação do operador; não entra na comparação entre bandeiras.',
    ''
  );
  return lines.join('\n');
}

const files = process.argv.slice(2);
if (files.length === 0) {
  console.error('uso: node scripts/ensaios-resumo.mjs <arquivo.csv> [...]');
  process.exit(1);
}
const rows = files.flatMap((f) => parseCsv(readFileSync(f, 'utf8')));
const byBrand = (brand) => rows.filter((r) => r.cartao === brand);
const sessions = [...new Set(rows.map((r) => r.sessao))].sort();

console.log(
  `## Resultados dos ensaios\n\nArquivos: ${files.length} · sessões: ${sessions.join(', ') || '—'} · tentativas: ${rows.length}\n`
);
console.log(summarize('Visa', byBrand('visa')));
console.log(summarize('Mastercard', byBrand('mastercard')));
console.log(summarize('Total', rows));
