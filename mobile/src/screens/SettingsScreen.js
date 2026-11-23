import React, { useState } from "react";
import { View, Text, TouchableOpacity, Switch, StyleSheet, ScrollView, Alert, Linking } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useAppTheme } from "../context/ThemeContext";
import { useHistory } from "../context/HistoryContext";
import { useSettings } from "../context/SettingsContext";
import { GUEST_SCAN_LIMIT, APP_NAME, SUPPORT_EMAIL } from "../config";
import TopBar from "../components/TopBar";
import DeleteAccountModal from "../components/DeleteAccountModal";
import HowItWorksModal from "../components/HowItWorksModal";
import ExtensionModal from "../components/ExtensionModal";

const SHADOW = {
  shadowColor: "#000",
  shadowOpacity: 0.07,
  shadowRadius: 10,
  shadowOffset: { width: 0, height: 4 },
  elevation: 2,
};

function Section({ label, colors, children }) {
  return (
    <>
      <Text style={[styles.sectionLabel, { color: colors.textSecondary }]}>{label}</Text>
      <View style={[styles.group, SHADOW, { backgroundColor: colors.card, borderColor: colors.border }]}>
        {children}
      </View>
    </>
  );
}

// One line in a settings card: icon, title, small text, and something on the right
function Row({ icon, iconColor, title, sub, onPress, right, danger, last, colors }) {
  const tint = iconColor || (danger ? colors.danger : colors.accent);
  const content = (
    <View
      style={[
        styles.row,
        !last && { borderBottomWidth: 1, borderBottomColor: colors.border },
      ]}
    >
      <View style={[styles.rowIcon, { backgroundColor: `${tint}22` }]}>
        <Ionicons name={icon} size={19} color={tint} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={[styles.rowTitle, { color: danger ? colors.danger : colors.textPrimary }]}>{title}</Text>
        {sub ? <Text style={[styles.rowSub, { color: colors.textSecondary }]}>{sub}</Text> : null}
      </View>
      {right !== undefined ? (
        right
      ) : onPress ? (
        <Ionicons name="chevron-forward" size={18} color={colors.textSecondary} />
      ) : null}
    </View>
  );
  if (!onPress) return content;
  return (
    <TouchableOpacity activeOpacity={0.6} onPress={onPress}>
      {content}
    </TouchableOpacity>
  );
}

export default function SettingsScreen({ user, onBack, onSignIn, onSignOut, onDeleteAccount, onAbout }) {
  const { colors, mode, toggleTheme } = useAppTheme();
  const { scans, clearHistory } = useHistory();
  const { videoQuality, setVideoQuality, guestScansUsed } = useSettings();
  const [showDelete, setShowDelete] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const [showExtension, setShowExtension] = useState(false);

  const initials = (user?.name || user?.email || "?").trim().charAt(0).toUpperCase();
  const guestLeft = Math.max(0, GUEST_SCAN_LIMIT - guestScansUsed);

  const confirmClear = () => {
    if (scans.length === 0) {
      Alert.alert("Nothing to clear", "Your scan history is already empty.");
      return;
    }
    Alert.alert(
      "Clear scan history?",
      user
        ? "This removes all saved results from your account. It can't be undone."
        : "This removes all saved results from this phone. It can't be undone.",
      [
        { text: "Cancel", style: "cancel" },
        { text: "Clear", style: "destructive", onPress: clearHistory },
      ]
    );
  };

  const showStored = () => {
    Alert.alert(
      "What Verisight stores",
      (user
        ? "Signed in: your scan results are saved to your account so you can see them on any of your devices.\n\n"
        : "Guest: your scan results stay on this phone. A random device ID is used only to count your free scans.\n\n") +
        "Every file you check is sent to the Verisight server so it can be analysed. A result is an estimate, not proof."
    );
  };

  const contactSupport = () => {
    const subject = encodeURIComponent(`${APP_NAME} support`);
    Linking.openURL(`mailto:${SUPPORT_EMAIL}?subject=${subject}`).catch(() =>
      Alert.alert("Couldn't open email", `Please write to ${SUPPORT_EMAIL}`)
    );
  };

  const qualityOptions = [
    {
      key: "quick",
      title: "Quick",
      sub: "Smaller upload, much faster. Re-encoding removes content credentials.",
    },
    {
      key: "full",
      title: "Full quality",
      sub: "Sends the original video. Slower, but keeps credentials and fine detail.",
    },
  ];

  return (
    <ScrollView
      style={{ backgroundColor: colors.background }}
      contentContainerStyle={[styles.container, { backgroundColor: colors.background }]}
    >
      <TopBar onBack={onBack} />

      <Text style={[styles.title, { color: colors.textPrimary }]}>Settings</Text>

      {/* Profile */}
      <View style={[styles.profile, SHADOW, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <View style={[styles.avatar, { backgroundColor: colors.accent }]}>
          {user ? (
            <Text style={styles.avatarText}>{initials}</Text>
          ) : (
            <Ionicons name="person-outline" size={26} color="#FFFFFF" />
          )}
        </View>
        <View style={{ flex: 1 }}>
          <Text numberOfLines={1} style={[styles.profileName, { color: colors.textPrimary }]}>
            {user ? user.name || "Signed in" : "Guest"}
          </Text>
          <Text numberOfLines={1} style={[styles.profileSub, { color: colors.textSecondary }]}>
            {user ? user.email : "Sign in to keep your history across devices"}
          </Text>
        </View>
        {!user && (
          <TouchableOpacity style={[styles.profileButton, { backgroundColor: colors.accent }]} onPress={onSignIn}>
            <Text style={styles.profileButtonText}>Sign in</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Scans */}
      <Section label="YOUR SCANS" colors={colors}>
        <Row
          icon="documents-outline"
          title="Saved scans"
          sub={user ? "Saved on your account" : "Saved on this phone"}
          right={<Text style={[styles.rowValue, { color: colors.textPrimary }]}>{scans.length}</Text>}
          colors={colors}
          last={!!user}
        />
        {!user && (
          <Row
            icon="flash-outline"
            title="Free scans left"
            sub="Create an account for more scans"
            right={
              <Text style={[styles.rowValue, { color: guestLeft === 0 ? colors.danger : colors.textPrimary }]}>
                {guestLeft}/{GUEST_SCAN_LIMIT}
              </Text>
            }
            colors={colors}
            last
          />
        )}
      </Section>

      {/* Video */}
      <Section label="VIDEO UPLOADS" colors={colors}>
        {qualityOptions.map((option, index) => {
          const selected = videoQuality === option.key;
          return (
            <TouchableOpacity
              key={option.key}
              activeOpacity={0.6}
              style={[
                styles.optionRow,
                index === 0 && { borderBottomWidth: 1, borderBottomColor: colors.border },
              ]}
              onPress={() => setVideoQuality(option.key)}
            >
              <Ionicons
                name={selected ? "radio-button-on" : "radio-button-off"}
                size={22}
                color={selected ? colors.accent : colors.textSecondary}
              />
              <View style={{ flex: 1 }}>
                <Text style={[styles.rowTitle, { color: colors.textPrimary }]}>{option.title}</Text>
                <Text style={[styles.rowSub, { color: colors.textSecondary }]}>{option.sub}</Text>
              </View>
            </TouchableOpacity>
          );
        })}
      </Section>
      <Text style={[styles.note, { color: colors.textSecondary }]}>
        This applies to videos chosen from the photo library. Videos chosen from Files are always sent as the original.
      </Text>

      {/* Appearance */}
      <Section label="APPEARANCE" colors={colors}>
        <Row
          icon={mode === "dark" ? "moon-outline" : "sunny-outline"}
          title="Dark mode"
          sub={mode === "dark" ? "Espresso theme" : "Beige theme"}
          right={
            <Switch
              value={mode === "dark"}
              onValueChange={toggleTheme}
              trackColor={{ true: colors.accent, false: colors.border }}
            />
          }
          colors={colors}
          last
        />
      </Section>

      {/* Privacy */}
      <Section label="PRIVACY AND DATA" colors={colors}>
        <Row
          icon="lock-closed-outline"
          title="What Verisight stores"
          sub="How your files and results are handled"
          onPress={showStored}
          colors={colors}
        />
        <Row
          icon="trash-bin-outline"
          title="Clear scan history"
          sub={`${scans.length} saved ${scans.length === 1 ? "scan" : "scans"} ${user ? "on your account" : "on this phone"}`}
          onPress={confirmClear}
          danger
          colors={colors}
          last
        />
      </Section>

      {/* Help */}
      <Section label="HELP AND ABOUT" colors={colors}>
        <Row
          icon="help-circle-outline"
          title="How Verisight works"
          sub="A quick tour of the three steps"
          onPress={() => setShowHelp(true)}
          colors={colors}
        />
        <Row
          icon="information-circle-outline"
          title="About and disclaimer"
          sub="What results mean and their limits"
          onPress={onAbout}
          colors={colors}
        />
        <Row
          icon="logo-chrome"
          title="Chrome extension"
          sub="Check pictures on Instagram from a computer"
          onPress={() => setShowExtension(true)}
          colors={colors}
        />
        <Row
          icon="mail-outline"
          title="Contact support"
          sub={SUPPORT_EMAIL}
          onPress={contactSupport}
          colors={colors}
          last
        />
      </Section>

      {/* Account actions */}
      {user ? (
        <Section label="ACCOUNT" colors={colors}>
          <Row icon="log-out-outline" title="Sign out" onPress={onSignOut} colors={colors} />
          <Row
            icon="person-remove-outline"
            title="Delete account"
            sub="Permanently delete your account and data"
            onPress={() => setShowDelete(true)}
            danger
            colors={colors}
            last
          />
        </Section>
      ) : null}

      <Text style={[styles.footer, { color: colors.textSecondary }]}>
        Verisight - a second opinion, not proof.
      </Text>

      {user ? (
        <DeleteAccountModal
          visible={showDelete}
          onClose={() => setShowDelete(false)}
          onConfirm={onDeleteAccount}
        />
      ) : null}
      <HowItWorksModal visible={showHelp} onClose={() => setShowHelp(false)} />
      <ExtensionModal visible={showExtension} onClose={() => setShowExtension(false)} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flexGrow: 1, paddingHorizontal: 24, paddingBottom: 50 },
  title: { fontSize: 28, fontWeight: "800", marginTop: 12, marginBottom: 18, letterSpacing: -0.4 },

  profile: {
    flexDirection: "row", alignItems: "center", gap: 14,
    borderWidth: 1, borderRadius: 22, padding: 16,
  },
  avatar: { width: 54, height: 54, borderRadius: 27, alignItems: "center", justifyContent: "center" },
  avatarText: { color: "#FFFFFF", fontSize: 22, fontWeight: "800" },
  profileName: { fontSize: 17, fontWeight: "800" },
  profileSub: { fontSize: 12, marginTop: 3 },
  profileButton: { paddingHorizontal: 16, paddingVertical: 10, borderRadius: 14 },
  profileButtonText: { color: "#FFFFFF", fontWeight: "800", fontSize: 13 },

  sectionLabel: { fontSize: 11, fontWeight: "700", letterSpacing: 1.2, marginTop: 24, marginBottom: 10 },
  group: { borderWidth: 1, borderRadius: 20, overflow: "hidden" },
  row: { flexDirection: "row", alignItems: "center", gap: 14, paddingHorizontal: 16, paddingVertical: 14 },
  rowIcon: { width: 38, height: 38, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  rowTitle: { fontSize: 15, fontWeight: "700" },
  rowSub: { fontSize: 12, lineHeight: 17, marginTop: 2 },
  rowValue: { fontSize: 16, fontWeight: "800" },
  optionRow: { flexDirection: "row", alignItems: "flex-start", gap: 12, paddingHorizontal: 16, paddingVertical: 14 },
  note: { fontSize: 11, lineHeight: 16, marginTop: 8 },
  footer: { fontSize: 12, textAlign: "center", marginTop: 30 },
});