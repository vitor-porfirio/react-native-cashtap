import {
  useLayoutEffect,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from 'react';
import {
  getPrimaryUiHost,
  registerUiHost,
  subscribeUiHosts,
} from '../core/controller';
import type { CashTapAppearance } from '../types';
import { CashTapModal } from './CashTapModal';

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
  const [host] = useState(() => Symbol('CashTapProvider'));
  // Layout effect: roda antes dos efeitos passivos dos filhos, então um filho pode
  // chamar capture() no próprio useEffect de montagem.
  useLayoutEffect(() => registerUiHost(host), [host]);
  const primary = useSyncExternalStore(
    subscribeUiHosts,
    getPrimaryUiHost,
    getPrimaryUiHost
  );
  return (
    <>
      {children}
      {primary === host && <CashTapModal appearance={appearance} />}
    </>
  );
}
