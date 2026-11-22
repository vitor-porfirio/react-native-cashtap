import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import {
  capture,
  getNfcStatus,
  onNfcStatusChange,
  type CaptureResult,
  type NfcStatus,
} from 'react-native-cashtap';
import {
  Contactless,
  Glass,
  PrimaryButton,
  StatusChip,
} from '../components/ui';
import { formatBRL } from '../format';
import { c } from '../theme';

const KEYS = [
  '1',
  '2',
  '3',
  '4',
  '5',
  '6',
  '7',
  '8',
  '9',
  '00',
  '0',
  'back',
] as const;
const MAX_CENTS = 99_999_999; // R$ 999.999,99

type Props = {
  onResult: (result: CaptureResult, amountCents: number) => void;
  onOpenDiagnostics: () => void;
  onOpenTrials: () => void;
  initialAmountCents?: number;
  /** "Tentar novamente" na tela de resultado: cobra de novo o mesmo valor. */
  autoStart?: boolean;
};

const NFC_CHIP: Record<
  NfcStatus,
  { label: string; color: string; soft: string }
> = {
  READY: { label: 'NFC pronto', color: c.success, soft: c.successSoft },
  DISABLED: { label: 'NFC desligado', color: c.warning, soft: c.warningSoft },
  UNSUPPORTED: { label: 'Sem NFC', color: c.error, soft: c.errorSoft },
};

/** Cobrança (design B1/B2): o operador digita o valor; o SDK faz o resto. */
export function ChargeScreen({
  onResult,
  onOpenDiagnostics,
  onOpenTrials,
  initialAmountCents = 0,
  autoStart = false,
}: Props) {
  const [amount, setAmount] = useState(initialAmountCents);
  const [busy, setBusy] = useState(false);
  const [nfc, setNfc] = useState<NfcStatus | null>(null);
  const [integrationError, setIntegrationError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    const unsubscribe = onNfcStatusChange(setNfc);
    getNfcStatus()
      .then((status) => active && setNfc(status))
      .catch(() => undefined);
    return () => {
      active = false;
      unsubscribe();
    };
  }, []);

  const press = (key: (typeof KEYS)[number]) =>
    setAmount((current) => {
      if (key === 'back') return Math.floor(current / 10);
      const next = key === '00' ? current * 100 : current * 10 + Number(key);
      return Math.min(next, MAX_CENTS);
    });

  // A integração inteira com o SDK é esta chamada. Ela só rejeita por erro de
  // integração (Provider ausente, módulo nativo não instalado), nunca por falha de leitura.
  const charge = async () => {
    setBusy(true);
    setIntegrationError(null);
    try {
      const result = await capture({ amountCents: amount, diagnostics: true });
      onResult(result, amount);
    } catch (error) {
      setIntegrationError(
        error instanceof Error ? error.message : String(error)
      );
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    if (autoStart && initialAmountCents > 0) charge();
    // Só ao montar: a nova tentativa começa uma vez.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const chip = nfc ? NFC_CHIP[nfc] : null;
  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        <View style={styles.logo}>
          <Contactless />
        </View>
        <View style={styles.flex}>
          <Text style={styles.brand}>CashTap Demo</Text>
          <Text style={styles.muted}>Loja Demo · Caixa 01</Text>
        </View>
        {chip && <StatusChip {...chip} />}
      </View>

      <View style={styles.shortcuts}>
        <Shortcut
          label="Diagnóstico"
          icon="pulse"
          onPress={onOpenDiagnostics}
        />
        <Shortcut label="Ensaios" icon="flask" onPress={onOpenTrials} />
      </View>

      <Glass radius={24} style={styles.amountCard}>
        <View style={styles.highlight} />
        <Text style={styles.muted}>Valor da cobrança</Text>
        <Text
          style={[styles.amount, { color: amount > 0 ? c.text : c.faint }]}
          testID="charge-amount"
          accessibilityLiveRegion="polite"
        >
          {formatBRL(amount)}
        </Text>
        <Text style={styles.caption}>
          {amount > 0
            ? 'Toque em Cobrar e entregue o celular ao cliente'
            : 'Digite o valor no teclado'}
        </Text>
      </Glass>

      <View style={styles.keypad}>
        {KEYS.map((key) => (
          <Pressable
            key={key}
            onPress={() => press(key)}
            onLongPress={key === 'back' ? () => setAmount(0) : undefined}
            accessibilityRole="button"
            accessibilityLabel={
              key === 'back' ? 'Apagar (segure para zerar)' : key
            }
            style={({ pressed }) => [
              styles.key,
              pressed && {
                backgroundColor: c.glassStrong,
                transform: [{ scale: 0.96 }],
              },
            ]}
          >
            {key === 'back' ? (
              <BackspaceIcon />
            ) : (
              <Text style={styles.keyLabel}>{key}</Text>
            )}
          </Pressable>
        ))}
      </View>

      <View style={styles.flex}>
        {integrationError && (
          <Text style={styles.integrationError} testID="integration-error">
            {integrationError}
          </Text>
        )}
      </View>

      {amount > 0 ? (
        <PrimaryButton
          label={`Cobrar ${formatBRL(amount)}`}
          onPress={charge}
          disabled={busy}
          height={60}
          testID="charge-button"
        >
          <Contactless />
        </PrimaryButton>
      ) : (
        <Glass style={styles.disabledCharge}>
          <Text style={styles.disabledLabel}>Digite um valor para cobrar</Text>
        </Glass>
      )}
    </View>
  );
}

function Shortcut({
  label,
  icon,
  onPress,
}: {
  label: string;
  icon: 'pulse' | 'flask';
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [
        styles.shortcut,
        pressed && { transform: [{ scale: 0.97 }] },
      ]}
    >
      {icon === 'pulse' ? <PulseIcon /> : <FlaskIcon />}
      <Text style={styles.shortcutLabel}>{label}</Text>
    </Pressable>
  );
}

function PulseIcon() {
  return (
    <View style={styles.pulseIcon}>
      {[6, 12, 4, 14, 8].map((h, i) => (
        <View key={i} style={[styles.pulseBar, { height: h }]} />
      ))}
    </View>
  );
}

function FlaskIcon() {
  return (
    <View style={styles.flaskIcon}>
      <View style={styles.flaskNeck} />
      <View style={styles.flaskBody} />
    </View>
  );
}

function BackspaceIcon() {
  return (
    <View style={styles.backspace}>
      <View style={styles.backspaceArrow} />
      <View style={styles.backspaceBody}>
        <Text style={styles.backspaceX}>×</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 24,
    gap: 12,
  },
  flex: { flex: 1 },
  integrationError: {
    color: c.error,
    fontSize: 13,
    textAlign: 'center',
    marginTop: 12,
  },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, height: 52 },
  logo: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: c.primary,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 8,
    shadowColor: c.primary,
  },
  brand: { fontSize: 17, fontWeight: '700', color: c.text },
  muted: { fontSize: 13, color: c.muted },
  caption: { fontSize: 13, color: c.muted },
  shortcuts: { flexDirection: 'row', gap: 10 },
  shortcut: {
    flex: 1,
    height: 48,
    borderRadius: 14,
    backgroundColor: c.glass,
    borderWidth: 1,
    borderColor: c.border,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  shortcutLabel: { fontSize: 14, fontWeight: '600', color: c.text },
  amountCard: { padding: 20, gap: 4, overflow: 'hidden' },
  highlight: {
    position: 'absolute',
    left: 24,
    right: 24,
    top: 0,
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.45)',
  },
  amount: {
    fontSize: 46,
    lineHeight: 58,
    fontWeight: '700',
    letterSpacing: -1.1,
    fontVariant: ['tabular-nums'],
  },
  keypad: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    rowGap: 10,
  },
  key: {
    width: '31.5%',
    height: 62,
    borderRadius: 16,
    backgroundColor: c.glassKey,
    borderWidth: 1,
    borderColor: c.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  keyLabel: { fontSize: 26, fontWeight: '500', color: c.text },
  disabledCharge: {
    height: 60,
    alignItems: 'center',
    justifyContent: 'center',
  },
  disabledLabel: { fontSize: 17, fontWeight: '600', color: c.muted },
  pulseIcon: { flexDirection: 'row', alignItems: 'center', gap: 2, height: 18 },
  pulseBar: { width: 2.4, borderRadius: 2, backgroundColor: c.accent },
  flaskIcon: { width: 18, height: 18, alignItems: 'center' },
  flaskNeck: {
    width: 6,
    height: 7,
    borderLeftWidth: 2,
    borderRightWidth: 2,
    borderColor: c.accent,
  },
  flaskBody: {
    width: 15,
    height: 10,
    borderWidth: 2,
    borderColor: c.accent,
    borderTopLeftRadius: 2,
    borderTopRightRadius: 2,
    borderBottomLeftRadius: 4,
    borderBottomRightRadius: 4,
  },
  backspace: { flexDirection: 'row', alignItems: 'center' },
  backspaceArrow: {
    width: 12,
    height: 12,
    borderLeftWidth: 1.8,
    borderBottomWidth: 1.8,
    borderColor: c.text,
    transform: [{ rotate: '45deg' }],
    marginRight: -8,
  },
  backspaceBody: {
    width: 26,
    height: 20,
    borderWidth: 1.8,
    borderLeftWidth: 0,
    borderColor: c.text,
    borderTopRightRadius: 3,
    borderBottomRightRadius: 3,
    alignItems: 'center',
    justifyContent: 'center',
  },
  backspaceX: {
    color: c.text,
    fontSize: 16,
    lineHeight: 18,
    fontWeight: '600',
  },
});
