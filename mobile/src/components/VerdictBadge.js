import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { useAppTheme } from "../context/ThemeContext";

const MAP = {
  likely_authentic: { label: "Likely authentic", tone: "success" },
  inconclusive: { label: "Inconclusive", tone: "warning" },
  ai_generated: { label: "Likely AI-generated", tone: "danger" },
};

export default function VerdictBadge({ verdict }) {
  const { colors } = useAppTheme();
  const meta = MAP[verdict] || MAP.inconclusive;
  const color = colors[meta.tone];

  return (
    <View style={[styles.badge, { backgroundColor: color + "22", borderColor: color }]}>
      <Text style={[styles.text, { color }]}>{meta.label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: { borderWidth: 1, borderRadius: 20, paddingHorizontal: 10, paddingVertical: 4 },
  text: { fontSize: 11, fontWeight: "700" },
});