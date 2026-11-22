import { useSyncExternalStore } from 'react';
import {
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import {
  diagnosticsToText,
  getLastDiagnostics,
  onDiagnosticsChange,
  type DiagnosticsReport,
} from '../core/diagnostics';
import type { CaptureState } from '../core/machine';

/** Paleta do painel (design B7, modo escuro). Ferramenta de desenvolvimento: não tematizável. */
const p = {
  glass: 'rgba(255,255,255,0.06)',
  glassStrong: 'rgba(255,255,255,0.14)',
  border: 'rgba(255,255,255,0.12)',
  text: '#F5F2FF',
  muted: '#B9B0DA',
  accent: '#B79CFF',
  primary: '#7C4DFF',
  primaryStrong: '#5A2EE6',
  success: '#3DDC97',
  successSoft: 'rgba(61,220,151,0.14)',
  error: '#FF7A8C',
  errorSoft: 'rgba(255,122,140,0.14)',
  warning: '#FFC46B',
  warningSoft: 'rgba(255,196,107,0.14)',
  track: 'rgba(255,255,255,0.08)',
  codeBg: 'rgba(5,2,14,0.45)',
  code: '#E2DBFF',
};
const mono = 'monospace';

const STEP_SHORT: Record<string, string> = {
  SELECT_PPSE: 'PPSE',
  SELECT_AID: 'AID',
  GET_PROCESSING_OPTIONS: 'GPO',
  READ_RECORD: 'READ',
};

const STATE_LABEL: Record<CaptureState, string> = {
  IDLE: 'Concluído',
  CHECKING: 'Verificando',
  WAITING_CARD: 'Aguardando cartão',
  READING: 'Lendo',
  RECOVERABLE_FAILURE: 'Falha recuperável',
  PROCESSING: 'Processando',
  SUCCESS: 'Sucesso',
  CANCELLED: 'Cancelado',
  TIMEOUT: 'Tempo esgotado',
  ERROR: 'Erro',
};

function stateColor(state: CaptureState): { dot: string; halo: string } {
  if (state === 'SUCCESS') return { dot: p.success, halo: p.successSoft };
  if (state === 'RECOVERABLE_FAILURE' || state === 'TIMEOUT')
    return { dot: p.warning, halo: p.warningSoft };
  if (state === 'ERROR') return { dot: p.error, halo: p.errorSoft };
  return { dot: p.accent, halo: p.track };
}

function useDiagnostics(): DiagnosticsReport | null {
  return useSyncExternalStore(
    onDiagnosticsChange,
    getLastDiagnostics,
    getLastDiagnostics
  );
}

function clock(startedAt: number, atMs: number): string {
  const d = new Date(startedAt + atMs);
  const hms = [d.getHours(), d.getMinutes(), d.getSeconds()]
    .map((n) => String(n).padStart(2, '0'))
    .join(':');
  return `${hms}.${String(d.getMilliseconds()).padStart(3, '0')}`;
}

/** Resposta mascarada é longa: mostra começo e fim, como no design. */
function abbreviate(hex: string, max = 44): string {
  return hex.length <= max ? hex : `${hex.slice(0, max - 10)}…${hex.slice(-8)}`;
}

export type CashTapDiagnosticsProps = {
  /** Ação do estado vazio (ex.: ir para a tela de cobrança). */
  onEmptyAction?: () => void;
  emptyActionLabel?: string;
};

/**
 * Painel de diagnóstico da última captura feita com `diagnostics: true` (E7-H3,
 * design B7/B9): criptograma presente, tempo total, tempo por etapa, linha do
 * tempo das transições e log de comandos — dados sensíveis mascarados na origem.
 * Ferramenta de desenvolvimento e de apresentação; não use em produção.
 */
export function CashTapDiagnostics({
  onEmptyAction,
  emptyActionLabel = 'Ir para cobrança',
}: CashTapDiagnosticsProps) {
  const report = useDiagnostics();

  if (!report) {
    return (
      <View style={styles.empty} testID="cashtap-diagnostics-empty">
        <View style={styles.emptyIcon}>
          <Text style={styles.emptyGlyph}>∿</Text>
        </View>
        <Text style={styles.emptyTitle}>Nenhuma leitura ainda</Text>
        <Text style={styles.emptyHint}>
          Faça uma cobrança com diagnóstico para ver a linha do tempo, as etapas
          e o log de comandos.
        </Text>
        {onEmptyAction && (
          <Pressable
            accessibilityRole="button"
            onPress={onEmptyAction}
            style={styles.primary}
          >
            <Text style={styles.primaryLabel}>{emptyActionLabel}</Text>
          </Pressable>
        )}
      </View>
    );
  }

  const maxStep = Math.max(1, ...report.stepTimings.map((s) => s.durationMs));
  const total =
    report.readDurationMs ??
    report.stepTimings.reduce((sum, s) => sum + s.durationMs, 0);
  const cryptogram = report.cryptogramPresent;

  return (
    <ScrollView
      contentContainerStyle={styles.container}
      testID="cashtap-diagnostics"
    >
      <View style={styles.twoCols}>
        <View style={[styles.card, styles.col]}>
          <Text style={styles.cardLabel}>Criptograma retornado</Text>
          <View
            style={[
              styles.pill,
              {
                backgroundColor: cryptogram
                  ? p.successSoft
                  : cryptogram === false
                    ? p.errorSoft
                    : p.track,
              },
            ]}
            testID="cashtap-diagnostics-cryptogram"
          >
            <Text
              style={[
                styles.pillLabel,
                {
                  color: cryptogram
                    ? p.success
                    : cryptogram === false
                      ? p.error
                      : p.muted,
                },
              ]}
            >
              {cryptogram === undefined ? '—' : cryptogram ? '✓ Sim' : 'Não'}
            </Text>
          </View>
        </View>
        <View style={[styles.card, styles.col]}>
          <Text style={styles.cardLabel}>Tempo total</Text>
          <Text style={styles.bigValue} testID="cashtap-diagnostics-outcome">
            {report.outcome === 'success'
              ? `${Math.round(total).toLocaleString('pt-BR')} ms`
              : (report.errorCode ?? report.outcome ?? '…')}
          </Text>
        </View>
      </View>

      {report.stepTimings.length > 0 && (
        <View style={styles.card}>
          <View style={styles.cardHead}>
            <Text style={styles.cardTitle}>Tempo por etapa</Text>
            <Text style={styles.cardLabel}>ms</Text>
          </View>
          {report.stepTimings.map((s) => (
            <View key={s.step} style={styles.barRow}>
              <Text style={styles.barLabel}>
                {STEP_SHORT[s.step] ?? s.step}
              </Text>
              <View style={styles.barTrack}>
                <View
                  style={[
                    styles.bar,
                    {
                      width: `${Math.max(2, (s.durationMs / maxStep) * 100)}%`,
                    },
                  ]}
                />
              </View>
              <Text
                style={styles.barValue}
              >{`${Math.round(s.durationMs)} ms`}</Text>
            </View>
          ))}
        </View>
      )}

      <View style={styles.card}>
        <Text style={[styles.cardTitle, styles.mb]}>Transições de estado</Text>
        {report.transitions.map((t, i) => {
          const color = stateColor(t.state);
          const prev = report.transitions[i - 1];
          const last = i === report.transitions.length - 1;
          return (
            <View key={`${t.state}-${i}`} style={styles.tlRow}>
              <View style={styles.tlRail}>
                <View
                  style={[
                    styles.tlDot,
                    { backgroundColor: color.dot, borderColor: color.halo },
                  ]}
                />
                {!last && <View style={styles.tlLine} />}
              </View>
              <View style={styles.tlBody}>
                <View>
                  <Text style={styles.tlState}>{STATE_LABEL[t.state]}</Text>
                  <Text style={styles.tlTime}>
                    {clock(report.startedAt, t.atMs)}
                  </Text>
                </View>
                <Text style={styles.tlTime}>
                  {prev ? `+${Math.round(t.atMs - prev.atMs)} ms` : '—'}
                </Text>
              </View>
            </View>
          );
        })}
      </View>

      <View style={[styles.card, styles.logCard]}>
        <View style={styles.logHead}>
          <Text style={styles.cardTitle}>Log de comandos</Text>
          <Text style={styles.maskedChip}>dados mascarados</Text>
        </View>
        <View style={styles.log}>
          {report.exchanges.length === 0 && (
            <Text style={styles.cardLabel}>Nenhum comando registrado.</Text>
          )}
          {report.exchanges.map((e, i) => (
            <View
              key={i}
              testID="cashtap-diagnostics-exchange"
              style={styles.logPair}
            >
              <Text style={styles.logLine}>
                <Text style={{ color: p.accent }}>→ </Text>
                {e.command}{' '}
                <Text style={{ color: p.muted }}>
                  {STEP_SHORT[e.step] ?? e.step}
                </Text>
              </Text>
              <Text style={styles.logLine}>
                <Text style={{ color: p.success }}>← </Text>
                {abbreviate(e.response)}
                {e.sw}{' '}
                <Text
                  style={{ color: p.muted }}
                >{`${Math.round(e.durationMs)} ms`}</Text>
              </Text>
            </View>
          ))}
        </View>
      </View>

      <Pressable
        accessibilityRole="button"
        style={styles.secondary}
        onPress={() => Share.share({ message: diagnosticsToText(report) })}
        testID="cashtap-diagnostics-export"
      >
        <Text style={styles.secondaryLabel}>Exportar diagnóstico</Text>
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 20,
    paddingTop: 4,
    paddingBottom: 30,
    gap: 12,
  },
  twoCols: { flexDirection: 'row', gap: 10 },
  col: { flex: 1 },
  card: {
    borderRadius: 18,
    padding: 16,
    backgroundColor: p.glass,
    borderWidth: 1,
    borderColor: p.border,
    gap: 8,
  },
  cardHead: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
  },
  cardTitle: { fontSize: 15, fontWeight: '700', color: p.text },
  cardLabel: { fontSize: 13, color: p.muted },
  mb: { marginBottom: 2 },
  pill: {
    alignSelf: 'flex-start',
    height: 32,
    paddingHorizontal: 12,
    borderRadius: 999,
    justifyContent: 'center',
  },
  pillLabel: { fontSize: 16, fontWeight: '700' },
  bigValue: {
    fontSize: 24,
    fontWeight: '700',
    color: p.text,
    fontVariant: ['tabular-nums'],
  },
  barRow: { flexDirection: 'row', alignItems: 'center', gap: 10, height: 28 },
  barLabel: {
    width: 44,
    fontFamily: mono,
    fontSize: 13,
    fontWeight: '600',
    color: p.text,
  },
  barTrack: {
    flex: 1,
    height: 22,
    borderRadius: 7,
    backgroundColor: p.track,
    overflow: 'hidden',
  },
  bar: { height: 22, borderRadius: 7, backgroundColor: p.primary },
  barValue: {
    width: 64,
    textAlign: 'right',
    fontFamily: mono,
    fontSize: 13,
    color: p.text,
  },
  tlRow: { flexDirection: 'row', gap: 12, minHeight: 40 },
  tlRail: { width: 12, alignItems: 'center' },
  tlDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    marginTop: 4,
    borderWidth: 3,
  },
  tlLine: { flex: 1, width: 2, marginVertical: 4, backgroundColor: p.border },
  tlBody: {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 8,
    paddingBottom: 10,
  },
  tlState: { fontSize: 14, fontWeight: '600', color: p.text },
  tlTime: { fontFamily: mono, fontSize: 12, color: p.muted },
  logCard: { padding: 0, overflow: 'hidden', gap: 0 },
  logHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
  },
  maskedChip: {
    fontSize: 12,
    fontWeight: '600',
    color: p.muted,
    backgroundColor: p.glassStrong,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    overflow: 'hidden',
  },
  log: {
    backgroundColor: p.codeBg,
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 6,
  },
  logPair: { gap: 4 },
  logLine: { fontFamily: mono, fontSize: 11.5, lineHeight: 16, color: p.code },
  secondary: {
    height: 52,
    borderRadius: 16,
    backgroundColor: p.glass,
    borderWidth: 1,
    borderColor: p.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryLabel: { fontSize: 16, fontWeight: '600', color: p.text },
  empty: {
    flex: 1,
    paddingHorizontal: 32,
    paddingBottom: 60,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  emptyIcon: {
    width: 88,
    height: 88,
    borderRadius: 28,
    backgroundColor: p.glass,
    borderWidth: 1,
    borderColor: p.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyGlyph: { fontSize: 40, color: p.accent },
  emptyTitle: { fontSize: 20, fontWeight: '700', color: p.text },
  emptyHint: {
    fontSize: 15,
    lineHeight: 22,
    color: p.muted,
    textAlign: 'center',
  },
  primary: {
    marginTop: 8,
    height: 52,
    paddingHorizontal: 24,
    borderRadius: 16,
    backgroundColor: p.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryLabel: { color: '#FFFFFF', fontSize: 16, fontWeight: '600' },
});
