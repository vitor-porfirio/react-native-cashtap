import type { ReactNode } from 'react';
import {
  Pressable,
  StyleSheet,
  Text,
  View,
  type ViewStyle,
} from 'react-native';
import { c } from '../theme';

/** Fundo escuro com manchas de luz (design: blobs). */
export function Backdrop({ children }: { children: ReactNode }) {
  return (
    <View style={styles.backdrop}>
      <View style={[styles.blob, styles.blobA]} />
      <View style={[styles.blob, styles.blobB]} />
      <View style={[styles.blob, styles.blobC]} />
      {children}
    </View>
  );
}

export function Glass({
  children,
  style,
  radius = 18,
}: {
  children: ReactNode;
  style?: ViewStyle;
  radius?: number;
}) {
  return (
    <View style={[styles.glass, { borderRadius: radius }, style]}>
      {children}
    </View>
  );
}

export function PrimaryButton({
  label,
  onPress,
  disabled,
  height = 56,
  children,
  testID,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  height?: number;
  children?: ReactNode;
  testID?: string;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      testID={testID}
      style={({ pressed }) => [
        styles.primary,
        {
          height,
          opacity: disabled ? 0.45 : 1,
          transform: [{ scale: pressed ? 0.97 : 1 }],
        },
      ]}
    >
      {children}
      <Text style={styles.primaryLabel}>{label}</Text>
    </Pressable>
  );
}

export function SecondaryButton({
  label,
  onPress,
  disabled,
  children,
  color = c.text,
  testID,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  children?: ReactNode;
  color?: string;
  testID?: string;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      testID={testID}
      style={({ pressed }) => [
        styles.secondary,
        {
          opacity: disabled ? 0.45 : 1,
          transform: [{ scale: pressed ? 0.97 : 1 }],
        },
      ]}
    >
      {children}
      <Text style={[styles.secondaryLabel, { color }]}>{label}</Text>
    </Pressable>
  );
}

/** Barra superior com voltar (design: hasAppBar). */
export function AppBar({
  title,
  subtitle,
  onBack,
}: {
  title: string;
  subtitle: string;
  onBack: () => void;
}) {
  return (
    <View style={styles.appBar}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Voltar"
        onPress={onBack}
        style={styles.back}
        hitSlop={8}
      >
        <View style={styles.chevron} />
      </Pressable>
      <View style={styles.flex}>
        <Text style={styles.appBarTitle}>{title}</Text>
        <Text style={styles.appBarSubtitle}>{subtitle}</Text>
      </View>
    </View>
  );
}

/** Ponto + rótulo (StatusChip). */
export function StatusChip({
  label,
  color,
  soft,
}: {
  label: string;
  color: string;
  soft: string;
}) {
  return (
    <View style={[styles.chip, { backgroundColor: soft }]}>
      <View style={[styles.chipDot, { backgroundColor: color }]} />
      <Text style={[styles.chipLabel, { color }]}>{label}</Text>
    </View>
  );
}

export function Segmented<T extends string | number>({
  options,
  value,
  onChange,
}: {
  options: Array<{ value: T; label: string }>;
  value: T;
  onChange: (value: T) => void;
}) {
  return (
    <View style={styles.segment}>
      {options.map((option) => {
        const active = option.value === value;
        return (
          <Pressable
            key={String(option.value)}
            accessibilityRole="button"
            accessibilityState={{ selected: active }}
            onPress={() => onChange(option.value)}
            style={[styles.segmentItem, active && styles.segmentActive]}
          >
            <Text
              style={[
                styles.segmentLabel,
                active ? styles.segmentLabelActive : styles.segmentLabelIdle,
              ]}
            >
              {option.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/** Três arcos (símbolo contactless), sem SVG. */
export function Contactless({
  size = 22,
  color = '#FFFFFF',
}: {
  size?: number;
  color?: string;
}) {
  const stroke = Math.max(2, size / 11);
  return (
    <View style={[styles.contactless, { width: size, height: size }]}>
      {[0.34, 0.62, 0.9].map((r) => {
        const d = size * r;
        return (
          <View
            key={r}
            style={[
              styles.arc,
              {
                left: size * 0.28 - d / 2,
                width: d,
                height: d,
                borderRadius: d / 2,
                borderWidth: stroke,
                borderRightColor: color,
              },
            ]}
          />
        );
      })}
    </View>
  );
}

export const styles = StyleSheet.create({
  flex: { flex: 1 },
  backdrop: { flex: 1, backgroundColor: c.bg, overflow: 'hidden' },
  blob: { position: 'absolute', borderRadius: 999 },
  blobA: {
    width: 320,
    height: 320,
    left: -140,
    top: -60,
    backgroundColor: c.blobA,
  },
  blobB: {
    width: 280,
    height: 280,
    right: -140,
    top: 330,
    backgroundColor: c.blobB,
  },
  blobC: {
    width: 220,
    height: 220,
    left: -60,
    bottom: -80,
    backgroundColor: c.blobA,
  },
  segmentLabelActive: { color: '#FFFFFF' },
  segmentLabelIdle: { color: c.text },
  contactless: { alignItems: 'center', justifyContent: 'center' },
  arc: { position: 'absolute', borderColor: 'transparent' },
  glass: { backgroundColor: c.glass, borderWidth: 1, borderColor: c.border },
  primary: {
    borderRadius: 18,
    backgroundColor: c.primary,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.18)',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    elevation: 12,
    shadowColor: c.primary,
  },
  primaryLabel: { color: '#FFFFFF', fontSize: 17, fontWeight: '700' },
  secondary: {
    height: 56,
    borderRadius: 18,
    backgroundColor: c.glass,
    borderWidth: 1,
    borderColor: c.border,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  secondaryLabel: { fontSize: 16, fontWeight: '600' },
  appBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    height: 64,
    paddingLeft: 8,
    paddingRight: 12,
  },
  back: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chevron: {
    width: 12,
    height: 12,
    borderLeftWidth: 2.4,
    borderBottomWidth: 2.4,
    borderColor: c.text,
    transform: [{ rotate: '45deg' }, { translateX: 2 }],
  },
  appBarTitle: { fontSize: 19, fontWeight: '700', color: c.text },
  appBarSubtitle: { fontSize: 12, color: c.muted },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    height: 32,
    paddingHorizontal: 12,
    borderRadius: 999,
  },
  chipDot: { width: 7, height: 7, borderRadius: 4 },
  chipLabel: { fontSize: 12, fontWeight: '600' },
  segment: {
    flexDirection: 'row',
    gap: 4,
    padding: 4,
    borderRadius: 16,
    backgroundColor: c.glass,
    borderWidth: 1,
    borderColor: c.border,
  },
  segmentItem: {
    flex: 1,
    height: 44,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  segmentActive: {
    backgroundColor: c.primary,
    elevation: 6,
    shadowColor: c.primary,
  },
  segmentLabel: { fontSize: 15, fontWeight: '600' },
});
