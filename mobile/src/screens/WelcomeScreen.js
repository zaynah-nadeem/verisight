import React, { useState } from "react";
import { View, Text, TouchableOpacity, StyleSheet, ScrollView } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useAppTheme } from "../context/ThemeContext";
import TopBar from "../components/TopBar";
import ExtensionModal from "../components/ExtensionModal";

const FEATURES = [
  { icon: "image-outline", title: "Photos", sub: "Spot AI images" },
  { icon: "videocam-outline", title: "Videos", sub: "Frame check" },
  { icon: "camera-outline", title: "Live camera", sub: "Capture it" },
  { icon: "link-outline", title: "Image links", sub: "Paste address" },
];

export default function WelcomeScreen({ onContinueAsGuest, onSignIn }) {
  const { colors } = useAppTheme();
  const [showExtension, setShowExtension] = useState(false);

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <TopBar showBrand />

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.hero}>
          <View style={[styles.glowOuter, { backgroundColor: `${colors.accent}18` }]}>
            <View style={[styles.glowInner, { backgroundColor: `${colors.accent}30` }]}>
              <Ionicons name="shield-checkmark" size={24} color={colors.accent} />
            </View>
          </View>
          <Text style={[styles.title, { color: colors.textPrimary }]}>Look closer.</Text>
          <Text style={[styles.headline, { color: colors.textPrimary }]}>
            A calm second opinion for the media you trust.
          </Text>
          <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
            Check an image, video, or recording with an independent model verdict
            and content history review.
          </Text>
        </View>

        <View style={styles.grid}>
          {FEATURES.map((f) => (
            <View
              key={f.title}
              style={[styles.feature, { backgroundColor: colors.card, borderColor: colors.border }]}
            >
              <View style={[styles.featureIcon, { backgroundColor: `${colors.accent}22` }]}>
                <Ionicons name={f.icon} size={17} color={colors.accent} />
              </View>
              <View style={{ flex: 1 }}>
                <Text numberOfLines={1} style={[styles.featureTitle, { color: colors.textPrimary }]}>
                  {f.title}
                </Text>
                <Text numberOfLines={1} style={[styles.featureSub, { color: colors.textSecondary }]}>
                  {f.sub}
                </Text>
              </View>
            </View>
          ))}
        </View>
      </ScrollView>

      <View style={styles.bottom}>
        <TouchableOpacity
          style={[styles.guestButton, { backgroundColor: colors.accent }]}
          onPress={onContinueAsGuest}
          activeOpacity={0.85}
        >
          <Text style={styles.guestButtonText}>Continue as guest</Text>
          <Ionicons name="arrow-forward" size={18} color="#FFFFFF" />
        </TouchableOpacity>

        <TouchableOpacity onPress={onSignIn}>
          <Text style={[styles.signInLink, { color: colors.accent }]}>
            Sign in / create an account
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.extensionCard, { backgroundColor: colors.card, borderColor: colors.border }]}
          onPress={() => setShowExtension(true)}
          activeOpacity={0.7}
        >
          <View style={[styles.extensionIcon, { backgroundColor: `${colors.accent}22` }]}>
            <Ionicons name="logo-chrome" size={20} color={colors.accent} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[styles.extensionTitle, { color: colors.textPrimary }]}>
              Also on Chrome
            </Text>
            <Text style={[styles.extensionSub, { color: colors.textSecondary }]}>
              Check pictures on Instagram from a computer
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={colors.textSecondary} />
        </TouchableOpacity>

        <Text style={[styles.caption, { color: colors.textSecondary }]}>
          You can scan without an account. Sign in only when{"\n"}you want saved history across devices.
        </Text>
      </View>

      <ExtensionModal visible={showExtension} onClose={() => setShowExtension(false)} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, paddingHorizontal: 24 },
  scroll: { paddingBottom: 12 },
  hero: { marginTop: 6 },
  glowOuter: { width: 64, height: 64, borderRadius: 32, alignItems: "center", justifyContent: "center", marginBottom: 14 },
  glowInner: { width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center" },
  title: { fontSize: 32, fontWeight: "800", marginBottom: 10, letterSpacing: -0.5 },
  headline: { fontSize: 18, fontWeight: "700", lineHeight: 25, marginBottom: 8 },
  subtitle: { fontSize: 13, lineHeight: 20 },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 10, marginTop: 18 },
  feature: { width: "48%", flexGrow: 1, flexDirection: "row", alignItems: "center", gap: 10, borderWidth: 1, borderRadius: 14, padding: 10 },
  featureIcon: { width: 32, height: 32, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  featureTitle: { fontSize: 13, fontWeight: "700" },
  featureSub: { fontSize: 10, marginTop: 1 },
  bottom: { paddingBottom: 26, paddingTop: 8, alignItems: "center" },
  guestButton: { width: "100%", flexDirection: "row", gap: 8, justifyContent: "center", alignItems: "center", paddingVertical: 15, borderRadius: 30, marginBottom: 12 },
  guestButtonText: { color: "#FFFFFF", fontWeight: "700", fontSize: 15 },
  signInLink: { fontSize: 14, fontWeight: "700", marginBottom: 14 },
  extensionCard: { width: "100%", flexDirection: "row", alignItems: "center", gap: 12, borderWidth: 1, borderRadius: 16, padding: 12, marginBottom: 12 },
  extensionIcon: { width: 38, height: 38, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  extensionTitle: { fontSize: 14, fontWeight: "700" },
  extensionSub: { fontSize: 11, marginTop: 2 },
  caption: { fontSize: 11, textAlign: "center", lineHeight: 16 },
});