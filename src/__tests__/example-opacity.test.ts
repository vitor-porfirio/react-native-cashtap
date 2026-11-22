import { describe, expect, it } from '@jest/globals';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, resolve, sep } from 'node:path';

/**
 * E7-H2 — prova de opacidade do protocolo: o app hospedeiro não conhece
 * nenhum termo do diálogo com o cartão e só importa a API pública do pacote.
 */
const EXAMPLE_SRC = join(__dirname, '..', '..', 'example', 'src');

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? files(path) : [path];
  });
}

const sources = files(EXAMPLE_SRC).filter((f) => /\.(ts|tsx|js|jsx)$/.test(f));

/** Entradas públicas do pacote (D020). */
const PUBLIC_ENTRIES = ['react-native-cashtap', 'react-native-cashtap/dev'];

function importSpecifiers(code: string): string[] {
  const pattern =
    /(?:from\s+|import\s*\(\s*|require\s*\(\s*|import\s+)['"]([^'"]+)['"]/g;
  return [...code.matchAll(pattern)].map((m) => m[1] ?? '');
}

describe('E7-H2: o app de exemplo desconhece o protocolo', () => {
  it('existe código para verificar', () => {
    expect(sources.length).toBeGreaterThan(3);
  });

  it.each(sources.map((f) => [f.replace(EXAMPLE_SRC, 'example/src')]))(
    '%s não menciona APDU, TLV, AID, PPSE, IsoDep nem tags EMV',
    (relative) => {
      const code = readFileSync(
        join(EXAMPLE_SRC, relative.replace('example/src', '')),
        'utf8'
      );
      expect(code).not.toMatch(
        /apdu|tlv|ppse|isodep|\baid\b|\b(9f|5f|bf|df)[0-9a-f]{2}\b|\b5a\b|\b57\b|select_|get_processing|read_record/i
      );
    }
  );

  it('só importa do pacote pelas entradas públicas', () => {
    for (const file of sources) {
      const code = readFileSync(file, 'utf8');
      for (const spec of importSpecifiers(code)) {
        if (spec.startsWith('.')) {
          // Import relativo nunca sai de example/src (ex.: '../../src/core/controller').
          const target = resolve(dirname(file), spec);
          expect(`${target}${sep}`.startsWith(`${EXAMPLE_SRC}${sep}`)).toBe(
            true
          );
        } else if (spec.startsWith('react-native-cashtap')) {
          expect(PUBLIC_ENTRIES).toContain(spec);
        }
      }
      expect(code).not.toMatch(/NativeCashtap|TurboModuleRegistry/);
    }
  });

  it('o verificador de imports pega um import relativo para dentro da lib', () => {
    const fake = join(EXAMPLE_SRC, 'screens', 'X.tsx');
    const [spec] = importSpecifiers(
      "import { x } from '../../../src/core/controller';"
    );
    const target = resolve(dirname(fake), spec ?? '');
    expect(`${target}${sep}`.startsWith(`${EXAMPLE_SRC}${sep}`)).toBe(false);
  });

  it('a integração com o SDK cabe em menos de 10 linhas', () => {
    const lines = sources
      .map((f) => readFileSync(f, 'utf8'))
      .join('\n')
      .split('\n')
      .filter((line) => /\bCashTapProvider\b|\bcapture\(/.test(line));
    // <CashTapProvider> (abre e fecha) + uma chamada a capture() na cobrança e uma nos ensaios
    expect(lines.length).toBeGreaterThan(0);
    expect(lines.length).toBeLessThan(10);
  });
});
