/* eslint-disable react-native/no-inline-styles -- formas dimensionadas pelo tamanho do ícone */
import { StyleSheet, View, type ViewStyle } from 'react-native';

/**
 * Ícones do design (traço 2 dp, pontas arredondadas) desenhados só com View,
 * sem react-native-svg: o SDK não adiciona dependência nativa (D019).
 */
type IconProps = { size?: number; color: string; style?: ViewStyle };

/** Três arcos concêntricos: símbolo de pagamento por aproximação. */
export function ContactlessIcon({ size = 24, color, style }: IconProps) {
  const stroke = Math.max(2, size / 11);
  const arcs = [0.34, 0.62, 0.9];
  return (
    <View style={[{ width: size, height: size }, styles.center, style]}>
      {arcs.map((ratio) => {
        const d = size * ratio;
        return (
          <View
            key={ratio}
            style={{
              position: 'absolute',
              left: size * 0.18 - d / 2 + size * 0.1,
              width: d,
              height: d,
              borderRadius: d / 2,
              borderWidth: stroke,
              borderColor: 'transparent',
              borderRightColor: color,
            }}
          />
        );
      })}
    </View>
  );
}

export function CheckIcon({ size = 24, color, style }: IconProps) {
  const stroke = Math.max(2.4, size / 9);
  return (
    <View style={[{ width: size, height: size }, styles.center, style]}>
      <View
        style={{
          width: size * 0.32,
          height: size * 0.62,
          borderColor: color,
          borderRightWidth: stroke,
          borderBottomWidth: stroke,
          borderBottomRightRadius: stroke / 2,
          transform: [{ rotate: '45deg' }, { translateY: -size * 0.06 }],
        }}
      />
    </View>
  );
}

export function CrossIcon({ size = 24, color, style }: IconProps) {
  const stroke = Math.max(2, size / 11);
  const bar = {
    position: 'absolute' as const,
    width: size * 0.7,
    height: stroke,
    borderRadius: stroke,
    backgroundColor: color,
  };
  return (
    <View style={[{ width: size, height: size }, styles.center, style]}>
      <View style={[bar, { transform: [{ rotate: '45deg' }] }]} />
      <View style={[bar, { transform: [{ rotate: '-45deg' }] }]} />
    </View>
  );
}

export function ClockIcon({ size = 24, color, style }: IconProps) {
  const stroke = Math.max(2, size / 12);
  return (
    <View style={[{ width: size, height: size }, styles.center, style]}>
      <View
        style={{
          width: size * 0.78,
          height: size * 0.78,
          borderRadius: size,
          borderWidth: stroke,
          borderColor: color,
        }}
      />
      <View
        style={{
          position: 'absolute',
          width: stroke,
          height: size * 0.22,
          borderRadius: stroke,
          backgroundColor: color,
          top: size * 0.27,
        }}
      />
      <View
        style={{
          position: 'absolute',
          width: size * 0.18,
          height: stroke,
          borderRadius: stroke,
          backgroundColor: color,
          left: size * 0.5 - stroke / 2,
          top: size * 0.5,
          transform: [{ rotate: '30deg' }],
        }}
      />
    </View>
  );
}

export function LockIcon({ size = 24, color, style }: IconProps) {
  const stroke = Math.max(1.8, size / 12);
  return (
    <View style={[{ width: size, height: size }, styles.center, style]}>
      <View
        style={{
          position: 'absolute',
          top: size * 0.12,
          width: size * 0.4,
          height: size * 0.42,
          borderTopLeftRadius: size,
          borderTopRightRadius: size,
          borderWidth: stroke,
          borderBottomWidth: 0,
          borderColor: color,
        }}
      />
      <View
        style={{
          position: 'absolute',
          bottom: size * 0.12,
          width: size * 0.6,
          height: size * 0.4,
          borderRadius: size * 0.09,
          borderWidth: stroke,
          borderColor: color,
        }}
      />
    </View>
  );
}

/** Cartão com um "x": cartão não aceito. */
export function CardErrorIcon({
  size = 24,
  color,
  background,
  style,
}: IconProps & { background: string }) {
  const stroke = Math.max(2, size / 12);
  return (
    <View style={[{ width: size, height: size }, style]}>
      <View
        style={{
          position: 'absolute',
          left: size * 0.08,
          top: size * 0.2,
          width: size * 0.64,
          height: size * 0.46,
          borderRadius: size * 0.08,
          borderWidth: stroke,
          borderColor: color,
        }}
      />
      <View
        style={{
          position: 'absolute',
          left: size * 0.08,
          top: size * 0.34,
          width: size * 0.64,
          height: stroke,
          backgroundColor: color,
        }}
      />
      <View
        style={{
          position: 'absolute',
          right: size * 0.04,
          bottom: size * 0.1,
          width: size * 0.36,
          height: size * 0.36,
          borderRadius: size,
          backgroundColor: background,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <CrossIcon size={size * 0.3} color={color} />
      </View>
    </View>
  );
}

/** Contactless cortado: NFC desligado. */
export function NfcOffIcon({
  size = 24,
  color,
  slash,
  style,
}: IconProps & { slash: string }) {
  return (
    <View style={[{ width: size, height: size }, styles.center, style]}>
      <ContactlessIcon size={size} color={color} />
      <View
        style={{
          position: 'absolute',
          width: size * 0.95,
          height: Math.max(2, size / 11),
          borderRadius: size,
          backgroundColor: slash,
          transform: [{ rotate: '45deg' }],
        }}
      />
    </View>
  );
}

/** Seta circular: tentar novamente. */
export function RetryIcon({ size = 24, color, style }: IconProps) {
  const stroke = Math.max(2.2, size / 10);
  return (
    <View style={[{ width: size, height: size }, styles.center, style]}>
      <View
        style={{
          width: size * 0.7,
          height: size * 0.7,
          borderRadius: size,
          borderWidth: stroke,
          borderColor: color,
          borderTopColor: 'transparent',
          transform: [{ rotate: '45deg' }],
        }}
      />
      <View
        style={{
          position: 'absolute',
          right: size * 0.1,
          top: size * 0.12,
          width: size * 0.26,
          height: size * 0.26,
          borderColor: color,
          borderTopWidth: stroke,
          borderRightWidth: stroke,
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  center: { alignItems: 'center', justifyContent: 'center' },
});
