import React from "react";
import { Modal, View, Text, TouchableOpacity, StyleSheet, Linking, Alert } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useAppTheme } from "../context/ThemeContext";
import { APP_NAME, EXTENSION_URL } from "../config";

const POINTS = [
  { icon: "logo-chrome", text: "Download our extension and add it to Chrome on a computer." },
  { icon: "logo-instagram", text: "Open Instagram or Facebook on the web and browse as normal." },
  { icon: "shield-checkmark-outline", text: "Check any picture with one click." },
];

export default function ExtensionModal({ visible, onClose }) {
  const { colors } = useAppTheme();

  const open = () => {
    if (!EXTENSION_URL) {
      Alert.alert("Coming soon", "The extension page is not published yet.");
      return;
    }
    Linking.openURL(EXTENSION_URL).catch(() =>
      Alert.alert("Couldn't open the link", EXTENSION_URL)
    );
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <View style={[styles.iconCircle, { backgroundColor: colors.accent }]}>
            <Ionicons name="extension-puzzle-outline" size={26} color="#FFFFFF" />
          </View>
          <Text style={[styles.title, { color: colors.textPrimary }]}>
            Use our {APP_NAME} extension
          </Text>
          <Text style={[styles.body, { color: colors.textSecondary }]}>
            Browsing Instagram or Facebook on a computer? Use our Chrome extension to check pictures right on the page.
          </Text>

          {POINTS.map((p) => (
            <View key={p.icon} style={styles.pointRow}>
              <Ionicons name={p.icon} size={20} color={colors.accent} />
              <Text style={[styles.pointText, { color: colors.textPrimary }]}>{p.text}</Text>
            </View>
          ))}

          <TouchableOpacity style={[styles.button, { backgroundColor: colors.accent }]} onPress={open}>
            <Text style={styles.buttonText}>{EXTENSION_URL ? "Get our extension" : "Coming soon"}</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={onClose}>
            <Text style={[styles.close, { color: colors.textSecondary }]}>Close</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.55)",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 28,
  },
  card: { width: "100%", borderRadius: 22, borderWidth: 1, padding: 24, alignItems: "center" },
  iconCircle: { width: 56, height: 56, borderRadius: 28, alignItems: "center", justifyContent: "center", marginBottom: 16 },
  title: { fontSize: 19, fontWeight: "800", textAlign: "center", marginBottom: 8 },
  body: { fontSize: 14, lineHeight: 21, textAlign: "center", marginBottom: 18 },
  pointRow: { flexDirection: "row", alignItems: "center", gap: 12, alignSelf: "stretch", marginBottom: 12 },
  pointText: { flex: 1, fontSize: 13, lineHeight: 19 },
  button: { width: "100%", paddingVertical: 14, borderRadius: 12, alignItems: "center", marginTop: 8, marginBottom: 12 },
  buttonText: { color: "#FFFFFF", fontWeight: "700", fontSize: 15 },
  close: { fontSize: 13, fontWeight: "600" },
});