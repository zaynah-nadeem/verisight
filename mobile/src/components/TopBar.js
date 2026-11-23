import React from "react";
import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useAppTheme } from "../context/ThemeContext";
import ThemeToggle from "./ThemeToggle";

export default function TopBar({ onBack, showBrand = false, onSettings }) {
  const { colors } = useAppTheme();

  return (
    <View style={styles.row}>
      <View style={styles.side}>
        {onBack && (
          <TouchableOpacity style={styles.iconButton} onPress={onBack}>
            <Ionicons name="arrow-back" size={22} color={colors.textPrimary} />
          </TouchableOpacity>
        )}
        {showBrand && (
          <Text style={[styles.brand, { color: colors.accent }]}>VERISIGHT</Text>
        )}
      </View>
      <View style={styles.side}>
        {onSettings && (
          <TouchableOpacity style={styles.iconButton} onPress={onSettings}>
            <Ionicons name="settings-outline" size={22} color={colors.textPrimary} />
          </TouchableOpacity>
        )}
        <ThemeToggle />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 50,
    marginBottom: 8,
  },
  side: { flexDirection: "row", alignItems: "center", gap: 10 },
  brand: { fontSize: 13, fontWeight: "700", letterSpacing: 1.5 },
  iconButton: { width: 36, height: 36, justifyContent: "center", alignItems: "center" },
});