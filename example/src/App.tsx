import { useEffect, useState } from 'react';
import { Button, StyleSheet, Text, View } from 'react-native';
import {
  getNfcStatus,
  onNfcStatusChange,
  openNfcSettings,
  type NfcStatus,
} from 'react-native-cashtap';

export default function App() {
  const [status, setStatus] = useState<NfcStatus | null>(null);

  useEffect(() => {
    getNfcStatus().then(setStatus);
    return onNfcStatusChange(setStatus);
  }, []);

  return (
    <View style={styles.container}>
      <Text style={styles.label}>Status do NFC</Text>
      <Text style={styles.status}>{status ?? '...'}</Text>
      {status === 'DISABLED' && (
        <Button title="Abrir configurações" onPress={openNfcSettings} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  label: {
    fontSize: 16,
  },
  status: {
    fontSize: 28,
    fontWeight: '700',
  },
});
