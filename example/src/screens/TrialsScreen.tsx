import { useMemo, useState } from 'react';
import { ScrollView, Share, StyleSheet, Text, View } from 'react-native';
import { capture } from 'react-native-cashtap';
import {
  measurementsToCsv,
  toMeasurementRow,
  type MeasurementRow,
} from 'react-native-cashtap/dev';
import {
  AppBar,
  Glass,
  PrimaryButton,
  Segmented,
  SecondaryButton,
} from '../components/ui';
import { formatSeconds } from '../format';
import { c, mono } from '../theme';

/**
 * Ensaios de validação (TCC §3.5, Apêndice B; design B10/B11):
 * 3 sessões, 30 leituras por bandeira. A linha de medição vem pronta do SDK.
 */
type Brand = 'visa' | 'mastercard';
export type Trial = MeasurementRow & {
  n: number;
  sessao: number;
  cartao: Brand;
};

const PER_BRAND = 30;
const TRIAL_AMOUNT_CENTS = 100;

const OUTCOME_LOOK: Record<
  MeasurementRow['outcome'],
  { label: string; color: string; soft: string }
> = {
  success: { label: 'Sucesso', color: c.success, soft: c.successSoft },
  recovered: { label: 'Recuperado', color: c.warning, soft: c.warningSoft },
  failure: { label: 'Falha', color: c.error, soft: c.errorSoft },
  timeout: { label: 'Expirado', color: c.error, soft: c.errorSoft },
  cancelled: { label: 'Cancelado', color: c.muted, soft: c.neutralSoft },
};

/** Os ensaios vivem no App: sair desta tela não perde as leituras já registradas. */
type Props = {
  onBack: () => void;
  trials: Trial[];
  setTrials: (update: (list: Trial[]) => Trial[]) => void;
};

export function TrialsScreen({ onBack, trials, setTrials }: Props) {
  const [session, setSession] = useState(1);
  const [brand, setBrand] = useState<Brand>('visa');
  const [running, setRunning] = useState(false);
  const [integrationError, setIntegrationError] = useState<string | null>(null);
  const [exported, setExported] = useState(false);

  const current = useMemo(
    () => trials.filter((t) => t.sessao === session && t.cartao === brand),
    [trials, session, brand]
  );
  const stats = {
    success: current.filter((t) => t.outcome === 'success').length,
    recovered: current.filter((t) => t.outcome === 'recovered').length,
    failure: current.filter(
      (t) => t.outcome !== 'success' && t.outcome !== 'recovered'
    ).length,
  };

  const run = async () => {
    setRunning(true);
    setIntegrationError(null);
    try {
      const result = await capture({
        amountCents: TRIAL_AMOUNT_CENTS,
        reference: `ensaio-s${session}-${brand}-${current.length + 1}`,
        diagnostics: true,
      });
      setExported(false);
      setTrials((list) => [
        ...list,
        {
          ...toMeasurementRow(result),
          n: list.length + 1,
          sessao: session,
          cartao: brand,
        },
      ]);
    } catch (error) {
      // capture() só rejeita por erro de integração; nenhuma leitura é registrada.
      setIntegrationError(
        error instanceof Error ? error.message : String(error)
      );
    } finally {
      setRunning(false);
    }
  };

  // Um arquivo por sessão (protocolo dos ensaios): só as tentativas da sessão selecionada,
  // mesmo que o app tenha ficado aberto desde a sessão anterior.
  const sessionTrials = trials.filter((t) => t.sessao === session);
  const exportCsv = async () => {
    await Share.share({
      title: `sessao-${session}.csv`,
      message: measurementsToCsv(sessionTrials, ['n', 'sessao', 'cartao']),
    });
    setExported(true);
  };

  return (
    <View style={styles.flex}>
      <AppBar
        title="Ensaios"
        subtitle="Roteiro de testes para a banca"
        onBack={onBack}
      />
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.group}>
          <Text style={styles.muted}>Sessão</Text>
          <Segmented
            options={[1, 2, 3].map((n) => ({ value: n, label: `Sessão ${n}` }))}
            value={session}
            onChange={(next) => {
              setSession(next);
              setExported(false);
            }}
          />
        </View>
        <View style={styles.group}>
          <Text style={styles.muted}>Bandeira</Text>
          <Segmented
            options={[
              { value: 'visa' as const, label: 'Visa' },
              { value: 'mastercard' as const, label: 'Mastercard' },
            ]}
            value={brand}
            onChange={setBrand}
          />
        </View>

        <Glass radius={22} style={styles.counterCard}>
          <View style={styles.highlight} />
          <View style={styles.counterRow}>
            <Text style={styles.counter} testID="trials-counter">
              {current.length}
              <Text style={styles.counterTotal}>/{PER_BRAND}</Text>
            </Text>
            <Text
              style={styles.muted}
            >{`Sessão ${session} · ${brand === 'visa' ? 'Visa' : 'Mastercard'}`}</Text>
          </View>
          <View style={styles.track}>
            <View
              style={[
                styles.trackFill,
                {
                  width: `${Math.min(100, (current.length / PER_BRAND) * 100)}%`,
                },
              ]}
            />
          </View>
          <View style={styles.stats}>
            <Stat
              n={stats.success}
              label="Sucesso"
              color={c.success}
              soft={c.successSoft}
            />
            <Stat
              n={stats.recovered}
              label="Recuperado"
              color={c.warning}
              soft={c.warningSoft}
            />
            <Stat
              n={stats.failure}
              label="Falha"
              color={c.error}
              soft={c.errorSoft}
            />
          </View>
        </Glass>

        {integrationError && (
          <Text style={styles.integrationError}>{integrationError}</Text>
        )}
        <Text style={styles.sectionTitle}>Tentativas</Text>
        {current.length === 0 ? (
          <View style={styles.empty}>
            <Text style={styles.emptyTitle}>
              Nenhuma tentativa nesta sessão
            </Text>
            <Text style={styles.emptyHint}>
              Toque em “Nova tentativa” para registrar a primeira leitura.
            </Text>
          </View>
        ) : (
          <Glass>
            {[...current].reverse().map((t, i) => {
              const look = OUTCOME_LOOK[t.outcome];
              return (
                <View key={t.n} style={[styles.trialRow, i > 0 && styles.line]}>
                  <Text style={styles.trialN}>#{t.n}</Text>
                  <Text
                    style={[
                      styles.trialChip,
                      { color: look.color, backgroundColor: look.soft },
                    ]}
                  >
                    {look.label}
                  </Text>
                  <Text style={styles.trialCode} numberOfLines={1}>
                    {t.errorCode ||
                      (t.attempts > 1 ? `RETRY×${t.attempts - 1}` : '')}
                  </Text>
                  <Text style={styles.trialTime}>
                    {formatSeconds(t.totalMs)}
                  </Text>
                </View>
              );
            })}
          </Glass>
        )}
      </ScrollView>
      <View style={styles.footer}>
        <View style={styles.flex}>
          <SecondaryButton
            label={exported ? 'Exportado' : `Exportar sessão ${session}`}
            onPress={exportCsv}
            disabled={sessionTrials.length === 0}
            color={exported ? c.success : c.text}
          />
        </View>
        <View style={styles.flex}>
          <PrimaryButton
            label="Nova tentativa"
            onPress={run}
            disabled={running}
            testID="trials-run"
          />
        </View>
      </View>
    </View>
  );
}

function Stat({
  n,
  label,
  color,
  soft,
}: {
  n: number;
  label: string;
  color: string;
  soft: string;
}) {
  return (
    <View style={[styles.stat, { backgroundColor: soft }]}>
      <Text style={[styles.statN, { color }]}>{n}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  integrationError: { color: c.error, fontSize: 13, textAlign: 'center' },
  flex: { flex: 1 },
  content: { paddingHorizontal: 20, paddingTop: 4, paddingBottom: 16, gap: 14 },
  group: { gap: 6 },
  muted: { fontSize: 13, color: c.muted },
  counterCard: { padding: 18, gap: 12, overflow: 'hidden' },
  highlight: {
    position: 'absolute',
    left: 24,
    right: 24,
    top: 0,
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.45)',
  },
  counterRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
  },
  counter: {
    fontSize: 44,
    lineHeight: 50,
    fontWeight: '700',
    color: c.text,
    fontVariant: ['tabular-nums'],
  },
  counterTotal: { fontSize: 22, color: c.muted },
  track: {
    height: 8,
    borderRadius: 4,
    backgroundColor: c.track,
    overflow: 'hidden',
  },
  trackFill: { height: 8, borderRadius: 4, backgroundColor: c.accent },
  stats: { flexDirection: 'row', gap: 8 },
  stat: {
    flex: 1,
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 12,
    gap: 2,
  },
  statN: { fontSize: 18, fontWeight: '700' },
  statLabel: { fontSize: 12, color: c.text },
  sectionTitle: { fontSize: 15, fontWeight: '700', color: c.text },
  empty: {
    borderRadius: 18,
    paddingVertical: 28,
    paddingHorizontal: 20,
    backgroundColor: c.glass,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: c.borderStrong,
    alignItems: 'center',
    gap: 6,
  },
  emptyTitle: { fontSize: 16, fontWeight: '600', color: c.text },
  emptyHint: {
    fontSize: 14,
    lineHeight: 20,
    color: c.muted,
    textAlign: 'center',
  },
  trialRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    height: 56,
    paddingHorizontal: 14,
  },
  line: { borderTopWidth: 1, borderTopColor: c.border },
  trialN: { width: 34, fontFamily: mono, fontSize: 13, color: c.muted },
  trialChip: {
    fontSize: 13,
    fontWeight: '600',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    overflow: 'hidden',
  },
  trialCode: { flex: 1, fontFamily: mono, fontSize: 11, color: c.muted },
  trialTime: {
    fontSize: 15,
    fontWeight: '600',
    color: c.text,
    fontVariant: ['tabular-nums'],
  },
  footer: {
    flexDirection: 'row',
    gap: 10,
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 24,
  },
});
