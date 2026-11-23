import React, { useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  ActivityIndicator,
} from "react-native";
import { useAppTheme } from "../context/ThemeContext";
import TopBar from "../components/TopBar";
import PasswordInput from "../components/PasswordInput";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function LoginScreen({ onBack, onSignIn, onCreateAccount, onContinueAsGuest, onForgotPassword, initialEmail = "" }) {
  const { colors } = useAppTheme();
  const [email, setEmail] = useState(initialEmail);
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const handleSignIn = async () => {
    if (busy) return;
    if (!email.trim() || !password) {
      setError("Enter your email and password.");
      return;
    }
    if (!EMAIL_RE.test(email.trim())) {
      setError("Enter a valid email address.");
      return;
    }
    setError("");
    setBusy(true);
    try {
      await onSignIn({ email: email.trim(), password });
    } catch (e) {
      setError(
        e?.kind === "network" || e?.kind === "timeout"
          ? "Can't reach the server. Check your connection and try again."
          : e?.message || "Couldn't sign in. Try again."
      );
      setBusy(false);
    }
    // on success the app moves to the next screen, so there is nothing more to do here
  };

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: colors.background }}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <ScrollView
        contentContainerStyle={styles.container}
        keyboardShouldPersistTaps="handled"
      >
        <TopBar variant="back" onBack={onBack} />

        <Text style={[styles.eyebrow, { color: colors.accent }]}>
          OPTIONAL ACCOUNT
        </Text>
        <Text style={[styles.title, { color: colors.textPrimary }]}>
          Welcome back.
        </Text>
        <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
          Sign in to see your saved scan history.
        </Text>

        <TextInput
          style={[
            styles.input,
            { backgroundColor: colors.card, color: colors.textPrimary },
          ]}
          placeholder="Email address"
          placeholderTextColor={colors.textSecondary}
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="email-address"
          editable={!busy}
        />

        <PasswordInput
          value={password}
          onChangeText={setPassword}
          editable={!busy}
          onSubmitEditing={handleSignIn}
        />

        <TouchableOpacity style={styles.forgotLink} onPress={onForgotPassword} disabled={busy}>
          <Text style={[styles.forgotText, { color: colors.accent }]}>Forgot password?</Text>
        </TouchableOpacity>

        {error ? <Text style={styles.error}>{error}</Text> : null}

        <TouchableOpacity
          style={[styles.signInButton, { backgroundColor: colors.accentDark, opacity: busy ? 0.7 : 1 }]}
          onPress={handleSignIn}
          disabled={busy}
        >
          {busy ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.signInText}>Sign in</Text>}
        </TouchableOpacity>

        <TouchableOpacity onPress={onCreateAccount} disabled={busy}>
          <Text style={[styles.linkText, { color: colors.accent }]}>
            New here? Create an account
          </Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.guestLink} onPress={onContinueAsGuest} disabled={busy}>
          <Text style={[styles.guestText, { color: colors.textSecondary }]}>
            Continue as guest instead
          </Text>
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flexGrow: 1,
    paddingHorizontal: 24,
    paddingTop: 60,
  },
  eyebrow: {
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 1,
    marginBottom: 8,
  },
  title: {
    fontSize: 26,
    fontWeight: "700",
    marginBottom: 6,
  },
  subtitle: {
    fontSize: 14,
    marginBottom: 32,
  },
  input: {
    width: "100%",
    borderRadius: 10,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 15,
    marginBottom: 14,
  },
  forgotLink: {
    alignSelf: "flex-end",
    marginTop: -4,
    marginBottom: 8,
    paddingVertical: 4,
  },
  forgotText: {
    fontSize: 13,
    fontWeight: "600",
  },
  error: {
    color: "#C0392B",
    fontSize: 13,
    marginBottom: 6,
    fontWeight: "600",
  },
  signInButton: {
    width: "100%",
    paddingVertical: 15,
    borderRadius: 10,
    alignItems: "center",
    marginTop: 10,
    marginBottom: 18,
    minHeight: 50,
    justifyContent: "center",
  },
  signInText: {
    color: "#FFFFFF",
    fontWeight: "700",
    fontSize: 15,
  },
  linkText: {
    textAlign: "center",
    fontSize: 14,
    fontWeight: "600",
    marginBottom: 60,
  },
  guestLink: {
    alignItems: "center",
    marginTop: "auto",
    paddingBottom: 20,
  },
  guestText: {
    fontSize: 13,
  },
});