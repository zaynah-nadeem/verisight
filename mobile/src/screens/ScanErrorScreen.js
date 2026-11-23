import React from "react";
import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useAppTheme } from "../context/ThemeContext";
import { API_BASE_URL } from "../config";
import TopBar from "../components/TopBar";

const COPY = {
  network: {
    icon: "cloud-offline-outline",
    title: "Can't reach the server",
    body: "Check that your phone and laptop are on the same Wi-Fi and that the backend is running.",
  },
  timeout: {
    icon: "time-outline",
    title: "That took too long",
    body: "The server didn't answer in time. Try again, or try a smaller file.",
  },
  server: {
    icon: "warning-outline",
    title: "The server couldn't check this file",
    body: "",
  },
};

export default function ScanErrorScreen({ error, onRetry, onBack }) {
  const { colors } = useAppTheme();
  const copy = COPY[error?.kind] || COPY.server;
  const body = error?.kind === "server" ? error.message : copy.body;

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <TopBar onBack={onBack} />

      <View style={styles.center}>
        <View style={[styles.iconCircle, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Ionicons name={copy.icon} size={30} color={colors.danger} />
        </View>
        <Text style={[styles.title, { color: colors.textPrimary }]}>{copy.title}</Text>
        <Text style={[styles.body, { color: colors.textSecondary }]}>{body}</Text>

        <TouchableOpacity style={[styles.retryButton, { backgroundColor: colors.accent }]} onPress={onRetry}>
          <Text style={styles.retryText}>Try again</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={onBack}>
          <Text style={[styles.backLink, { color: colors.textSecondary }]}>Go back</Text>
        </TouchableOpacity>
      </View>

            {error?.kind === "network" && (
        <Text style={[styles.debug, { color: colors.textSecondary }]}>
          Tried: {API_BASE_URL}{"\n"}{error.message}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, paddingHorizontal: 24 },
  center: { flex: 1, alignItems: "center", justifyContent: "center", paddingBottom: 60 },
  iconCircle: { width: 72, height: 72, borderRadius: 36, borderWidth: 1, alignItems: "center", justifyContent: "center", marginBottom: 20 },
  title: { fontSize: 20, fontWeight: "800", textAlign: "center", marginBottom: 8 },
  body: { fontSize: 14, lineHeight: 21, textAlign: "center", marginBottom: 28, paddingHorizontal: 12 },
  retryButton: { width: "100%", paddingVertical: 15, borderRadius: 12, alignItems: "center", marginBottom: 16 },
  retryText: { color: "#FFFFFF", fontWeight: "700", fontSize: 15 },
  backLink: { fontSize: 14, fontWeight: "600" },
  debug: { fontSize: 11, textAlign: "center", marginBottom: 30 },
});