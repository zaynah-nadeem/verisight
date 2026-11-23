import React, { useEffect, useRef } from "react";
import { View, Text, Animated, Easing, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useAppTheme } from "../context/ThemeContext";

export default function GuestQuotaCard({ used, limit }) {
  const { colors } = useAppTheme();
  const left = Math.max(0, limit - used);
  const fraction = limit > 0 ? left / limit : 0;

  const anim = useRef(new Animated.Value(fraction)).current;
  useEffect(() => {
    Animated.timing(anim, {
      toValue: fraction,
      duration: 500,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false, // width and left can't use the native driver
    }).start();
  }, [fraction, anim]);

  const width = anim.interpolate({ inputRange: [0, 1], outputRange: ["0%", "100%"] });
  const barColor = left === 0 ? colors.danger : left === 1 && limit > 1 ? colors.warning : colors.accent;

  const message =
    left === 0
      ? "You've used all your free scans. Create a free account to keep going."
      : "Create a free account for more scans and saved history.";

  return (
    <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <View style={styles.headerRow}>
        <View style={styles.labelRow}>
          <View style={[styles.iconBox, { backgroundColor: colors.background, borderColor: colors.border }]}>
            <Ionicons name="flash-outline" size={16} color={barColor} />
          </View>
          <Text style={[styles.label, { color: colors.textPrimary }]}>Free scans left</Text>
        </View>
        <Text style={[styles.count, { color: barColor }]}>
          {left}
          <Text style={[styles.countOf, { color: colors.textSecondary }]}> / {limit}</Text>
        </Text>
      </View>

      <View style={styles.trackWrap}>
        <View style={[styles.track, { backgroundColor: colors.border }]}>
          <Animated.View style={[styles.fill, { width, backgroundColor: barColor }]} />
          {Array.from({ length: Math.max(0, limit - 1) }).map((_, i) => (
            <View
              key={i}
              style={[
                styles.tick,
                { left: `${((i + 1) / limit) * 100}%`, backgroundColor: colors.card },
              ]}
            />
          ))}
        </View>
        <Animated.View
          style={[
            styles.knob,
            { left: width, borderColor: barColor, backgroundColor: colors.card },
          ]}
        />
      </View>

      <Text style={[styles.message, { color: colors.textSecondary }]}>{message}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: 18, borderWidth: 1, padding: 18, marginBottom: 16 },
  headerRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  labelRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  iconBox: {
    width: 32,
    height: 32,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  label: { fontSize: 14, fontWeight: "700" },
  count: { fontSize: 26, fontWeight: "800" },
  countOf: { fontSize: 14, fontWeight: "600" },
  trackWrap: { marginTop: 16, marginBottom: 14, justifyContent: "center", height: 20 },
  track: { height: 10, borderRadius: 5, overflow: "hidden" },
  fill: { height: 10, borderRadius: 5 },
  tick: { position: "absolute", top: 0, width: 2, height: 10 },
  knob: {
    position: "absolute",
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 3,
    marginLeft: -10,
  },
  message: { fontSize: 12, lineHeight: 17 },
});