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
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    let receivedEvent = false;

    let unsubscribe = () => {};
    try {
      unsubscribe = onNfcStatusChange((next) => {
        receivedEvent = true;
        setStatus(next);
      });
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    }
    getNfcStatus()
      .then((initial) => {
        // Um evento que chegou antes da consulta inicial é mais recente: prevalece.
        if (active && !receivedEvent) setStatus(initial);
      })
      .catch((e: unknown) => {
        if (active) setError(e instanceof Error ? e.message : String(e));
      });

    return () => {
      active = false;
      unsubscribe();
    };
  }, []);

  return (
    <View style={styles.container}>
      <Text style={styles.label}>Status do NFC</Text>
      <Text style={styles.status}>{status ?? '...'}</Text>
      {error && <Text style={styles.error}>{error}</Text>}
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
    padding: 24,
  },
  label: {
    fontSize: 16,
  },
  status: {
    fontSize: 28,
    fontWeight: '700',
  },
  error: {
    color: '#B00020',
    textAlign: 'center',
  },
});
