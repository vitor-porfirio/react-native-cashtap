import { useEffect, type ReactNode } from 'react';
import { registerUiHost } from '../core/controller';
import { CashTapModal } from './CashTapModal';
import type { CashTapAppearance } from './theme';

export type CashTapProviderProps = {
  children?: ReactNode;
  /** Aparência padrão de todas as capturas. `capture({ appearance })` sobrepõe. */
  appearance?: CashTapAppearance;
};

/**
 * Hospeda a interface do SDK (E6-H1). Monte uma vez, perto da raiz do app:
 * a partir daí `capture()` apresenta o próprio modal — o app não desenha nenhuma tela do fluxo.
 */
export function CashTapProvider({
  children,
  appearance,
}: CashTapProviderProps) {
  useEffect(() => registerUiHost(), []);
  return (
    <>
      {children}
      <CashTapModal appearance={appearance} />
    </>
  );
}
