import React, { useEffect, useRef } from "react";
import { View, Animated, StyleSheet } from "react-native";
import { useAppTheme } from "../context/ThemeContext";

// Grey placeholder rows that gently pulse while real data is loading.
export default function SkeletonRows({ count = 3, withThumb = false }) {
  const { colors } = useAppTheme();
  const pulse = useRef(new Animated.Value(0.4)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 800, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0.4, duration: 800, useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [pulse]);

  const block = { backgroundColor: colors.border };

  return (
    <Animated.View style={{ opacity: pulse }}>
      {Array.from({ length: count }).map((_, i) => (
        <View key={i} style={[styles.row, { borderColor: colors.border }]}>
          {withThumb ? <View style={[styles.thumb, block]} /> : null}
          <View style={{ flex: 1 }}>
            <View style={[styles.line, block, { width: "65%" }]} />
            <View style={[styles.line, block, { width: "35%", height: 9, marginTop: 8 }]} />
          </View>
          <View style={[styles.badge, block]} />
        </View>
      ))}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: 12, borderBottomWidth: 1, paddingVertical: 14 },
  thumb: { width: 46, height: 46, borderRadius: 10 },
  line: { height: 12, borderRadius: 6 },
  badge: { width: 70, height: 22, borderRadius: 11 },
});