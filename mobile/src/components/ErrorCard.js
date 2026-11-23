import React from "react";
import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useAppTheme } from "../context/ThemeContext";

function messageFor(error) {
  if (error?.kind === "network" || error?.kind === "timeout") {
    return "Can't reach the server. Check your connection and that the backend is running.";
  }
  return error?.message || "Something went wrong while loading your scans.";
}

// Shown when the history could not be loaded. Retry runs the loader again.
export default function ErrorCard({ error, onRetry }) {
  const { colors } = useAppTheme();
  return (
    <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <Ionicons name="cloud-offline-outline" size={24} color={colors.textSecondary} />
      <Text style={[styles.title, { color: colors.textPrimary }]}>Couldn't load your scans</Text>
      <Text style={[styles.text, { color: colors.textSecondary }]}>{messageFor(error)}</Text>
      <TouchableOpacity style={[styles.button, { backgroundColor: colors.accent }]} onPress={onRetry}>
        <Ionicons name="refresh" size={15} color="#FFFFFF" />
        <Text style={styles.buttonText}>Try again</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: 16, borderWidth: 1, padding: 22, alignItems: "center" },
  title: { fontSize: 14, fontWeight: "700", marginTop: 10, marginBottom: 4 },
  text: { fontSize: 12, textAlign: "center", lineHeight: 17, marginBottom: 14 },
  button: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 18, paddingVertical: 10, borderRadius: 10 },
  buttonText: { color: "#FFFFFF", fontWeight: "700", fontSize: 13 },
});