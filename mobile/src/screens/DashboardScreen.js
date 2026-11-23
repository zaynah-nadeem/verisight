import React, { useEffect, useMemo, useRef, useState } from "react";
import { View, Text, TouchableOpacity, StyleSheet, Animated, Easing } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useAppTheme } from "../context/ThemeContext";
import { useHistory } from "../context/HistoryContext";
import { useSettings } from "../context/SettingsContext";
import TopBar from "../components/TopBar";
import VerdictBadge from "../components/VerdictBadge";
import HowItWorksModal from "../components/HowItWorksModal";
import SkeletonRows from "../components/SkeletonRows";
import ErrorCard from "../components/ErrorCard";
import RefreshScroll from "../components/RefreshScroll";
import { timeAgo } from "../utils/timeAgo";
import { chooseFile } from "../utils/pickers";

const DAY_LETTERS = ["S", "M", "T", "W", "T", "F", "S"];
const BAR_AREA = 76;
const SOFT_WHITE = "rgba(255,255,255,0.18)";

const SHADOW = {
  shadowColor: "#000",
  shadowOpacity: 0.08,
  shadowRadius: 12,
  shadowOffset: { width: 0, height: 5 },
  elevation: 3,
};

function greetingForNow() {
  const h = new Date().getHours();
  if (h < 12) return { text: "Good morning", icon: "sunny-outline" };
  if (h < 18) return { text: "Good afternoon", icon: "partly-sunny-outline" };
  return { text: "Good evening", icon: "moon-outline" };
}

// Counts scans for each of the last 7 days (oldest first, today last)
function lastSevenDays(scans) {
  const days = [];
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  for (let i = 6; i >= 0; i--) {
    const start = new Date(today);
    start.setDate(today.getDate() - i);
    const end = new Date(start);
    end.setDate(start.getDate() + 1);
    days.push({
      start: start.getTime(),
      end: end.getTime(),
      letter: DAY_LETTERS[start.getDay()],
      count: 0,
      isToday: i === 0,
    });
  }
  scans.forEach((s) => {
    const t = new Date(s.createdAt).getTime();
    if (Number.isNaN(t)) return;
    const day = days.find((d) => t >= d.start && t < d.end);
    if (day) day.count += 1;
  });
  return days;
}

// A section that fades in and slides up a little
function FadeIn({ delay = 0, children }) {
  const v = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(v, {
      toValue: 1,
      duration: 450,
      delay,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [v, delay]);
  return (
    <Animated.View
      style={{
        opacity: v,
        transform: [{ translateY: v.interpolate({ inputRange: [0, 1], outputRange: [16, 0] }) }],
      }}
    >
      {children}
    </Animated.View>
  );
}

// One chart bar that grows from the bottom
function Bar({ progress, target, color }) {
  const height = progress.interpolate({ inputRange: [0, 1], outputRange: [4, target] });
  return <Animated.View style={[styles.bar, { height, backgroundColor: color }]} />;
}

function StatCard({ icon, color, value, label, colors }) {
  return (
    <View
      style={[
        styles.statCard,
        SHADOW,
        { backgroundColor: colors.card, borderColor: `${color}55` },
      ]}
    >
      <View style={[styles.statIcon, { backgroundColor: `${color}26` }]}>
        <Ionicons name={icon} size={20} color={color} />
      </View>
      <Text style={[styles.statValue, { color: colors.textPrimary }]}>{value}</Text>
      <Text style={[styles.statLabel, { color: colors.textSecondary }]}>{label}</Text>
      <View style={[styles.statAccent, { backgroundColor: color }]} />
    </View>
  );
}

function LegendItem({ color, label, value, colors }) {
  return (
    <View style={styles.legendItem}>
      <View style={[styles.legendDot, { backgroundColor: color }]} />
      <Text style={[styles.legendText, { color: colors.textSecondary }]}>{label}</Text>
      <Text style={[styles.legendValue, { color: colors.textPrimary }]}>{value}</Text>
    </View>
  );
}

export default function DashboardScreen({
  user, onScan, onScanLink, onSignOut, onUseCamera, onOpenScan, onViewHistory, onSettings,
}) {
  const { colors, mode } = useAppTheme();
  // dark mode: the deeper terracotta from the theme, so the card isn't too bright
  const heroColor = mode === "dark" ? colors.accentDark : colors.accent;
  const { scans, refresh, loading, error } = useHistory();
  const { videoQuality } = useSettings();
  const [showHelp, setShowHelp] = useState(false);
  const recent = scans.slice(0, 5);
  const initials = (user?.name || user?.email || "?").trim().charAt(0).toUpperCase();
  const greet = useMemo(() => greetingForNow(), []);

  const stats = useMemo(() => {
    let ai = 0;
    let real = 0;
    let unsure = 0;
    scans.forEach((s) => {
      const v = s.result?.verdict?.verdict;
      if (v === "ai_generated") ai += 1;
      else if (v === "likely_authentic") real += 1;
      else unsure += 1;
    });
    const days = lastSevenDays(scans);
    const week = days.reduce((sum, d) => sum + d.count, 0);
    const maxDay = Math.max(1, ...days.map((d) => d.count));
    return { total: scans.length, ai, real, unsure, days, week, maxDay };
  }, [scans]);

  // The chart bars grow in whenever the numbers change
  const growth = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    growth.setValue(0);
    Animated.timing(growth, {
      toValue: 1,
      duration: 700,
      delay: 350,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false, // height can't use the native driver
    }).start();
  }, [stats.week, stats.total, growth]);

  const showSkeleton = loading && scans.length === 0;
  const showError = !!error && scans.length === 0 && !loading;
  const aiPercent = stats.total > 0 ? Math.round((stats.ai / stats.total) * 100) : 0;
  const lastScan = scans[0];

  return (
    <RefreshScroll
      onRefresh={refresh}
      contentContainerStyle={[styles.container, { backgroundColor: colors.background }]}
    >
      <TopBar showBrand onSettings={onSettings} />

      {/* Hero card */}
      <FadeIn>
        <View style={[styles.hero, SHADOW, { backgroundColor: heroColor }]}>
          <View style={styles.heroCircleBig} />
          <View style={styles.heroCircleSmall} />

          <View style={styles.heroTop}>
            <View style={styles.heroAvatar}>
              <Text style={styles.heroAvatarText}>{initials}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <View style={styles.greetRow}>
                <Ionicons name={greet.icon} size={14} color="rgba(255,255,255,0.85)" />
                <Text style={styles.heroGreetSmall}>{greet.text}</Text>
              </View>
              <Text numberOfLines={1} style={styles.heroName}>
                {user?.name ? user.name.split(" ")[0] : user?.email}
              </Text>
            </View>
          </View>

          <View style={styles.heroNumbers}>
            <Text style={styles.heroBig}>{stats.total}</Text>
            <View style={{ marginLeft: 12, paddingBottom: 8, flex: 1 }}>
              <Text style={styles.heroBigLabel}>{stats.total === 1 ? "scan checked" : "scans checked"}</Text>
              <Text style={styles.heroSmall}>
                {stats.week} this week
                {lastScan ? `  |  last scan ${timeAgo(lastScan.createdAt)}` : ""}
              </Text>
            </View>
          </View>

          <View style={styles.heroButtons}>
            <TouchableOpacity
              style={styles.heroPrimary}
              onPress={() => chooseFile(onScan, videoQuality)}
            >
              <Ionicons name="arrow-up-circle-outline" size={19} color={heroColor} />
              <Text style={[styles.heroPrimaryText, { color: heroColor }]}>Choose a file</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.heroSecondary} onPress={onUseCamera}>
              <Ionicons name="camera-outline" size={19} color="#FFFFFF" />
              <Text style={styles.heroSecondaryText}>Live camera</Text>
            </TouchableOpacity>
          </View>
        </View>
      </FadeIn>

      {/* Scan from a link */}
      <FadeIn delay={80}>
        <TouchableOpacity
          activeOpacity={0.7}
          style={[styles.linkCard, SHADOW, { backgroundColor: colors.card, borderColor: colors.border }]}
          onPress={onScanLink}
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
      </FadeIn>

      {/* Stats */}
      <FadeIn delay={120}>
        <Text style={[styles.sectionLabel, { color: colors.textSecondary }]}>YOUR NUMBERS</Text>
        <View style={styles.statRow}>
          <StatCard icon="warning-outline" color={colors.danger} value={stats.ai} label="AI detected" colors={colors} />
          <StatCard icon="shield-checkmark-outline" color={colors.success} value={stats.real} label="Likely real" colors={colors} />
          <StatCard icon="help-circle-outline" color={colors.warning} value={stats.unsure} label="Unsure" colors={colors} />
        </View>
      </FadeIn>

      {/* Verdict mix */}
      {stats.total > 0 && (
        <FadeIn delay={200}>
          <View style={[styles.card, SHADOW, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <View style={styles.mixHeader}>
              <Text style={[styles.cardTitle, { color: colors.textPrimary }]}>Verdict mix</Text>
              <Text style={[styles.mixPercent, { color: colors.danger }]}>{aiPercent}% AI</Text>
            </View>
            <View style={[styles.splitBar, { backgroundColor: colors.border }]}>
              {stats.ai > 0 && <View style={{ flex: stats.ai, backgroundColor: colors.danger }} />}
              {stats.unsure > 0 && <View style={{ flex: stats.unsure, backgroundColor: colors.warning }} />}
              {stats.real > 0 && <View style={{ flex: stats.real, backgroundColor: colors.success }} />}
            </View>
            <View style={styles.legendRow}>
              <LegendItem color={colors.danger} label="AI" value={stats.ai} colors={colors} />
              <LegendItem color={colors.warning} label="Unsure" value={stats.unsure} colors={colors} />
              <LegendItem color={colors.success} label="Real" value={stats.real} colors={colors} />
            </View>
          </View>
        </FadeIn>
      )}

      {/* 7-day activity */}
      <FadeIn delay={280}>
        <View style={[styles.card, SHADOW, { backgroundColor: colors.card, borderColor: colors.border, marginBottom: 28 }]}>
          <View style={styles.activityHeader}>
            <View>
              <Text style={[styles.cardTitle, { color: colors.textPrimary }]}>Activity</Text>
              <Text style={[styles.activitySub, { color: colors.textSecondary }]}>Scans in the last 7 days</Text>
            </View>
            <View style={[styles.weekPill, { backgroundColor: `${colors.accent}22` }]}>
              <Text style={[styles.weekPillText, { color: colors.accent }]}>{stats.week} this week</Text>
            </View>
          </View>
          <View style={styles.barsRow}>
            {stats.days.map((d, i) => {
              const target = d.count > 0 ? Math.max(16, (d.count / stats.maxDay) * BAR_AREA) : 6;
              const barColor = d.isToday ? colors.accent : d.count > 0 ? `${colors.accent}99` : colors.border;
              return (
                <View key={i} style={styles.barCol}>
                  <View style={styles.barArea}>
                    {d.count > 0 && (
                      <Text style={[styles.barCount, { color: colors.textSecondary }]}>{d.count}</Text>
                    )}
                    <Bar progress={growth} target={target} color={barColor} />
                  </View>
                  <Text
                    style={[
                      styles.barLabel,
                      { color: d.isToday ? colors.accent : colors.textSecondary },
                      d.isToday && { fontWeight: "800" },
                    ]}
                  >
                    {d.letter}
                  </Text>
                </View>
              );
            })}
          </View>
        </View>
      </FadeIn>

      {/* Recent scans */}
      <FadeIn delay={360}>
        <View style={styles.sectionHeaderRow}>
          <Text style={[styles.sectionLabel, { color: colors.textSecondary, marginBottom: 0 }]}>RECENT SCANS</Text>
          {scans.length > 0 && (
            <TouchableOpacity onPress={onViewHistory}>
              <Text style={[styles.viewAll, { color: colors.accent }]}>View all</Text>
            </TouchableOpacity>
          )}
        </View>

        {showSkeleton ? (
          <SkeletonRows count={3} />
        ) : showError ? (
          <ErrorCard error={error} onRetry={refresh} />
        ) : recent.length === 0 ? (
          <View style={[styles.emptyCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Ionicons name="file-tray-outline" size={24} color={colors.textSecondary} />
            <Text style={[styles.emptyTitle, { color: colors.textPrimary }]}>No scans yet</Text>
            <Text style={[styles.emptySubtitle, { color: colors.textSecondary }]}>
              Check a file and it will be saved to your history.
            </Text>
          </View>
        ) : (
          <View style={[styles.listCard, SHADOW, { backgroundColor: colors.card, borderColor: colors.border }]}>
            {recent.map((scan, i) => (
              <TouchableOpacity
                key={scan.id}
                style={[
                  styles.scanRow,
                  i < recent.length - 1 && { borderBottomWidth: 1, borderBottomColor: colors.border },
                ]}
                onPress={() => onOpenScan(scan)}
              >
                <View style={{ flex: 1, marginRight: 10 }}>
                  <Text numberOfLines={1} style={[styles.scanLabel, { color: colors.textPrimary }]}>{scan.fileName}</Text>
                  <Text style={[styles.scanDate, { color: colors.textSecondary }]}>{timeAgo(scan.createdAt)}</Text>
                </View>
                <VerdictBadge verdict={scan.result.verdict.verdict} />
              </TouchableOpacity>
            ))}
          </View>
        )}
      </FadeIn>

      <TouchableOpacity style={styles.learnRow} onPress={() => setShowHelp(true)}>
        <View style={styles.learnLeft}>
          <Ionicons name="school-outline" size={18} color={colors.accent} />
          <Text style={[styles.learnText, { color: colors.textPrimary }]}>How Verisight works</Text>
        </View>
        <Ionicons name="arrow-forward" size={16} color={colors.textSecondary} />
      </TouchableOpacity>

      <TouchableOpacity style={styles.signOutRow} onPress={onSignOut}>
        <Ionicons name="log-out-outline" size={16} color={colors.textSecondary} />
        <Text style={[styles.signOutText, { color: colors.textSecondary }]}>Sign out</Text>
      </TouchableOpacity>

      <HowItWorksModal visible={showHelp} onClose={() => setShowHelp(false)} />
    </RefreshScroll>
  );
}

const styles = StyleSheet.create({
  container: { flexGrow: 1, paddingHorizontal: 24, paddingBottom: 40 },

  hero: { borderRadius: 28, padding: 20, marginTop: 8, marginBottom: 26, overflow: "hidden" },
  heroCircleBig: {
    position: "absolute", right: -50, top: -50, width: 190, height: 190,
    borderRadius: 95, backgroundColor: "rgba(255,255,255,0.10)",
  },
  heroCircleSmall: {
    position: "absolute", right: 50, bottom: -45, width: 120, height: 120,
    borderRadius: 60, backgroundColor: "rgba(255,255,255,0.07)",
  },
  heroTop: { flexDirection: "row", alignItems: "center", gap: 12 },
  heroAvatar: {
    width: 48, height: 48, borderRadius: 24, backgroundColor: SOFT_WHITE,
    alignItems: "center", justifyContent: "center",
  },
  heroAvatarText: { color: "#FFFFFF", fontWeight: "800", fontSize: 19 },
  greetRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  heroGreetSmall: { color: "rgba(255,255,255,0.85)", fontSize: 12, fontWeight: "600" },
  heroName: { color: "#FFFFFF", fontSize: 20, fontWeight: "800", marginTop: 1 },
  heroNumbers: { flexDirection: "row", alignItems: "flex-end", marginTop: 22, marginBottom: 20 },
  heroBig: { color: "#FFFFFF", fontSize: 60, fontWeight: "800", letterSpacing: -1.5, lineHeight: 64 },
  heroBigLabel: { color: "#FFFFFF", fontSize: 15, fontWeight: "700" },
  heroSmall: { color: "rgba(255,255,255,0.78)", fontSize: 12, marginTop: 3 },
  heroButtons: { flexDirection: "row", gap: 10 },
  heroPrimary: {
    flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8,
    backgroundColor: "#FFFFFF", paddingVertical: 14, borderRadius: 16,
  },
  heroPrimaryText: { fontSize: 14, fontWeight: "800" },
  heroSecondary: {
    flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8,
    backgroundColor: SOFT_WHITE, paddingVertical: 14, borderRadius: 16,
  },
  heroSecondaryText: { color: "#FFFFFF", fontSize: 14, fontWeight: "800" },

  sectionLabel: { fontSize: 11, fontWeight: "700", letterSpacing: 1.2, marginBottom: 10 },

  linkCard: {
    flexDirection: "row", alignItems: "center", gap: 14,
    borderWidth: 1, borderRadius: 20, padding: 14, marginTop: -6, marginBottom: 24,
  },
  linkIcon: { width: 42, height: 42, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  linkTitle: { fontSize: 15, fontWeight: "800" },
  linkSub: { fontSize: 12, marginTop: 2 },

  statRow: { flexDirection: "row", gap: 10, marginBottom: 14 },
  statCard: { flex: 1, borderWidth: 1, borderRadius: 20, padding: 14, overflow: "hidden" },
  statIcon: { width: 38, height: 38, borderRadius: 12, alignItems: "center", justifyContent: "center", marginBottom: 12 },
  statValue: { fontSize: 28, fontWeight: "800", letterSpacing: -0.5 },
  statLabel: { fontSize: 12, fontWeight: "600", marginTop: 2, marginBottom: 10 },
  statAccent: { height: 4, borderRadius: 2, width: 28 },

  card: { borderWidth: 1, borderRadius: 20, padding: 16, marginBottom: 14 },
  cardTitle: { fontSize: 16, fontWeight: "800" },
  mixHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 14 },
  mixPercent: { fontSize: 14, fontWeight: "800" },
  splitBar: { height: 12, borderRadius: 6, overflow: "hidden", flexDirection: "row" },
  legendRow: { flexDirection: "row", justifyContent: "space-between", marginTop: 14 },
  legendItem: { flexDirection: "row", alignItems: "center", gap: 6 },
  legendDot: { width: 9, height: 9, borderRadius: 5 },
  legendText: { fontSize: 12, fontWeight: "600" },
  legendValue: { fontSize: 12, fontWeight: "800" },

  activityHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 18 },
  activitySub: { fontSize: 12, marginTop: 2 },
  weekPill: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 14 },
  weekPillText: { fontSize: 12, fontWeight: "800" },
  barsRow: { flexDirection: "row", gap: 8 },
  barCol: { flex: 1, alignItems: "center" },
  barArea: { height: BAR_AREA + 20, justifyContent: "flex-end", width: "100%", alignItems: "center" },
  barCount: { fontSize: 11, fontWeight: "700", marginBottom: 4 },
  bar: { width: "72%", borderRadius: 8 },
  barLabel: { fontSize: 11, fontWeight: "600", marginTop: 8 },

  sectionHeaderRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 10 },
  viewAll: { fontSize: 12, fontWeight: "700" },
  emptyCard: { borderRadius: 20, borderWidth: 1, padding: 24, alignItems: "center" },
  emptyTitle: { fontSize: 14, fontWeight: "700", marginTop: 10, marginBottom: 4 },
  emptySubtitle: { fontSize: 12, textAlign: "center", lineHeight: 17 },
  listCard: { borderRadius: 20, borderWidth: 1, paddingHorizontal: 16 },
  scanRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: 14 },
  scanLabel: { fontSize: 14, fontWeight: "600" },
  scanDate: { fontSize: 11, marginTop: 2 },

  learnRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: 12, marginTop: 20 },
  learnLeft: { flexDirection: "row", alignItems: "center", gap: 10 },
  learnText: { fontSize: 14, fontWeight: "600" },
  signOutRow: { flexDirection: "row", alignItems: "center", gap: 6, justifyContent: "center", marginTop: 24 },
  signOutText: { fontSize: 13, fontWeight: "600" },
});