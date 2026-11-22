import { useState } from 'react';
import { SafeAreaView, StatusBar, StyleSheet } from 'react-native';
import { CashTapProvider, type CaptureResult } from 'react-native-cashtap';
import { Backdrop } from './components/ui';
import { ChargeScreen } from './screens/ChargeScreen';
import { DiagnosticsScreen } from './screens/DiagnosticsScreen';
import { ResultScreen } from './screens/ResultScreen';
import { TrialsScreen } from './screens/TrialsScreen';

type Route =
  | { name: 'charge'; amountCents?: number; retry?: boolean }
  | { name: 'result'; result: CaptureResult; amountCents: number }
  | { name: 'diagnostics' }
  | { name: 'trials' };

export default function App() {
  const [route, setRoute] = useState<Route>({ name: 'charge' });
  const home = () => setRoute({ name: 'charge' });

  return (
    <CashTapProvider>
      <StatusBar barStyle="light-content" />
      <Backdrop>
        <SafeAreaView style={styles.root}>
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
          {route.name === 'trials' && <TrialsScreen onBack={home} />}
        </SafeAreaView>
      </Backdrop>
    </CashTapProvider>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
});
