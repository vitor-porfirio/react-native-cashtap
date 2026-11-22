import { StyleSheet, View } from 'react-native';
import { CashTapDiagnostics } from 'react-native-cashtap';
import { AppBar } from '../components/ui';

/**
 * Diagnóstico (design B7–B9). O painel inteiro vem do SDK: o app só o hospeda,
 * e por isso não conhece nenhum detalhe do protocolo (E7-H2).
 */
export function DiagnosticsScreen({
  onBack,
  onNewCharge,
}: {
  onBack: () => void;
  onNewCharge: () => void;
}) {
  return (
    <View style={styles.flex}>
      <AppBar title="Diagnóstico" subtitle="Última leitura" onBack={onBack} />
      <CashTapDiagnostics onEmptyAction={onNewCharge} />
    </View>
  );
}

const styles = StyleSheet.create({ flex: { flex: 1 } });
