import { describe, expect, it } from '@jest/globals';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

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

const sources = files(EXAMPLE_SRC).filter((f) => /\.(ts|tsx)$/.test(f));

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
        /apdu|\btlv\b|ppse|isodep|\baid\b|9f26|5f24|\b5a\b|\b57\b|select_|get_processing/i
      );
    }
  );

  it('só importa do pacote pela API pública', () => {
    for (const file of sources) {
      const code = readFileSync(file, 'utf8');
      expect(code).not.toMatch(/react-native-cashtap\/(src|lib)/);
      expect(code).not.toMatch(/NativeCashtap|TurboModuleRegistry/);
    }
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
