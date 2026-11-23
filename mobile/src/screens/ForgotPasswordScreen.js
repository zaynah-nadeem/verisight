import React, { useEffect, useRef, useState } from "react";
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
import { Ionicons } from "@expo/vector-icons";
import { useAppTheme } from "../context/ThemeContext";
import TopBar from "../components/TopBar";
import { apiForgotPassword, apiResetPassword } from "../services/api";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const RESEND_SECONDS = 60;

function friendly(e, fallback) {
  if (e?.kind === "network" || e?.kind === "timeout") {
    return "Can't reach the server. Check your connection and try again.";
  }
  return e?.message || fallback;
}

export default function ForgotPasswordScreen({ initialEmail = "", onBack, onFinished }) {
  const { colors } = useAppTheme();
  const [stage, setStage] = useState("email"); // "email" | "code" | "done"
  const [email, setEmail] = useState(initialEmail);
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [wait, setWait] = useState(0); // seconds until "Resend code" works again
  const codeRef = useRef(null);

  // counts the resend timer down
  useEffect(() => {
    if (wait <= 0) return undefined;
    const t = setTimeout(() => setWait((w) => w - 1), 1000);
    return () => clearTimeout(t);
  }, [wait]);

  const sendCode = async (isResend = false) => {
    if (busy) return;
    const clean = email.trim();
    if (!EMAIL_RE.test(clean)) {
      setError("Enter a valid email address.");
      return;
    }
    setError("");
    setBusy(true);
    try {
      await apiForgotPassword(clean);
      setWait(RESEND_SECONDS);
      if (isResend) setCode("");
      setStage("code");
    } catch (e) {
      setError(friendly(e, "Couldn't send the code. Try again."));
    }
    setBusy(false);
  };

  const changePassword = async () => {
    if (busy) return;
    if (!/^[0-9]{6}$/.test(code)) {
      setError("Enter the 6-digit code from the email.");
      return;
    }
    if (password.length < 8) {
      setError("Your new password must be at least 8 characters.");
      return;
    }
    if (password.length > 72) {
      setError("Your new password can be at most 72 characters.");
      return;
    }
    setError("");
    setBusy(true);
    try {
      await apiResetPassword({ email: email.trim(), code, newPassword: password });
      setStage("done");
    } catch (e) {
      setError(friendly(e, "Couldn't change the password. Try again."));
    }
    setBusy(false);
  };

  const inputStyle = [styles.input, { backgroundColor: colors.card, color: colors.textPrimary }];
  const buttonStyle = [styles.button, { backgroundColor: colors.accentDark, opacity: busy ? 0.7 : 1 }];

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: colors.background }}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        <TopBar variant="back" onBack={onBack} />

        {stage === "email" && (
          <>
            <View style={[styles.iconCircle, { backgroundColor: `${colors.accent}22` }]}>
              <Ionicons name="key-outline" size={26} color={colors.accent} />
            </View>
            <Text style={[styles.title, { color: colors.textPrimary }]}>Forgot your password?</Text>
            <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
              Enter the email of your account. We will send you a 6-digit code to choose a new password.
            </Text>

            <TextInput
              style={inputStyle}
              placeholder="Email address"
              placeholderTextColor={colors.textSecondary}
              value={email}
              onChangeText={(v) => {
                setEmail(v);
                setError("");
              }}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="email-address"
              editable={!busy}
              onSubmitEditing={() => sendCode(false)}
            />

            {error ? <Text style={[styles.error, { color: colors.danger }]}>{error}</Text> : null}

            <TouchableOpacity style={buttonStyle} onPress={() => sendCode(false)} disabled={busy}>
              {busy ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.buttonText}>Send code</Text>}
            </TouchableOpacity>

            <TouchableOpacity onPress={onBack} disabled={busy}>
              <Text style={[styles.linkText, { color: colors.accent }]}>Back to sign in</Text>
            </TouchableOpacity>
          </>
        )}

        {stage === "code" && (
          <>
            <View style={[styles.iconCircle, { backgroundColor: `${colors.accent}22` }]}>
              <Ionicons name="mail-open-outline" size={26} color={colors.accent} />
            </View>
            <Text style={[styles.title, { color: colors.textPrimary }]}>Check your email</Text>
            <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
              If an account exists for {email.trim()}, we sent a 6-digit code to it. It works for 15 minutes.
              Look in Spam too.
            </Text>

            <TextInput
              ref={codeRef}
              style={[inputStyle, styles.codeInput]}
              placeholder="000000"
              placeholderTextColor={colors.textSecondary}
              value={code}
              onChangeText={(v) => {
                setCode(v.replace(/[^0-9]/g, "").slice(0, 6));
                setError("");
              }}
              keyboardType="number-pad"
              maxLength={6}
              editable={!busy}
              autoFocus
            />

            <View style={[styles.passwordRow, { backgroundColor: colors.card }]}>
              <TextInput
                style={[styles.passwordInput, { color: colors.textPrimary }]}
                placeholder="New password (8+ characters)"
                placeholderTextColor={colors.textSecondary}
                value={password}
                onChangeText={(v) => {
                  setPassword(v);
                  setError("");
                }}
                secureTextEntry={!showPassword}
                autoCapitalize="none"
                autoCorrect={false}
                editable={!busy}
                onSubmitEditing={changePassword}
              />
              <TouchableOpacity
                onPress={() => setShowPassword((s) => !s)}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              >
                <Ionicons
                  name={showPassword ? "eye-off-outline" : "eye-outline"}
                  size={20}
                  color={colors.textSecondary}
                />
              </TouchableOpacity>
            </View>

            {error ? <Text style={[styles.error, { color: colors.danger }]}>{error}</Text> : null}

            <TouchableOpacity style={buttonStyle} onPress={changePassword} disabled={busy}>
              {busy ? (
                <ActivityIndicator color="#FFFFFF" />
              ) : (
                <Text style={styles.buttonText}>Change password</Text>
              )}
            </TouchableOpacity>

            <TouchableOpacity onPress={() => sendCode(true)} disabled={busy || wait > 0}>
              <Text
                style={[
                  styles.linkText,
                  { color: wait > 0 ? colors.textSecondary : colors.accent },
                ]}
              >
                {wait > 0 ? `Send a new code in ${wait}s` : "Send a new code"}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={() => {
                setStage("email");
                setCode("");
                setPassword("");
                setError("");
              }}
              disabled={busy}
            >
              <Text style={[styles.smallLink, { color: colors.textSecondary }]}>Use a different email</Text>
            </TouchableOpacity>
          </>
        )}

        {stage === "done" && (
          <>
            <View style={[styles.iconCircle, { backgroundColor: `${colors.success}26` }]}>
              <Ionicons name="checkmark-circle-outline" size={30} color={colors.success} />
            </View>
            <Text style={[styles.title, { color: colors.textPrimary }]}>Password changed</Text>
            <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
              You can now sign in with your new password.
            </Text>
            <TouchableOpacity style={buttonStyle} onPress={() => onFinished(email.trim())}>
              <Text style={styles.buttonText}>Back to sign in</Text>
            </TouchableOpacity>
          </>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flexGrow: 1, paddingHorizontal: 24, paddingTop: 60, paddingBottom: 40 },
  iconCircle: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 8,
    marginBottom: 18,
  },
  title: { fontSize: 26, fontWeight: "700", marginBottom: 6 },
  subtitle: { fontSize: 14, lineHeight: 21, marginBottom: 28 },
  input: {
    width: "100%",
    borderRadius: 10,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 15,
    marginBottom: 14,
  },
  codeInput: {
    fontSize: 26,
    fontWeight: "800",
    letterSpacing: 10,
    textAlign: "center",
    paddingVertical: 16,
  },
  passwordRow: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 10,
    paddingHorizontal: 16,
    marginBottom: 14,
  },
  passwordInput: { flex: 1, fontSize: 15, paddingVertical: 14 },
  error: { fontSize: 13, marginBottom: 6, fontWeight: "600", lineHeight: 19 },
  button: {
    width: "100%",
    paddingVertical: 15,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 10,
    marginBottom: 18,
    minHeight: 50,
  },
  buttonText: { color: "#FFFFFF", fontWeight: "700", fontSize: 15 },
  linkText: { textAlign: "center", fontSize: 14, fontWeight: "600", marginBottom: 14 },
  smallLink: { textAlign: "center", fontSize: 13 },
});