import {
  useEffect,
  useMemo,
  useSyncExternalStore,
  type ReactNode,
} from 'react';
import {
  ActivityIndicator,
  Animated,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  Vibration,
  View,
  type TextStyle,
} from 'react-native';
import {
  cancel,
  dispatchFromUi,
  getActiveSession,
  subscribeActiveSession,
  type ActiveSession,
} from '../core/controller';
import { nativeOpenNfcSettings } from '../native';
import { brandLabel, formatAmount, formatExpiry } from './format';
import {
  CardErrorIcon,
  CheckIcon,
  ClockIcon,
  ContactlessIcon,
  LockIcon,
  NfcOffIcon,
  RetryIcon,
} from './icons';
import { useEntrance, useLoop, useReduceMotion, useShake } from './motion';
import { NfcStage } from './NfcStage';
import {
  fill,
  resolveAppearance,
  type CashTapAppearance,
  type ResolvedAppearance,
} from './theme';

/** Hápticos do design (Android): padrões de Vibration. */
const HAPTICS = {
  cardDetected: 15,
  retry: 30,
  success: [0, 40, 60, 40],
  error: [0, 80, 40, 80],
};

const STEP_LABELS = ['PPSE', 'AID', 'GPO', 'READ'];

function useActiveSession(): ActiveSession | null {
  return useSyncExternalStore(
    subscribeActiveSession,
    getActiveSession,
    getActiveSession
  );
}

/** Sem NFC no aparelho a tela não abre (RN-01); cancelado fecha na hora. */
function isVisible(session: ActiveSession | null): session is ActiveSession {
  if (!session) return false;
  if (session.state === 'IDLE' || session.state === 'CANCELLED') return false;
  if (session.state === 'ERROR' && session.error?.code === 'NFC_UNSUPPORTED')
    return false;
  return true;
}

export function CashTapModal({
  appearance,
}: {
  appearance?: CashTapAppearance;
}) {
  const session = useActiveSession();
  const visible = isVisible(session);
  const resolved = useMemo(
    () => resolveAppearance(appearance, session?.params.appearance),
    [appearance, session?.params.appearance]
  );
  const { colors, borderRadius } = resolved.theme;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      statusBarTranslucent
      onRequestClose={cancel}
      testID="cashtap-modal"
    >
      <View style={[styles.scrim, { backgroundColor: colors.scrim }]}>
        {visible && (
          <Sheet appearance={resolved} borderRadius={borderRadius}>
            <Header appearance={resolved} />
            <Amount session={session} appearance={resolved} />
            <StateBody
              key={session.state}
              session={session}
              appearance={resolved}
            />
          </Sheet>
        )}
      </View>
    </Modal>
  );
}

// ---- Estrutura ----

function Sheet({
  appearance,
  borderRadius,
  children,
}: {
  appearance: ResolvedAppearance;
  borderRadius: number;
  children: ReactNode;
}) {
  const reduce = useReduceMotion();
  const enter = useEntrance(350, { enabled: !reduce });
  const { colors } = appearance.theme;
  return (
    <Animated.View
      accessibilityViewIsModal
      style={[
        styles.sheet,
        {
          backgroundColor: colors.background,
          borderColor: colors.border,
          borderTopLeftRadius: borderRadius * 2,
          borderTopRightRadius: borderRadius * 2,
          opacity: enter,
          transform: [
            {
              translateY: enter.interpolate({
                inputRange: [0, 1],
                outputRange: [16, 0],
              }),
            },
          ],
        },
      ]}
    >
      <View style={styles.sheetHighlight} />
      {children}
    </Animated.View>
  );
}

function useText(appearance: ResolvedAppearance) {
  const { colors, fontFamily, monoFontFamily } = appearance.theme;
  return useMemo(() => {
    const font: TextStyle = fontFamily ? { fontFamily } : {};
    return {
      title: [styles.title, font, { color: colors.text }],
      titleS: [styles.titleS, font, { color: colors.text }],
      body: [styles.body, font, { color: colors.textMuted }],
      label: [styles.label, font, { color: colors.textMuted }],
      strong: [styles.strong, font, { color: colors.text }],
      mono: [styles.mono, { fontFamily: monoFontFamily, color: colors.text }],
    };
  }, [colors, fontFamily, monoFontFamily]);
}

function Header({ appearance }: { appearance: ResolvedAppearance }) {
  const { colors } = appearance.theme;
  const text = useText(appearance);
  return (
    <View style={styles.header}>
      <View style={[styles.logo, { backgroundColor: colors.primary }]}>
        <ContactlessIcon size={18} color={colors.onPrimary} />
      </View>
      <Text style={text.strong}>{appearance.texts.brandName}</Text>
      <View style={styles.flex} />
      <View
        style={[
          styles.secureChip,
          { backgroundColor: colors.surface, borderColor: colors.border },
        ]}
      >
        <LockIcon size={13} color={colors.textMuted} />
        <Text style={[text.label, styles.secureLabel]}>
          {appearance.texts.secureBadge}
        </Text>
      </View>
    </View>
  );
}

function Amount({ session, appearance }: ViewProps) {
  const { colors, fontFamily } = appearance.theme;
  const text = useText(appearance);
  return (
    <View style={styles.amountBlock}>
      <Text style={text.label}>{appearance.texts.amountLabel}</Text>
      <Text
        style={[
          styles.amount,
          fontFamily ? { fontFamily } : null,
          { color: colors.text },
        ]}
        testID="cashtap-amount"
        accessibilityRole="header"
      >
        {formatAmount(session.params.amountCents, session.params.currencyCode)}
      </Text>
    </View>
  );
}

type ViewProps = { session: ActiveSession; appearance: ResolvedAppearance };

function Button({
  label,
  onPress,
  appearance,
  variant = 'primary',
  testID,
  children,
}: {
  label: string;
  onPress?: () => void;
  appearance: ResolvedAppearance;
  variant?: 'primary' | 'secondary' | 'ghost';
  testID?: string;
  children?: ReactNode;
}) {
  const { colors, fontFamily, borderRadius } = appearance.theme;
  const background =
    variant === 'primary'
      ? colors.primary
      : variant === 'secondary'
        ? colors.surface
        : 'transparent';
  const color =
    variant === 'primary'
      ? colors.onPrimary
      : variant === 'secondary'
        ? colors.text
        : colors.textMuted;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: !onPress }}
      disabled={!onPress}
      onPress={onPress}
      testID={testID}
      style={({ pressed }) => [
        styles.button,
        variant === 'ghost' && styles.ghostButton,
        {
          backgroundColor: background,
          borderRadius,
          borderColor: variant === 'secondary' ? colors.border : 'transparent',
          transform: [{ scale: pressed ? 0.97 : 1 }],
        },
      ]}
    >
      {children}
      <Text
        style={[
          styles.buttonLabel,
          fontFamily ? { fontFamily } : null,
          { color },
        ]}
      >
        {label}
      </Text>
    </Pressable>
  );
}

function Texts({
  appearance,
  title,
  hint,
  small = false,
  children,
}: {
  appearance: ResolvedAppearance;
  title: string;
  hint?: string;
  small?: boolean;
  children?: ReactNode;
}) {
  const text = useText(appearance);
  return (
    <View style={styles.texts}>
      <Text
        style={small ? text.titleS : text.title}
        accessibilityLiveRegion="polite"
      >
        {title}
      </Text>
      {hint ? <Text style={text.body}>{hint}</Text> : null}
      {children}
    </View>
  );
}

function Stage({ children }: { children: ReactNode }) {
  return <View style={styles.stage}>{children}</View>;
}

/** Círculo de estado (StateBadge do design). */
function Badge({
  size = 112,
  background,
  children,
  motion = 'none',
  reduce,
}: {
  size?: number;
  background: string;
  children: ReactNode;
  motion?: 'pop' | 'shake' | 'none';
  reduce: boolean;
}) {
  const pop = useEntrance(450, {
    enabled: motion === 'pop' && !reduce,
    spring: true,
  });
  const shake = useShake(motion === 'shake' && !reduce);
  return (
    <Animated.View
      style={[
        styles.badge,
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: background,
          transform: [
            { translateX: shake },
            {
              scale:
                motion === 'pop'
                  ? pop.interpolate({
                      inputRange: [0, 1],
                      outputRange: [0.4, 1],
                    })
                  : 1,
            },
          ],
        },
      ]}
    >
      {children}
    </Animated.View>
  );
}

function Spinner({
  color,
  track,
  size = 88,
  width = 5,
  duration = 900,
}: {
  color: string;
  track: string;
  size?: number;
  width?: number;
  duration?: number;
}) {
  const reduce = useReduceMotion();
  const spin = useLoop(duration, { enabled: !reduce });
  if (reduce) return <ActivityIndicator size="large" color={color} />;
  return (
    <View style={{ width: size, height: size }}>
      <View
        style={[
          styles.fill,
          { borderRadius: size / 2, borderWidth: width, borderColor: track },
        ]}
      />
      <Animated.View
        style={[
          styles.fill,
          styles.spinnerArc,
          {
            borderRadius: size / 2,
            borderWidth: width,
            borderTopColor: color,
            borderRightColor: color,
            transform: [
              {
                rotate: spin.interpolate({
                  inputRange: [0, 1],
                  outputRange: ['0deg', '360deg'],
                }),
              },
            ],
          },
        ]}
      />
    </View>
  );
}

function useHaptic(pattern: number | number[]) {
  useEffect(() => {
    Vibration.vibrate(pattern);
  }, [pattern]);
}

// ---- Uma view por estado ----

function StateBody({ session, appearance }: ViewProps) {
  switch (session.state) {
    case 'CHECKING':
      return <CheckingView appearance={appearance} />;
    case 'WAITING_CARD':
      return <WaitingView session={session} appearance={appearance} />;
    case 'READING':
      return <ReadingView session={session} appearance={appearance} />;
    case 'RECOVERABLE_FAILURE':
      return <RecoverableView session={session} appearance={appearance} />;
    case 'PROCESSING':
      return <ProcessingView appearance={appearance} />;
    case 'SUCCESS':
      return <SuccessView session={session} appearance={appearance} />;
    case 'TIMEOUT':
      return <TimeoutView session={session} appearance={appearance} />;
    case 'ERROR':
      return session.error?.code === 'NFC_DISABLED' ? (
        <NfcDisabledView appearance={appearance} />
      ) : (
        <ErrorView session={session} appearance={appearance} />
      );
    default:
      return null;
  }
}

function CheckingView({ appearance }: { appearance: ResolvedAppearance }) {
  const { colors } = appearance.theme;
  return (
    <View style={styles.body} testID="cashtap-state-checking">
      <Stage>
        <Spinner color={colors.primary} track={colors.surfaceStrong} />
      </Stage>
      <Texts
        appearance={appearance}
        title={appearance.texts.checkingTitle}
        hint={appearance.texts.checkingHint}
        small
      />
      <View style={styles.actionSpacer} />
    </View>
  );
}

function WaitingView({ session, appearance }: ViewProps) {
  const reduce = useReduceMotion();
  const retrying = session.failures > 0;
  return (
    <View style={styles.body} testID="cashtap-state-waiting">
      <Stage>
        <NfcStage
          theme={appearance.theme}
          mode="waiting"
          reduceMotion={reduce}
        />
      </Stage>
      <Texts
        appearance={appearance}
        title={appearance.texts.waitingTitle}
        hint={
          retrying
            ? appearance.texts.waitingRetryHint
            : appearance.texts.waitingHint
        }
      >
        {retrying && <AttemptChip session={session} appearance={appearance} />}
      </Texts>
      <Button
        label={appearance.texts.cancel}
        onPress={cancel}
        appearance={appearance}
        variant="secondary"
        testID="cashtap-cancel"
      />
    </View>
  );
}

function ReadingView({ session, appearance }: ViewProps) {
  const reduce = useReduceMotion();
  const { colors, monoFontFamily } = appearance.theme;
  useHaptic(HAPTICS.cardDetected);
  const done = Math.max(0, Math.min(4, session.progress ?? 0));
  return (
    <View style={styles.body} testID="cashtap-state-reading">
      <Stage>
        <NfcStage
          theme={appearance.theme}
          mode="reading"
          reduceMotion={reduce}
        />
      </Stage>
      <Texts
        appearance={appearance}
        title={appearance.texts.readingTitle}
        hint={appearance.texts.readingHint}
      />
      <View style={styles.progress} testID="cashtap-progress">
        <View style={[styles.track, { backgroundColor: colors.surfaceStrong }]}>
          <View
            testID="cashtap-progress-fill"
            style={[
              styles.trackFill,
              {
                width: `${Math.max(8, done * 25)}%`,
                backgroundColor: colors.primarySoft,
              },
            ]}
          />
        </View>
        <View style={styles.steps}>
          {STEP_LABELS.map((label, i) => (
            <Text
              key={label}
              style={[
                styles.step,
                {
                  fontFamily: monoFontFamily,
                  color:
                    i < done
                      ? colors.text
                      : i === done
                        ? colors.primarySoft
                        : colors.textMuted,
                },
              ]}
            >
              {label}
            </Text>
          ))}
        </View>
      </View>
      {session.cancelRequested ? (
        <Button
          label={appearance.texts.cancelling}
          appearance={appearance}
          variant="secondary"
          testID="cashtap-cancelling"
        >
          <ActivityIndicator size="small" color={colors.textMuted} />
        </Button>
      ) : (
        <Button
          label={appearance.texts.cancel}
          onPress={cancel}
          appearance={appearance}
          variant="secondary"
          testID="cashtap-cancel"
        />
      )}
    </View>
  );
}

function AttemptChip({ session, appearance }: ViewProps) {
  const { colors } = appearance.theme;
  const text = useText(appearance);
  const total = session.params.maxRetries + 1;
  const current = Math.min(session.failures + 1, total);
  return (
    <View
      style={[
        styles.attemptChip,
        { backgroundColor: colors.surface, borderColor: colors.border },
      ]}
    >
      <View style={styles.dots}>
        {Array.from({ length: total }, (_, i) => (
          <View
            key={i}
            style={[
              styles.dot,
              {
                backgroundColor:
                  i < current ? colors.warning : colors.surfaceStrong,
              },
            ]}
          />
        ))}
      </View>
      <Text style={[text.strong, styles.attemptLabel]} testID="cashtap-attempt">
        {fill(appearance.texts.attempt, { current, total })}
      </Text>
    </View>
  );
}

function RecoverableView({ session, appearance }: ViewProps) {
  const reduce = useReduceMotion();
  const text = useText(appearance);
  const { colors } = appearance.theme;
  const spin = useLoop(8000, { enabled: !reduce });
  useHaptic(HAPTICS.retry);
  return (
    <View style={styles.body} testID="cashtap-state-recoverable">
      <Stage>
        <View style={styles.retryStage}>
          <View
            style={[
              styles.fill,
              styles.round,
              { backgroundColor: colors.warningSoft },
            ]}
          />
          <Animated.View
            style={[
              styles.retryRing,
              {
                borderColor: colors.warning,
                transform: [
                  {
                    rotate: spin.interpolate({
                      inputRange: [0, 1],
                      outputRange: ['0deg', '360deg'],
                    }),
                  },
                ],
              },
            ]}
          />
          <Badge
            size={64}
            background={colors.warning}
            motion="shake"
            reduce={reduce}
          >
            <RetryIcon size={32} color={colors.onWarning} />
          </Badge>
        </View>
      </Stage>
      <Texts
        appearance={appearance}
        title={appearance.texts.recoverableTitle}
        small
      >
        {session.error?.message ? (
          <Text style={text.body}>{session.error.message}</Text>
        ) : null}
        <AttemptChip session={session} appearance={appearance} />
      </Texts>
      <Button
        label={appearance.texts.cancel}
        onPress={cancel}
        appearance={appearance}
        variant="secondary"
        testID="cashtap-cancel"
      />
    </View>
  );
}

function ProcessingView({ appearance }: { appearance: ResolvedAppearance }) {
  const { colors } = appearance.theme;
  return (
    <View style={styles.body} testID="cashtap-state-processing">
      <Stage>
        <View style={styles.processing}>
          <View
            style={[
              styles.fill,
              styles.round,
              styles.hairline,
              {
                backgroundColor: colors.surface,
                borderColor: colors.border,
              },
            ]}
          />
          <View style={styles.processingSpinner}>
            <Spinner
              color={colors.primary}
              track="transparent"
              size={124}
              width={4}
              duration={1000}
            />
          </View>
          <LockIcon size={40} color={colors.primarySoft} />
        </View>
      </Stage>
      <Texts
        appearance={appearance}
        title={appearance.texts.processingTitle}
        hint={appearance.texts.processingHint}
        small
      />
      <View style={styles.actionSpacer} />
    </View>
  );
}

function SuccessView({ session, appearance }: ViewProps) {
  const reduce = useReduceMotion();
  const { colors, monoFontFamily, borderRadius } = appearance.theme;
  const text = useText(appearance);
  const rippleA = useEntrance(1400, { delay: 300, enabled: !reduce });
  const rippleB = useEntrance(1400, { delay: 800, enabled: !reduce });
  const rise = useEntrance(400, { delay: 350, enabled: !reduce });
  useHaptic(HAPTICS.success);
  const card = session.card;
  const ripple = (value: Animated.Value) => (
    <Animated.View
      style={[
        styles.fill,
        styles.round,
        {
          backgroundColor: colors.success,
          opacity: value.interpolate({
            inputRange: [0, 1],
            outputRange: [reduce ? 0 : 0.55, 0],
          }),
          transform: [
            {
              scale: value.interpolate({
                inputRange: [0, 1],
                outputRange: [1, 2],
              }),
            },
          ],
        },
      ]}
    />
  );
  return (
    <View style={styles.body} testID="cashtap-state-success">
      <Stage>
        <View style={styles.successStage}>
          {ripple(rippleA)}
          {ripple(rippleB)}
          <Badge background={colors.success} motion="pop" reduce={reduce}>
            <CheckIcon size={56} color={colors.onSuccess} />
          </Badge>
        </View>
      </Stage>
      <Texts
        appearance={appearance}
        title={appearance.texts.successTitle}
        hint={appearance.texts.successHint}
      />
      {card && (
        <Animated.View
          style={[
            styles.cardRow,
            {
              backgroundColor: colors.surface,
              borderColor: colors.border,
              borderRadius,
              opacity: rise,
              transform: [
                {
                  translateY: rise.interpolate({
                    inputRange: [0, 1],
                    outputRange: [16, 0],
                  }),
                },
              ],
            },
          ]}
        >
          <View style={styles.brandBox}>
            <Text
              style={[
                styles.brandText,
                card.brand === 'mastercard' && styles.brandTextSmall,
              ]}
            >
              {card.brand === 'visa' ? 'VISA' : 'mastercard'}
            </Text>
          </View>
          <View style={styles.flex}>
            <Text
              style={[
                styles.pan,
                { fontFamily: monoFontFamily, color: colors.text },
              ]}
              testID="cashtap-card"
            >
              {card.panMasked}
            </Text>
            <Text
              style={text.label}
              accessibilityLabel={`${brandLabel(card.brand)}, ${appearance.texts.expiryLabel} ${formatExpiry(card.expiry)}`}
            >
              {`${appearance.texts.expiryLabel} ${formatExpiry(card.expiry)}`}
            </Text>
          </View>
        </Animated.View>
      )}
    </View>
  );
}

function TimeoutView({ session, appearance }: ViewProps) {
  const reduce = useReduceMotion();
  const { colors } = appearance.theme;
  useHaptic(HAPTICS.error);
  const seconds = Math.round((session.params.timeoutMs ?? 30_000) / 1000);
  return (
    <View style={styles.body} testID="cashtap-state-timeout">
      <Stage>
        <Badge background={colors.warningSoft} motion="pop" reduce={reduce}>
          <ClockIcon size={52} color={colors.warning} />
        </Badge>
      </Stage>
      <Texts
        appearance={appearance}
        title={appearance.texts.timeoutTitle}
        hint={fill(appearance.texts.timeoutHint, { seconds })}
        small
      />
      <Button
        label={appearance.texts.close}
        onPress={() => dispatchFromUi({ type: 'FINISH' })}
        appearance={appearance}
        testID="cashtap-close"
      />
    </View>
  );
}

function ErrorView({ session, appearance }: ViewProps) {
  const reduce = useReduceMotion();
  const { colors, monoFontFamily } = appearance.theme;
  useHaptic(HAPTICS.error);
  const code = session.error?.code ?? 'UNKNOWN';
  const title =
    code === 'UNSUPPORTED_BRAND'
      ? appearance.texts.unsupportedBrandTitle
      : appearance.texts.errorTitle;
  return (
    <View style={styles.body} testID="cashtap-state-error">
      <Stage>
        <Badge background={colors.errorSoft} motion="shake" reduce={reduce}>
          <CardErrorIcon
            size={52}
            color={colors.error}
            background={colors.background}
          />
        </Badge>
      </Stage>
      <Texts
        appearance={appearance}
        title={title}
        hint={session.error?.message}
        small
      >
        <Text
          style={[
            styles.codeChip,
            {
              fontFamily: monoFontFamily,
              color: colors.error,
              backgroundColor: colors.errorSoft,
            },
          ]}
          testID="cashtap-error-code"
        >
          {code}
        </Text>
      </Texts>
      <Button
        label={appearance.texts.close}
        onPress={() => dispatchFromUi({ type: 'FINISH' })}
        appearance={appearance}
        testID="cashtap-close"
      />
    </View>
  );
}

/** RN-02: orienta a ligar o NFC e oferece reverificação. */
function NfcDisabledView({ appearance }: { appearance: ResolvedAppearance }) {
  const { colors } = appearance.theme;
  return (
    <View style={styles.body} testID="cashtap-state-nfc-disabled">
      <Stage>
        <View
          style={[
            styles.badge,
            styles.nfcBadge,
            { backgroundColor: colors.surface, borderColor: colors.border },
          ]}
        >
          <NfcOffIcon size={48} color={colors.textMuted} slash={colors.error} />
        </View>
      </Stage>
      <Texts
        appearance={appearance}
        title={appearance.texts.nfcDisabledTitle}
        hint={appearance.texts.nfcDisabledHint}
        small
      />
      <View style={styles.actions}>
        <Button
          label={appearance.texts.openSettings}
          onPress={nativeOpenNfcSettings}
          appearance={appearance}
          testID="cashtap-open-settings"
        />
        <Button
          label={appearance.texts.recheck}
          onPress={() => dispatchFromUi({ type: 'RECHECK' })}
          appearance={appearance}
          variant="secondary"
          testID="cashtap-recheck"
        />
        <Button
          label={appearance.texts.cancel}
          onPress={cancel}
          appearance={appearance}
          variant="ghost"
          testID="cashtap-cancel"
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  fill: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0 },
  round: { borderRadius: 999 },
  spinnerArc: { borderColor: 'transparent' },
  hairline: { borderWidth: 1 },
  scrim: { flex: 1, justifyContent: 'flex-end' },
  sheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    top: '14%',
    borderTopWidth: 1,
    paddingTop: 18,
    paddingHorizontal: 20,
    paddingBottom: 30,
    elevation: 24,
  },
  sheetHighlight: {
    position: 'absolute',
    left: 40,
    right: 40,
    top: 0,
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.35)',
  },
  header: { flexDirection: 'row', alignItems: 'center', gap: 10, height: 40 },
  logo: {
    width: 30,
    height: 30,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
  },
  secureChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    height: 30,
    paddingHorizontal: 12,
    borderRadius: 999,
    borderWidth: 1,
  },
  secureLabel: { fontSize: 12 },
  amountBlock: { alignItems: 'center', gap: 2, marginTop: 14 },
  amount: {
    fontSize: 42,
    lineHeight: 52,
    fontWeight: '700',
    letterSpacing: -0.8,
    fontVariant: ['tabular-nums'],
  },
  body: { flex: 1 },
  stage: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  texts: { alignItems: 'center', gap: 6, marginBottom: 24 },
  title: {
    fontSize: 24,
    lineHeight: 32,
    fontWeight: '700',
    textAlign: 'center',
  },
  titleS: {
    fontSize: 22,
    lineHeight: 30,
    fontWeight: '700',
    textAlign: 'center',
  },
  body15: { fontSize: 15 },
  bodyText: { fontSize: 15, lineHeight: 22, textAlign: 'center' },
  label: { fontSize: 14, lineHeight: 20 },
  strong: { fontSize: 15, fontWeight: '600' },
  mono: { fontSize: 12 },
  actionSpacer: { height: 52 },
  actions: { gap: 10 },
  button: {
    minHeight: 52,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    borderWidth: 1,
    paddingHorizontal: 16,
  },
  ghostButton: { minHeight: 48 },
  buttonLabel: { fontSize: 16, fontWeight: '600' },
  badge: { alignItems: 'center', justifyContent: 'center' },
  nfcBadge: { width: 104, height: 104, borderRadius: 52, borderWidth: 1 },
  progress: { gap: 8, marginBottom: 20 },
  track: { height: 8, borderRadius: 4, overflow: 'hidden' },
  trackFill: { height: 8, borderRadius: 4 },
  steps: { flexDirection: 'row' },
  step: { flex: 1, textAlign: 'center', fontSize: 12, fontWeight: '600' },
  attemptChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    height: 32,
    paddingHorizontal: 14,
    borderRadius: 999,
    borderWidth: 1,
    marginTop: 6,
  },
  dots: { flexDirection: 'row', gap: 5 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  attemptLabel: { fontSize: 14 },
  retryStage: {
    width: 132,
    height: 132,
    alignItems: 'center',
    justifyContent: 'center',
  },
  retryRing: {
    position: 'absolute',
    top: 16,
    left: 16,
    right: 16,
    bottom: 16,
    borderRadius: 999,
    borderWidth: 2,
    borderStyle: 'dashed',
  },
  processing: {
    width: 112,
    height: 112,
    alignItems: 'center',
    justifyContent: 'center',
  },
  processingSpinner: { position: 'absolute', top: -6, left: -6 },
  successStage: { width: 112, height: 112 },
  cardRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    height: 72,
    paddingHorizontal: 16,
    borderWidth: 1,
  },
  brandBox: {
    width: 52,
    height: 34,
    borderRadius: 7,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 2,
  },
  brandText: {
    fontSize: 15,
    fontWeight: '800',
    fontStyle: 'italic',
    color: '#1A1F71',
    letterSpacing: -0.3,
  },
  brandTextSmall: { fontSize: 9 },
  pan: { fontSize: 15, fontWeight: '500', letterSpacing: 0.3 },
  codeChip: {
    fontSize: 12,
    fontWeight: '600',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
    overflow: 'hidden',
    marginTop: 4,
  },
});
