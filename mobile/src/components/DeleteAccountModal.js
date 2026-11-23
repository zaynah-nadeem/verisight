import React, { useEffect, useState } from "react";
import {
  Modal,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useAppTheme } from "../context/ThemeContext";

// Asks the person to confirm with their password before the account is deleted for good.
// onConfirm(password) should throw if it fails; its message is shown here.
export default function DeleteAccountModal({ visible, onClose, onConfirm }) {
  const { colors } = useAppTheme();
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  // start clean every time it opens
  useEffect(() => {
    if (visible) {
      setPassword("");
      setError("");
      setBusy(false);
    }
  }, [visible]);

  const submit = async () => {
    if (busy) return;
    if (!password) {
      setError("Enter your password to confirm.");
      return;
    }
    setError("");
    setBusy(true);
    try {
      await onConfirm(password);
      // on success the app leaves this screen
    } catch (e) {
      setError(
        e?.kind === "network" || e?.kind === "timeout"
          ? "Can't reach the server. Check your connection and try again."
          : e?.message || "Couldn't delete the account. Try again."
      );
      setBusy(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={busy ? undefined : onClose}>
      <KeyboardAvoidingView
        style={styles.backdrop}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <View style={styles.iconCircle}>
            <Ionicons name="trash-outline" size={22} color="#C0392B" />
          </View>
          <Text style={[styles.title, { color: colors.textPrimary }]}>Delete your account?</Text>
          <Text style={[styles.body, { color: colors.textSecondary }]}>
            This permanently deletes your account and all your saved scans from our server. It can't be undone.
          </Text>

          <TextInput
            style={[styles.input, { backgroundColor: colors.background, color: colors.textPrimary, borderColor: colors.border }]}
            placeholder="Your password"
            placeholderTextColor={colors.textSecondary}
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            autoCapitalize="none"
            editable={!busy}
            onSubmitEditing={submit}
          />

          {error ? <Text style={styles.error}>{error}</Text> : null}

          <TouchableOpacity
            style={[styles.deleteButton, { opacity: busy ? 0.7 : 1 }]}
            onPress={submit}
            disabled={busy}
          >
            {busy ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.deleteText}>Delete my account</Text>}
          </TouchableOpacity>

          <TouchableOpacity style={styles.cancelButton} onPress={onClose} disabled={busy}>
            <Text style={[styles.cancelText, { color: colors.textSecondary }]}>Cancel</Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.6)", justifyContent: "center", paddingHorizontal: 24 },
  card: { borderRadius: 18, borderWidth: 1, padding: 22 },
  iconCircle: {
    width: 44, height: 44, borderRadius: 22, backgroundColor: "rgba(192,57,43,0.14)",
    alignItems: "center", justifyContent: "center", marginBottom: 14,
  },
  title: { fontSize: 18, fontWeight: "800", marginBottom: 8 },
  body: { fontSize: 13, lineHeight: 19, marginBottom: 18 },
  input: { borderRadius: 10, borderWidth: 1, paddingHorizontal: 14, paddingVertical: 13, fontSize: 15, marginBottom: 10 },
  error: { color: "#C0392B", fontSize: 13, fontWeight: "600", marginBottom: 8 },
  deleteButton: {
    backgroundColor: "#C0392B", borderRadius: 10, minHeight: 48,
    alignItems: "center", justifyContent: "center", marginTop: 6,
  },
  deleteText: { color: "#FFFFFF", fontWeight: "700", fontSize: 15 },
  cancelButton: { alignItems: "center", paddingVertical: 14 },
  cancelText: { fontSize: 14, fontWeight: "600" },
});