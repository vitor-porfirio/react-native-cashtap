import { useState } from 'react';
import { StatusBar, StyleSheet, View } from 'react-native';
import { CashTapProvider, type CaptureResult } from 'react-native-cashtap';
import { Backdrop } from './components/ui';
import { ChargeScreen } from './screens/ChargeScreen';
import { DiagnosticsScreen } from './screens/DiagnosticsScreen';
import { ResultScreen } from './screens/ResultScreen';
import { TrialsScreen, type Trial } from './screens/TrialsScreen';

type Route =
  | { name: 'charge'; amountCents?: number; retry?: boolean }
  | { name: 'result'; result: CaptureResult; amountCents: number }
  | { name: 'diagnostics' }
  | { name: 'trials' };

/**
 * Com edge-to-edge (padrão no RN 0.88) o app desenha sob as barras do sistema, e o
 * SafeAreaView do core não faz nada no Android. Margens explícitas: status bar medida,
 * barra de navegação de 3 botões (48 dp) reservada.
 */
const TOP_INSET = StatusBar.currentHeight ?? 24;
const BOTTOM_INSET = 48;

export default function App() {
  const [route, setRoute] = useState<Route>({ name: 'charge' });
  // Ensaios ficam aqui: voltar para a cobrança não apaga as leituras registradas.
  const [trials, setTrials] = useState<Trial[]>([]);
  const home = () => setRoute({ name: 'charge' });

  return (
    <CashTapProvider>
      <StatusBar barStyle="light-content" />
      <Backdrop>
        <View style={styles.root}>
          {route.name === 'charge' && (
            <ChargeScreen
              key={route.amountCents ?? 0}
              initialAmountCents={route.amountCents}
              autoStart={route.retry}
              onResult={(result, amountCents) =>
                setRoute({ name: 'result', result, amountCents })
              }
              onOpenDiagnostics={() => setRoute({ name: 'diagnostics' })}
              onOpenTrials={() => setRoute({ name: 'trials' })}
            />
          )}
          {route.name === 'result' && (
            <ResultScreen
              result={route.result}
              amountCents={route.amountCents}
              onNewCharge={home}
              onRetry={() =>
                setRoute({
                  name: 'charge',
                  amountCents: route.amountCents,
                  retry: true,
                })
              }
            />
          )}
          {route.name === 'diagnostics' && (
            <DiagnosticsScreen onBack={home} onNewCharge={home} />
          )}
          {route.name === 'trials' && (
            <TrialsScreen onBack={home} trials={trials} setTrials={setTrials} />
          )}
        </View>
      </Backdrop>
    </CashTapProvider>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, paddingTop: TOP_INSET, paddingBottom: BOTTOM_INSET },
});
