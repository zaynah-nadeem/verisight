import React, { useState } from "react";
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  KeyboardAvoidingView, Platform, ScrollView,
} from "react-native";
import { useAppTheme } from "../context/ThemeContext";
import TopBar from "../components/TopBar";
import PasswordInput from "../components/PasswordInput";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function SignUpScreen({ onBack, onSignUp, onSignIn }) {
  const { colors } = useAppTheme();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");

  const handleSignUp = () => {
    if (!name.trim() || !email.trim() || !password || !confirmPassword) {
      setError("Fill in every field to continue.");
      return;
    }
    if (!EMAIL_RE.test(email.trim())) {
      setError("Enter a valid email address.");
      return;
    }
    if (password.length < 6) {
      setError("Password must be at least 6 characters.");
      return;
    }
    if (password !== confirmPassword) {
      setError("Passwords don't match.");
      return;
    }
    setError("");
    onSignUp({ name: name.trim(), email: email.trim(), password });
  };

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: colors.background }}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        <TopBar onBack={onBack} />

        <Text style={[styles.eyebrow, { color: colors.accent }]}>OPTIONAL ACCOUNT</Text>
        <Text style={[styles.title, { color: colors.textPrimary }]}>Create your account.</Text>
        <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
          Save your scan history and access it across devices.
        </Text>

        <TextInput
          style={[styles.input, { backgroundColor: colors.card, color: colors.textPrimary, borderColor: colors.border }]}
          placeholder="Full name"
          placeholderTextColor={colors.textSecondary}
          value={name}
          onChangeText={setName}
        />
        <TextInput
          style={[styles.input, { backgroundColor: colors.card, color: colors.textPrimary, borderColor: colors.border }]}
          placeholder="Email address"
          placeholderTextColor={colors.textSecondary}
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
          keyboardType="email-address"
        />
        <PasswordInput
          withBorder
          placeholder="Password"
          value={password}
          onChangeText={setPassword}
        />
        <PasswordInput
          withBorder
          placeholder="Confirm password"
          value={confirmPassword}
          onChangeText={setConfirmPassword}
        />

        {error ? <Text style={styles.error}>{error}</Text> : null}

        <TouchableOpacity
          style={[styles.signUpButton, { backgroundColor: colors.accentDark }]}
          onPress={handleSignUp}
        >
          <Text style={styles.signUpText}>Create account</Text>
        </TouchableOpacity>

        <TouchableOpacity onPress={onSignIn}>
          <Text style={[styles.linkText, { color: colors.accent }]}>
            Already have an account? Sign in
          </Text>
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flexGrow: 1, paddingHorizontal: 24, paddingBottom: 40 },
  eyebrow: { fontSize: 12, fontWeight: "700", letterSpacing: 1, marginTop: 8, marginBottom: 8 },
  title: { fontSize: 26, fontWeight: "700", marginBottom: 6 },
  subtitle: { fontSize: 14, marginBottom: 32 },
  input: { width: "100%", borderRadius: 10, borderWidth: 1, paddingHorizontal: 16, paddingVertical: 14, fontSize: 15, marginBottom: 14 },
  error: { color: "#C0392B", fontSize: 13, marginBottom: 10, fontWeight: "600" },
  signUpButton: { width: "100%", paddingVertical: 15, borderRadius: 10, alignItems: "center", marginTop: 6, marginBottom: 18 },
  signUpText: { color: "#FFFFFF", fontWeight: "700", fontSize: 15 },
  linkText: { textAlign: "center", fontSize: 14, fontWeight: "600" },
});