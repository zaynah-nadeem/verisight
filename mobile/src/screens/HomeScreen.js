import React, { useEffect, useState } from "react";
import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useAppTheme } from "../context/ThemeContext";
import { useHistory } from "../context/HistoryContext";
import { useSettings } from "../context/SettingsContext";
import { GUEST_SCAN_LIMIT } from "../config";
import { fetchGuestUsage } from "../services/api";
import TopBar from "../components/TopBar";
import VerdictBadge from "../components/VerdictBadge";
import HowItWorksModal from "../components/HowItWorksModal";
import GuestQuotaCard from "../components/GuestQuotaCard";
import RefreshScroll from "../components/RefreshScroll";
import { timeAgo } from "../utils/timeAgo";
import { chooseFile } from "../utils/pickers";
import { hasSeenOnboarding, markOnboardingSeen } from "../utils/onboarding";

export default function HomeScreen({
  onScan, onScanLink, onBack, onUseCamera, onOpenScan, onViewHistory, onSettings, onLimitReached,
}) {
  const { colors } = useAppTheme();
  const { scans, refresh } = useHistory();
  const { videoQuality, guestScansUsed, setGuestScansUsed } = useSettings();
  const [showHelp, setShowHelp] = useState(false);
  const recent = scans.slice(0, 3);

  const remaining = Math.max(0, GUEST_SCAN_LIMIT - guestScansUsed);
  const limitReached = remaining === 0;
  const requireQuota = (action) => (limitReached ? onLimitReached() : action());

  useEffect(() => {
    hasSeenOnboarding().then((seen) => {
      if (!seen) setShowHelp(true);
    });
  }, []);

  const closeHelp = () => {
    markOnboardingSeen();
    setShowHelp(false);
  };

  // Pull down: reload the list and ask the server how many free scans are really left
  const refreshAll = async () => {
    await refresh();
    try {
      const usage = await fetchGuestUsage();
      setGuestScansUsed(usage.used);
    } catch (e) {
      // offline: keep the number we already have
    }
  };

  return (
    <RefreshScroll
      onRefresh={refreshAll}
      contentContainerStyle={[styles.container, { backgroundColor: colors.background }]}
    >
      <TopBar onBack={onBack} showBrand onSettings={onSettings} />

      <Text style={[styles.greeting, { color: colors.textPrimary }]}>Good to see you.</Text>

      <View style={[styles.checkCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <View style={[styles.iconCircle, { backgroundColor: colors.accent }]}>
          <Ionicons name="shield-checkmark-outline" size={20} color="#FFFFFF" />
        </View>
        <Text style={[styles.checkTitle, { color: colors.textPrimary }]}>What are you checking?</Text>
        <Text style={[styles.checkSubtitle, { color: colors.textSecondary }]}>
          Start with a file from your device or capture a frame live.
        </Text>

        <TouchableOpacity
          style={[styles.chooseButton, { backgroundColor: colors.accent }]}
          onPress={() => requireQuota(() => chooseFile(onScan, videoQuality))}
        >
          <Ionicons name="arrow-up-circle-outline" size={18} color="#FFFFFF" />
          <Text style={styles.chooseButtonText}>Choose a file</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.cameraLink} onPress={() => requireQuota(onUseCamera)}>
          <Ionicons name="camera-outline" size={16} color={colors.accentDark} />
          <Text style={[styles.cameraLinkText, { color: colors.accentDark }]}>Use live camera</Text>
        </TouchableOpacity>

      </View>

      <GuestQuotaCard used={guestScansUsed} limit={GUEST_SCAN_LIMIT} />

      <TouchableOpacity
        activeOpacity={0.7}
        style={[styles.linkCard, { backgroundColor: colors.card, borderColor: colors.border }]}
        onPress={() => requireQuota(onScanLink)}
      >
        <View style={[styles.linkIcon, { backgroundColor: `${colors.accent}22` }]}>
          <Ionicons name="link-outline" size={20} color={colors.accent} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[styles.linkTitle, { color: colors.textPrimary }]}>Scan from a link</Text>
          <Text style={[styles.linkSub, { color: colors.textSecondary }]}>Paste an image address to check it</Text>
        </View>
        <Ionicons name="chevron-forward" size={18} color={colors.textSecondary} />
      </TouchableOpacity>

      <View style={styles.sectionHeaderRow}>
        <Text style={[styles.sectionLabel, { color: colors.textSecondary }]}>RECENT SCANS</Text>
        {scans.length > 0 && (
          <TouchableOpacity onPress={onViewHistory}>
            <Text style={[styles.viewAll, { color: colors.accent }]}>View all</Text>
          </TouchableOpacity>
        )}
      </View>

      {recent.length === 0 ? (
        <View style={[styles.emptyCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Ionicons name="file-tray-outline" size={22} color={colors.textSecondary} />
          <Text style={[styles.emptyTitle, { color: colors.textPrimary }]}>Your scan history is empty</Text>
          <Text style={[styles.emptySubtitle, { color: colors.textSecondary }]}>
            Your first result will appear here after you check a file.
          </Text>
        </View>
      ) : (
        recent.map((scan) => (
          <TouchableOpacity
            key={scan.id}
            style={[styles.scanRow, { borderColor: colors.border }]}
            onPress={() => onOpenScan(scan)}
          >
            <View style={{ flex: 1, marginRight: 10 }}>
              <Text numberOfLines={1} style={[styles.scanLabel, { color: colors.textPrimary }]}>{scan.fileName}</Text>
              <Text style={[styles.scanDate, { color: colors.textSecondary }]}>{timeAgo(scan.createdAt)}</Text>
            </View>
            <VerdictBadge verdict={scan.result.verdict.verdict} />
          </TouchableOpacity>
        ))
      )}

      <Text style={[styles.sectionLabel, { color: colors.textSecondary, marginTop: 28 }]}>LEARN</Text>
      <TouchableOpacity style={styles.learnRow} onPress={() => setShowHelp(true)}>
        <Text style={[styles.learnText, { color: colors.textPrimary }]}>How Verisight reads a file</Text>
        <Ionicons name="arrow-forward" size={16} color={colors.textSecondary} />
      </TouchableOpacity>

      <HowItWorksModal visible={showHelp} onClose={closeHelp} />
    </RefreshScroll>
  );
}

const styles = StyleSheet.create({
  container: { flexGrow: 1, paddingHorizontal: 24, paddingBottom: 40 },
  greeting: { fontSize: 26, fontWeight: "800", marginTop: 12, marginBottom: 20, letterSpacing: -0.3 },
  checkCard: { borderRadius: 18, borderWidth: 1, padding: 20, marginBottom: 32 },
  iconCircle: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center", marginBottom: 14 },
  checkTitle: { fontSize: 17, fontWeight: "700", marginBottom: 6 },
  checkSubtitle: { fontSize: 13, lineHeight: 19, marginBottom: 18 },
  chooseButton: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, paddingVertical: 14, borderRadius: 12, marginBottom: 14 },
  chooseButtonText: { color: "#FFFFFF", fontWeight: "700", fontSize: 14 },
  cameraLink: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6 },
  cameraLinkText: { fontSize: 13, fontWeight: "600" },
  quota: { fontSize: 11, textAlign: "center", marginTop: 14 },
  linkCard: {
    flexDirection: "row", alignItems: "center", gap: 14,
    borderWidth: 1, borderRadius: 18, padding: 14, marginTop: 14, marginBottom: 28,
  },
  linkIcon: { width: 42, height: 42, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  linkTitle: { fontSize: 15, fontWeight: "800" },
  linkSub: { fontSize: 12, marginTop: 2 },
  sectionHeaderRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 10 },
  sectionLabel: { fontSize: 11, fontWeight: "700", letterSpacing: 1.2 },
  viewAll: { fontSize: 12, fontWeight: "600" },
  emptyCard: { borderRadius: 16, borderWidth: 1, padding: 22, alignItems: "center" },
  emptyTitle: { fontSize: 14, fontWeight: "700", marginTop: 10, marginBottom: 4 },
  emptySubtitle: { fontSize: 12, textAlign: "center", lineHeight: 17 },
  scanRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", borderBottomWidth: 1, paddingVertical: 14 },
  scanLabel: { fontSize: 14, fontWeight: "600" },
  scanDate: { fontSize: 11, marginTop: 2 },
  learnRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: 12 },
  learnText: { fontSize: 14, fontWeight: "600" },
});