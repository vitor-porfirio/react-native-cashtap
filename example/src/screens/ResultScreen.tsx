import { useState } from 'react';
import {
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import type { CaptureResult } from 'react-native-cashtap';
import {
  AppBar,
  Contactless,
  Glass,
  PrimaryButton,
  SecondaryButton,
} from '../components/ui';
import { formatBRL, formatExpiry, formatMs, formatTime } from '../format';
import { c, mono } from '../theme';

type Props = {
  result: CaptureResult;
  amountCents: number;
  onNewCharge: () => void;
  onRetry: () => void;
};

type Success = Extract<CaptureResult, { status: 'success' }>;

/**
 * O que este app enviaria ao próprio backend. Na tela o número aparece mascarado
 * (LGPD: nenhum número completo em capturas de tela — TCC §2.3.3).
 */
function backendPayload(result: Success, amountCents: number) {
  return {
    transactionId: result.meta.captureId,
    amount: amountCents,
    currency: 'BRL',
    card: {
      brand: result.card.brand,
      pan: result.card.panMasked,
      expiry: formatExpiry(result.card.expiry),
      ...(result.card.panSequenceNumber && {
        sequence: result.card.panSequenceNumber,
      }),
    },
    attempts: result.meta.attempts,
    readDurationMs: Math.round(
      result.meta.readDurationMs ?? result.meta.durationMs
    ),
    capturedAt: new Date(result.meta.startedAt).toISOString(),
  };
}

export function ResultScreen({
  result,
  amountCents,
  onNewCharge,
  onRetry,
}: Props) {
  return result.status === 'success' ? (
    <SuccessView
      result={result}
      amountCents={amountCents}
      onNewCharge={onNewCharge}
    />
  ) : (
    <FailureView
      result={result}
      amountCents={amountCents}
      onNewCharge={onNewCharge}
      onRetry={onRetry}
    />
  );
}

/** Design B3: cartão ilustrado, métricas e JSON recolhível. */
function SuccessView({
  result,
  amountCents,
  onNewCharge,
}: {
  result: Success;
  amountCents: number;
  onNewCharge: () => void;
}) {
  const [open, setOpen] = useState(false);
  const payload = JSON.stringify(backendPayload(result, amountCents), null, 2);
  const visa = result.card.brand === 'visa';
  return (
    <View style={styles.flex}>
      <AppBar
        title="Resultado"
        subtitle="Leitura concluída"
        onBack={onNewCharge}
      />
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.row}>
          <View style={styles.okBadge}>
            <Text style={styles.okCheck}>✓</Text>
          </View>
          <View>
            <Text style={styles.title} testID="result-title">
              Cartão lido com sucesso
            </Text>
            <Text
              style={styles.muted}
            >{`${formatBRL(amountCents)} · ${formatTime(result.meta.startedAt)}`}</Text>
          </View>
        </View>

        <View style={styles.card}>
          <View style={[styles.cardBlob, styles.cardBlobA]} />
          <View style={[styles.cardBlob, styles.cardBlobB]} />
          <View style={styles.cardChip} />
          <View style={styles.cardContactless}>
            <Contactless size={24} />
          </View>
          <View style={styles.brandBox}>
            <Text style={[styles.brandText, !visa && styles.brandTextSmall]}>
              {visa ? 'VISA' : 'mastercard'}
            </Text>
          </View>
          <Text style={styles.cardNumber} testID="result-card">
            {result.card.panMasked}
          </Text>
          <View style={styles.cardExpiry}>
            <Text style={styles.cardExpiryLabel}>VALIDADE</Text>
            <Text style={styles.cardExpiryValue}>
              {formatExpiry(result.card.expiry)}
            </Text>
          </View>
          <Text style={styles.cardBrandName}>
            {visa ? 'Visa' : 'Mastercard'}
          </Text>
        </View>

        <View style={styles.metrics}>
          <Glass style={styles.metric}>
            <Text style={styles.muted}>Duração da leitura</Text>
            <Text style={styles.metricValue}>
              {formatMs(result.meta.readDurationMs ?? result.meta.durationMs)}
            </Text>
          </Glass>
          <Glass style={styles.metric}>
            <Text style={styles.muted}>Tentativas</Text>
            <Text style={styles.metricValue}>{result.meta.attempts}</Text>
          </Glass>
        </View>

        <Glass style={styles.json}>
          <Pressable
            accessibilityRole="button"
            onPress={() => setOpen((v) => !v)}
            style={styles.jsonHeader}
          >
            <Text style={styles.jsonBraces}>{'{ }'}</Text>
            <Text style={styles.jsonTitle}>JSON para o backend</Text>
            <Text style={styles.jsonChevron}>{open ? '▴' : '▾'}</Text>
          </Pressable>
          {open && (
            <View style={styles.code}>
              <Pressable
                accessibilityRole="button"
                onPress={() => Share.share({ message: payload })}
                style={styles.share}
              >
                <Text style={styles.shareLabel}>Compartilhar</Text>
              </Pressable>
              <Text style={styles.codeText} testID="result-json">
                {payload}
              </Text>
            </View>
          )}
        </Glass>
      </ScrollView>
      <View style={styles.footer}>
        <PrimaryButton
          label="Nova cobrança"
          onPress={onNewCharge}
          testID="result-done"
        />
      </View>
    </View>
  );
}

const FAILURES = {
  error: {
    title: 'Não foi possível ler o cartão',
    color: c.error,
    soft: c.errorSoft,
    glyph: '!',
  },
  cancelled: {
    title: 'Cobrança cancelada',
    color: c.muted,
    soft: c.neutralSoft,
    glyph: '×',
  },
  timeout: {
    title: 'Tempo esgotado',
    color: c.warning,
    soft: c.warningSoft,
    glyph: '◷',
  },
};

/** Design B4–B6: erro, cancelado e expirado. */
function FailureView({
  result,
  amountCents,
  onNewCharge,
  onRetry,
}: {
  result: Exclude<CaptureResult, Success>;
  amountCents: number;
  onNewCharge: () => void;
  onRetry: () => void;
}) {
  const look = FAILURES[result.status];
  const code =
    result.status === 'cancelled' ? 'CANCELLED_BY_USER' : result.error.code;
  const title =
    result.status === 'error' && result.error.code === 'UNSUPPORTED_BRAND'
      ? 'Cartão não aceito'
      : look.title;
  const message =
    result.status === 'cancelled'
      ? 'A leitura foi cancelada pelo operador antes da conclusão.'
      : result.error.message;
  const rows: Array<[string, string]> = [
    ['Valor', formatBRL(amountCents)],
    ['Horário', formatTime(result.meta.startedAt)],
    ['Tentativas', String(result.meta.attempts)],
  ];
  return (
    <View style={styles.flex}>
      <AppBar
        title="Resultado"
        subtitle="Leitura não concluída"
        onBack={onNewCharge}
      />
      <ScrollView
        contentContainerStyle={[styles.content, styles.failureContent]}
      >
        <View style={styles.failureHead}>
          <View style={[styles.failureBadge, { backgroundColor: look.soft }]}>
            <Text style={[styles.failureGlyph, { color: look.color }]}>
              {look.glyph}
            </Text>
          </View>
          <Text style={styles.failureTitle} testID="result-title">
            {title}
          </Text>
          <Text
            style={[
              styles.codeChip,
              { color: look.color, backgroundColor: look.soft },
            ]}
            testID="result-error-code"
          >
            {code}
          </Text>
          <Text style={styles.failureMessage}>{message}</Text>
        </View>
        <Glass>
          {rows.map(([k, v], i) => (
            <View key={k} style={[styles.infoRow, i > 0 && styles.infoRowLine]}>
              <Text style={styles.muted}>{k}</Text>
              <Text style={styles.infoValue}>{v}</Text>
            </View>
          ))}
        </Glass>
      </ScrollView>
      <View style={[styles.footer, styles.footerGap]}>
        <PrimaryButton
          label="Tentar novamente"
          onPress={onRetry}
          testID="result-retry"
        />
        <SecondaryButton
          label="Nova cobrança"
          onPress={onNewCharge}
          testID="result-done"
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { paddingHorizontal: 20, paddingTop: 4, paddingBottom: 16, gap: 14 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  okBadge: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: c.success,
    alignItems: 'center',
    justifyContent: 'center',
  },
  okCheck: { color: c.onSuccess, fontSize: 24, fontWeight: '900' },
  title: { fontSize: 19, fontWeight: '700', color: c.text },
  muted: { fontSize: 13, color: c.muted },
  card: {
    height: 200,
    borderRadius: 22,
    backgroundColor: c.card,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.28)',
    overflow: 'hidden',
    elevation: 14,
    shadowColor: c.primary,
  },
  cardBlob: {
    position: 'absolute',
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.14)',
  },
  cardBlobA: { width: 220, height: 220, right: -70, top: -90 },
  cardBlobB: { width: 160, height: 160, left: -50, bottom: -90, opacity: 0.55 },
  cardChip: {
    position: 'absolute',
    left: 22,
    top: 22,
    width: 34,
    height: 26,
    borderRadius: 6,
    backgroundColor: '#E2C26F',
  },
  cardContactless: { position: 'absolute', left: 66, top: 23 },
  brandBox: {
    position: 'absolute',
    right: 20,
    top: 18,
    width: 60,
    height: 36,
    borderRadius: 8,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  brandText: {
    fontSize: 16,
    fontWeight: '800',
    fontStyle: 'italic',
    color: '#1A1F71',
  },
  brandTextSmall: { fontSize: 10 },
  cardNumber: {
    position: 'absolute',
    left: 22,
    top: 94,
    fontFamily: mono,
    fontSize: 20,
    color: '#FFFFFF',
    letterSpacing: 0.8,
  },
  cardExpiry: { position: 'absolute', left: 22, bottom: 20, gap: 2 },
  cardExpiryLabel: {
    fontSize: 11,
    letterSpacing: 1.1,
    color: 'rgba(255,255,255,0.85)',
  },
  cardExpiryValue: {
    fontFamily: mono,
    fontSize: 17,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  cardBrandName: {
    position: 'absolute',
    right: 22,
    bottom: 22,
    fontSize: 13,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.9)',
  },
  metrics: { flexDirection: 'row', gap: 10 },
  metric: { flex: 1, paddingHorizontal: 16, paddingVertical: 14, gap: 4 },
  metricValue: {
    fontSize: 24,
    fontWeight: '700',
    color: c.text,
    fontVariant: ['tabular-nums'],
  },
  json: { overflow: 'hidden' },
  jsonHeader: {
    height: 56,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 16,
  },
  jsonBraces: { fontFamily: mono, fontSize: 14, color: c.accent },
  jsonTitle: { flex: 1, fontSize: 15, fontWeight: '600', color: c.text },
  jsonChevron: { fontSize: 16, color: c.text },
  code: {
    borderTopWidth: 1,
    borderTopColor: c.border,
    backgroundColor: c.codeBg,
    padding: 16,
  },
  codeText: { fontFamily: mono, fontSize: 11.5, lineHeight: 18, color: c.code },
  share: {
    position: 'absolute',
    right: 8,
    top: 8,
    zIndex: 1,
    height: 40,
    minWidth: 48,
    paddingHorizontal: 12,
    borderRadius: 10,
    backgroundColor: c.glassStrong,
    borderWidth: 1,
    borderColor: c.border,
    justifyContent: 'center',
  },
  shareLabel: { fontSize: 13, fontWeight: '600', color: c.text },
  footer: { paddingHorizontal: 20, paddingTop: 12, paddingBottom: 24 },
  footerGap: { gap: 10 },
  failureContent: { gap: 20, paddingTop: 12 },
  failureHead: { alignItems: 'center', gap: 12, paddingTop: 20 },
  failureBadge: {
    width: 96,
    height: 96,
    borderRadius: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  failureGlyph: { fontSize: 44, fontWeight: '700' },
  failureTitle: {
    fontSize: 24,
    fontWeight: '700',
    color: c.text,
    textAlign: 'center',
  },
  codeChip: {
    fontFamily: mono,
    fontSize: 14,
    fontWeight: '600',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    overflow: 'hidden',
  },
  failureMessage: {
    fontSize: 16,
    lineHeight: 24,
    color: c.muted,
    textAlign: 'center',
    maxWidth: 290,
  },
  infoRow: {
    height: 52,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
  },
  infoRowLine: { borderTopWidth: 1, borderTopColor: c.border },
  infoValue: {
    fontSize: 15,
    fontWeight: '600',
    color: c.text,
    fontVariant: ['tabular-nums'],
  },
});
