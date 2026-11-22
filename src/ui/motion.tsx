import { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, Easing } from 'react-native';

/** Respeita "Remover animações" do Android: loops viram estado estático. */
export function useReduceMotion(): boolean {
  const [reduce, setReduce] = useState(false);
  useEffect(() => {
    let active = true;
    AccessibilityInfo.isReduceMotionEnabled()
      .then((value) => {
        if (active) setReduce(value);
      })
      .catch(() => undefined);
    const subscription = AccessibilityInfo.addEventListener(
      'reduceMotionChanged',
      setReduce
    );
    return () => {
      active = false;
      subscription.remove();
    };
  }, []);
  return reduce;
}

/** Valor 0 → 1 em loop. `delay` defasa o início (ondas de aproximação). */
export function useLoop(
  duration: number,
  options: {
    delay?: number;
    enabled?: boolean;
    easing?: (t: number) => number;
  } = {}
) {
  const { delay = 0, enabled = true, easing = Easing.linear } = options;
  const value = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!enabled) {
      value.setValue(0);
      return;
    }
    const animation = Animated.sequence([
      Animated.delay(delay),
      Animated.loop(
        Animated.timing(value, {
          toValue: 1,
          duration,
          easing,
          useNativeDriver: true,
        })
      ),
    ]);
    animation.start();
    return () => animation.stop();
  }, [value, duration, delay, enabled, easing]);
  return value;
}

/** Valor 0 → 1 uma vez ao montar (entrada, pop, desenho). */
export function useEntrance(
  duration: number,
  options: { delay?: number; enabled?: boolean; spring?: boolean } = {}
) {
  const { delay = 0, enabled = true, spring = false } = options;
  const value = useRef(new Animated.Value(enabled ? 0 : 1)).current;
  useEffect(() => {
    if (!enabled) {
      value.setValue(1);
      return;
    }
    const animation = spring
      ? Animated.sequence([
          Animated.delay(delay),
          Animated.spring(value, {
            toValue: 1,
            damping: 12,
            stiffness: 180,
            useNativeDriver: true,
          }),
        ])
      : Animated.timing(value, {
          toValue: 1,
          duration,
          delay,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        });
    animation.start();
    return () => animation.stop();
  }, [value, duration, delay, enabled, spring]);
  return value;
}

/** Tremida horizontal ±7 dp, 2 ciclos (falha / erro). */
export function useShake(enabled = true) {
  const value = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!enabled) return;
    const step = (toValue: number) =>
      Animated.timing(value, { toValue, duration: 62, useNativeDriver: true });
    const animation = Animated.sequence([
      step(-7),
      step(7),
      step(-7),
      step(7),
      step(0),
    ]);
    animation.start();
    return () => animation.stop();
  }, [value, enabled]);
  return value;
}
