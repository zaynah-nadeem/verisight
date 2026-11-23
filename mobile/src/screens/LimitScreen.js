import React from "react";
import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useAppTheme } from "../context/ThemeContext";
import { GUEST_SCAN_LIMIT } from "../config";
import TopBar from "../components/TopBar";

export default function LimitScreen({ onBack, onSignUp, onSignIn }) {
  const { colors } = useAppTheme();

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <TopBar onBack={onBack} />

      <View style={styles.center}>
        <View style={[styles.iconCircle, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Ionicons name="lock-closed-outline" size={28} color={colors.accent} />
        </View>
        <Text style={[styles.title, { color: colors.textPrimary }]}>
          You've used your {GUEST_SCAN_LIMIT} free scans
        </Text>
        <Text style={[styles.body, { color: colors.textSecondary }]}>
          Guests can check {GUEST_SCAN_LIMIT} files. Create a free account to keep scanning and to keep your history across devices.
        </Text>

        <TouchableOpacity style={[styles.primary, { backgroundColor: colors.accent }]} onPress={onSignUp}>
          <Text style={styles.primaryText}>Create an account</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={onSignIn}>
          <Text style={[styles.link, { color: colors.accent }]}>I already have an account</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, paddingHorizontal: 24 },
  center: { flex: 1, alignItems: "center", justifyContent: "center", paddingBottom: 60 },
  iconCircle: { width: 72, height: 72, borderRadius: 36, borderWidth: 1, alignItems: "center", justifyContent: "center", marginBottom: 20 },
  title: { fontSize: 22, fontWeight: "800", textAlign: "center", marginBottom: 10 },
  body: { fontSize: 14, lineHeight: 21, textAlign: "center", marginBottom: 28, paddingHorizontal: 8 },
  primary: { width: "100%", paddingVertical: 15, borderRadius: 12, alignItems: "center", marginBottom: 16 },
  primaryText: { color: "#FFFFFF", fontWeight: "700", fontSize: 15 },
  link: { fontSize: 14, fontWeight: "700" },
});