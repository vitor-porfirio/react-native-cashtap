import { Animated, Easing, StyleSheet, Text, View } from 'react-native';
import { ContactlessIcon } from './icons';
import { useLoop } from './motion';
import type { CashTapTheme } from './theme';

const PHONE_W = 132;
const PHONE_H = 236;
const RING = 60;
const RING_LEFT = 36;
const RING_TOP = 80;
const CARD_EDGE = 'rgba(255,255,255,0.35)';

type Props = {
  theme: CashTapTheme;
  mode: 'waiting' | 'reading';
  reduceMotion: boolean;
};

/**
 * Palco da aproximação (NfcStage do design): traseira do celular com o alvo
 * NFC, ondas e o cartão. Aguardando: cartão em loop até a antena. Lendo:
 * cartão fixo sobre a antena, ondas mais rápidas e brilho varrendo.
 */
export function NfcStage({ theme, mode, reduceMotion }: Props) {
  const { colors } = theme;
  const reading = mode === 'reading';
  const period = reading ? 1200 : 2400;
  const animate = !reduceMotion;
  const ringA = useLoop(period, {
    enabled: animate,
    easing: Easing.out(Easing.quad),
  });
  const ringB = useLoop(period, {
    delay: period / 3,
    enabled: animate,
    easing: Easing.out(Easing.quad),
  });
  const ringC = useLoop(period, {
    delay: (2 * period) / 3,
    enabled: animate && !reading,
    easing: Easing.out(Easing.quad),
  });
  const tap = useLoop(3200, {
    enabled: animate && !reading,
    easing: Easing.inOut(Easing.cubic),
  });
  const shimmer = useLoop(1300, { enabled: animate && reading });

  const ring = (value: Animated.Value, key: string) => (
    <Animated.View
      key={key}
      style={[
        styles.ring,
        {
          borderColor: colors.primarySoft,
          opacity: value.interpolate({
            inputRange: [0, 1],
            outputRange: [0.95, 0],
          }),
          transform: [
            {
              scale: value.interpolate({
                inputRange: [0, 1],
                outputRange: [0.55, 2.6],
              }),
            },
          ],
        },
      ]}
    />
  );

  // ctTap: entra pela diagonal, assenta sobre a antena (−6°), espera e volta.
  const cardMotion =
    reading || !animate
      ? { transform: [{ rotate: '-6deg' }], opacity: 1 }
      : {
          opacity: tap.interpolate({
            inputRange: [0, 0.18, 0.72, 1],
            outputRange: [0, 1, 1, 0],
          }),
          transform: [
            {
              translateX: tap.interpolate({
                inputRange: [0, 0.45, 0.72, 1],
                outputRange: [96, 0, 0, 96],
              }),
            },
            {
              translateY: tap.interpolate({
                inputRange: [0, 0.45, 0.72, 1],
                outputRange: [120, 0, 0, 120],
              }),
            },
            {
              rotate: tap.interpolate({
                inputRange: [0, 0.45, 0.72, 1],
                outputRange: ['22deg', '-6deg', '-6deg', '22deg'],
              }),
            },
          ],
        };

  return (
    <View
      style={[
        styles.phone,
        { borderColor: colors.line, backgroundColor: colors.surface },
      ]}
      testID={reading ? 'cashtap-stage-reading' : 'cashtap-pulse'}
      importantForAccessibility="no-hide-descendants"
    >
      <View style={[styles.camera, { borderColor: colors.line }]}>
        <View style={[styles.lens, { borderColor: colors.line }]} />
        <View style={[styles.lens, { borderColor: colors.line }]} />
      </View>
      {ring(ringA, 'a')}
      {ring(ringB, 'b')}
      {!reading && ring(ringC, 'c')}
      {!reading && (
        <View
          style={[
            styles.target,
            { backgroundColor: colors.primary, shadowColor: colors.primary },
          ]}
        >
          <ContactlessIcon size={22} color={colors.onPrimary} />
        </View>
      )}
      {!reading && (
        <Text style={[styles.nfcLabel, { color: colors.textMuted }]}>NFC</Text>
      )}
      <Animated.View
        style={[
          styles.card,
          reading ? styles.cardReading : styles.cardIdle,
          {
            backgroundColor: colors.card,
            borderRadius: Math.min(theme.borderRadius, 12),
            borderColor: reading ? colors.primarySoft : CARD_EDGE,
          },
          cardMotion,
        ]}
      >
        <View style={styles.chip} />
        {!reading && (
          <ContactlessIcon size={18} color="#FFFFFF" style={styles.cardIcon} />
        )}
        <Text style={[styles.cardNumber, { fontFamily: theme.monoFontFamily }]}>
          •••• 1111
        </Text>
        {reading && animate && (
          <Animated.View
            style={[
              styles.shimmer,
              {
                transform: [
                  {
                    translateX: shimmer.interpolate({
                      inputRange: [0, 1],
                      outputRange: [-60, 190],
                    }),
                  },
                ],
              },
            ]}
          />
        )}
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  phone: {
    width: PHONE_W,
    height: PHONE_H,
    borderRadius: 26,
    borderWidth: 1.5,
  },
  camera: {
    position: 'absolute',
    top: 14,
    left: 14,
    width: 40,
    height: 58,
    borderRadius: 13,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  lens: { width: 14, height: 14, borderRadius: 7, borderWidth: 1.5 },
  ring: {
    position: 'absolute',
    left: RING_LEFT,
    top: RING_TOP,
    width: RING,
    height: RING,
    borderRadius: RING / 2,
    borderWidth: 2,
  },
  target: {
    position: 'absolute',
    left: 46,
    top: 90,
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 10,
  },
  nfcLabel: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 150,
    textAlign: 'center',
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 1.3,
  },
  card: {
    position: 'absolute',
    left: -9,
    top: 63,
    width: 150,
    height: 94,
    overflow: 'hidden',
    elevation: 10,
  },
  cardIdle: { borderWidth: 1 },
  cardReading: { borderWidth: 3 },
  chip: {
    position: 'absolute',
    left: 14,
    top: 16,
    width: 22,
    height: 16,
    borderRadius: 4,
    backgroundColor: '#E2C26F',
  },
  cardIcon: { position: 'absolute', right: 12, top: 14 },
  cardNumber: {
    position: 'absolute',
    left: 14,
    bottom: 12,
    fontSize: 11,
    color: '#FFFFFF',
    letterSpacing: 0.9,
  },
  shimmer: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    width: 40,
    backgroundColor: 'rgba(255,255,255,0.35)',
  },
});
