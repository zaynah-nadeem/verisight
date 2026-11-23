import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  Keyboard,
  Alert,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as Clipboard from "expo-clipboard";
import { useAppTheme } from "../context/ThemeContext";
import TopBar from "../components/TopBar";

const SHADOW = {
  shadowColor: "#000",
  shadowOpacity: 0.07,
  shadowRadius: 10,
  shadowOffset: { width: 0, height: 4 },
  elevation: 2,
};

const STEPS = [
  "Open the image in your browser or app.",
  "Press and hold the image.",
  "Choose \"Copy image address\" (or \"Copy image link\").",
  "Come back here and tap Paste.",
];

export default function LinkScreen({ initialUrl = "", error, onBack, onSubmit }) {
  const { colors } = useAppTheme();
  const [text, setText] = useState(initialUrl);
  const [localError, setLocalError] = useState(null);
  const [dismissed, setDismissed] = useState(false);

  // a new message from the server shows up again, even if the previous one was dismissed
  useEffect(() => {
    setDismissed(false);
  }, [error]);

  const shownError = localError || (!dismissed && error ? error : null);
  const canSubmit = text.trim().length > 0;

  const change = (value) => {
    setText(value);
    setLocalError(null);
    setDismissed(true);
  };

  const paste = async () => {
    try {
      const value = await Clipboard.getStringAsync();
      if (value && value.trim()) {
        change(value.trim());
      } else {
        Alert.alert("Nothing to paste", "Copy an image link first, then tap Paste.");
      }
    } catch (e) {
      Alert.alert("Couldn't paste", "Press and hold in the box and choose Paste instead.");
    }
  };

  const submit = () => {
    const value = text.trim();
    if (!value) return;
    if (/\s/.test(value)) {
      setLocalError("A link can't contain spaces. Check that you copied the whole address.");
      return;
    }
    Keyboard.dismiss();
    onSubmit(value);
  };

  return (
    <ScrollView
      style={{ backgroundColor: colors.background }}
      contentContainerStyle={[styles.container, { backgroundColor: colors.background }]}
      keyboardShouldPersistTaps="handled"
    >
      <TopBar onBack={onBack} />

      <Text style={[styles.title, { color: colors.textPrimary }]}>Scan from a link</Text>
      <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
        Paste the address of an image. We download it and check it, just like a file from your phone.
      </Text>

      <View
        style={[
          styles.inputCard,
          SHADOW,
          {
            backgroundColor: colors.card,
            borderColor: shownError ? colors.danger : colors.border,
          },
        ]}
      >
        <Ionicons name="link-outline" size={20} color={colors.accent} />
        <TextInput
          style={[styles.input, { color: colors.textPrimary }]}
          value={text}
          onChangeText={change}
          placeholder="https://example.com/photo.jpg"
          placeholderTextColor={colors.textSecondary}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="url"
          returnKeyType="go"
          onSubmitEditing={submit}
        />
        {text.length > 0 ? (
          <TouchableOpacity onPress={() => change("")} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            <Ionicons name="close-circle" size={20} color={colors.textSecondary} />
          </TouchableOpacity>
        ) : (
          <TouchableOpacity
            style={[styles.pasteButton, { backgroundColor: `${colors.accent}22` }]}
            onPress={paste}
          >
            <Text style={[styles.pasteText, { color: colors.accent }]}>Paste</Text>
          </TouchableOpacity>
        )}
      </View>

      {shownError ? (
        <View style={[styles.errorBox, { backgroundColor: `${colors.danger}18`, borderColor: `${colors.danger}55` }]}>
          <Ionicons name="alert-circle-outline" size={20} color={colors.danger} />
          <Text style={[styles.errorText, { color: colors.textPrimary }]}>{shownError}</Text>
        </View>
      ) : null}

      <TouchableOpacity
        style={[styles.button, { backgroundColor: colors.accent, opacity: canSubmit ? 1 : 0.45 }]}
        onPress={submit}
        disabled={!canSubmit}
      >
        <Ionicons name="scan-outline" size={19} color="#FFFFFF" />
        <Text style={styles.buttonText}>Check this image</Text>
      </TouchableOpacity>

      <View style={[styles.tipCard, SHADOW, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <View style={styles.tipHeader}>
          <Ionicons name="bulb-outline" size={18} color={colors.warning} />
          <Text style={[styles.tipTitle, { color: colors.textPrimary }]}>How to copy an image link</Text>
        </View>
        {STEPS.map((step, i) => (
          <View key={i} style={styles.stepRow}>
            <View style={[styles.stepNumber, { backgroundColor: `${colors.accent}22` }]}>
              <Text style={[styles.stepNumberText, { color: colors.accent }]}>{i + 1}</Text>
            </View>
            <Text style={[styles.stepText, { color: colors.textSecondary }]}>{step}</Text>
          </View>
        ))}
        <Text style={[styles.tipNote, { color: colors.textSecondary }]}>
          The link must lead straight to the picture. A link to a web page or a social media post will not
          work. If a website blocks downloads, save the image to your phone and choose it as a file instead.
        </Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flexGrow: 1, paddingHorizontal: 24, paddingBottom: 50 },
  title: { fontSize: 28, fontWeight: "800", marginTop: 12, marginBottom: 8, letterSpacing: -0.4 },
  subtitle: { fontSize: 14, lineHeight: 21, marginBottom: 22 },

  inputCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderWidth: 1.5,
    borderRadius: 18,
    paddingHorizontal: 14,
    paddingVertical: 6,
  },
  input: { flex: 1, fontSize: 15, paddingVertical: 12 },
  pasteButton: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 12 },
  pasteText: { fontSize: 13, fontWeight: "800" },

  errorBox: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    borderWidth: 1,
    borderRadius: 14,
    padding: 14,
    marginTop: 14,
  },
  errorText: { flex: 1, fontSize: 13, lineHeight: 19 },

  button: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 16,
    borderRadius: 30,
    marginTop: 18,
    marginBottom: 26,
  },
  buttonText: { color: "#FFFFFF", fontWeight: "800", fontSize: 15 },

  tipCard: { borderWidth: 1, borderRadius: 20, padding: 18 },
  tipHeader: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 14 },
  tipTitle: { fontSize: 15, fontWeight: "800" },
  stepRow: { flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 10 },
  stepNumber: { width: 24, height: 24, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  stepNumberText: { fontSize: 12, fontWeight: "800" },
  stepText: { flex: 1, fontSize: 13, lineHeight: 18 },
  tipNote: { fontSize: 12, lineHeight: 18, marginTop: 8 },
});