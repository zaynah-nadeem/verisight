import React from "react";
import { View, Text, TouchableOpacity, StyleSheet, Platform } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useAppTheme } from "../context/ThemeContext";

// One small tab: an icon, a label and a dot under the active one
function Tab({ icon, activeIcon, label, active, onPress, colors }) {
  const color = active ? colors.accent : colors.textSecondary;
  return (
    <TouchableOpacity
      style={styles.tab}
      activeOpacity={0.7}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
    >
      <Ionicons name={active ? activeIcon : icon} size={22} color={color} />
      <Text style={[styles.label, { color }, active && styles.labelActive]}>{label}</Text>
      <View style={[styles.dot, { backgroundColor: active ? colors.accent : "transparent" }]} />
    </TouchableOpacity>
  );
}

// The bar at the bottom of the main screens.
// active: "home" | "history" | "link" | "profile"  (the camera button is never "active")
export default function TabBar({
  active,
  profileLabel = "Profile",
  onHome,
  onHistory,
  onCamera,
  onLink,
  onProfile,
}) {
  const { colors } = useAppTheme();
  const profileIcon = profileLabel === "Settings" ? "settings" : "person";

  return (
    <View style={[styles.bar, { backgroundColor: colors.card, borderTopColor: colors.border }]}>
      <Tab icon="home-outline" activeIcon="home" label="Home" active={active === "home"} onPress={onHome} colors={colors} />
      <Tab icon="time-outline" activeIcon="time" label="History" active={active === "history"} onPress={onHistory} colors={colors} />

      <View style={styles.centerSlot}>
        <TouchableOpacity
          activeOpacity={0.85}
          onPress={onCamera}
          accessibilityRole="button"
          accessibilityLabel="Open the camera"
          style={[
            styles.cameraButton,
            { backgroundColor: colors.accent, borderColor: colors.background },
          ]}
        >
          <Ionicons name="camera" size={26} color="#FFFFFF" />
        </TouchableOpacity>
      </View>

      <Tab icon="link-outline" activeIcon="link" label="Link" active={active === "link"} onPress={onLink} colors={colors} />
      <Tab
        icon={`${profileIcon}-outline`}
        activeIcon={profileIcon}
        label={profileLabel}
        active={active === "profile"}
        onPress={onProfile}
        colors={colors}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: "row",
    alignItems: "flex-end",
    borderTopWidth: 1,
    paddingTop: 8,
    paddingBottom: Platform.OS === "ios" ? 24 : 10,
    paddingHorizontal: 6,
    shadowColor: "#000",
    shadowOpacity: 0.08,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: -3 },
    elevation: 8,
  },
  tab: { flex: 1, alignItems: "center", justifyContent: "flex-end", paddingVertical: 2 },
  label: { fontSize: 11, fontWeight: "600", marginTop: 3 },
  labelActive: { fontWeight: "800" },
  dot: { width: 4, height: 4, borderRadius: 2, marginTop: 3 },
  centerSlot: { flex: 1, alignItems: "center", justifyContent: "flex-end" },
  cameraButton: {
    width: 60,
    height: 60,
    borderRadius: 30,
    borderWidth: 4,
    alignItems: "center",
    justifyContent: "center",
    marginTop: -30,
    marginBottom: 6,
    shadowColor: "#000",
    shadowOpacity: 0.25,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },
});