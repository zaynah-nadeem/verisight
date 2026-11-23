import React, { useEffect, useMemo, useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Modal,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  Alert,
  Image,
  RefreshControl,
  Share,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useAppTheme } from "../context/ThemeContext";
import { useHistory } from "../context/HistoryContext";
import TopBar from "../components/TopBar";

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

const SHADOW = {
  shadowColor: "#000",
  shadowOpacity: 0.08,
  shadowRadius: 12,
  shadowOffset: { width: 0, height: 5 },
  elevation: 3,
};

function memberSince(iso) {
  const d = iso ? new Date(iso) : null;
  if (!d || Number.isNaN(d.getTime())) return null;
  return `${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}

const dayKey = (d) => `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;

// How many days in a row (ending today or yesterday) the user has scanned something
function streakDays(scans) {
  const days = new Set();
  scans.forEach((s) => {
    const d = new Date(s.createdAt);
    if (!Number.isNaN(d.getTime())) days.add(dayKey(d));
  });
  const cursor = new Date();
  if (!days.has(dayKey(cursor))) cursor.setDate(cursor.getDate() - 1); // today may not have a scan yet
  let n = 0;
  while (days.has(dayKey(cursor))) {
    n += 1;
    cursor.setDate(cursor.getDate() - 1);
  }
  return n;
}

const VERDICT_TEXT = {
  ai_generated: "Likely AI-generated",
  likely_authentic: "Likely authentic",
  inconclusive: "Inconclusive",
};

function buildReport(user, scans) {
  const lines = [`Verisight scan report for ${user?.name || user?.email}`, `Total scans: ${scans.length}`, ""];
  scans.forEach((s, i) => {
    const v = s.result?.verdict;
    const when = new Date(s.createdAt);
    const date = Number.isNaN(when.getTime()) ? "" : when.toLocaleString();
    lines.push(`${i + 1}. ${s.fileName}`);
    lines.push(`   Result: ${VERDICT_TEXT[v?.verdict] || "Unknown"}`);
    if (v && v.confidence_low != null && v.confidence_high != null) {
      lines.push(`   AI likelihood: ${Math.round(v.confidence_low)}% to ${Math.round(v.confidence_high)}%`);
    }
    if (date) lines.push(`   Checked: ${date}`);
    lines.push("");
  });
  lines.push("Results are estimates, not proof.");
  return lines.join("\n");
}

// A small square picture for a scan (falls back to an icon when the file is gone)
function Thumb({ scan, colors, size = 64 }) {
  const [failed, setFailed] = useState(false);
  const isVideo = scan.fileType === "video";
  const showImage = !!scan.uri && !isVideo && !failed;
  return (
    <View
      style={{
        width: size, height: size, borderRadius: 14, overflow: "hidden",
        backgroundColor: `${colors.accent}22`, alignItems: "center", justifyContent: "center",
      }}
    >
      {showImage ? (
        <Image source={{ uri: scan.uri }} style={{ width: size, height: size }} onError={() => setFailed(true)} />
      ) : (
        <Ionicons name={isVideo ? "videocam-outline" : "image-outline"} size={24} color={colors.accent} />
      )}
    </View>
  );
}

function friendly(e, fallback) {
  if (e?.kind === "network" || e?.kind === "timeout") {
    return "Can't reach the server. Check your connection and try again.";
  }
  return e?.message || fallback;
}

// A small pop-up card with a title, some fields and a save button
function Sheet({ visible, title, onClose, onSave, saveLabel, busy, error, colors, children }) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <KeyboardAvoidingView
        style={styles.overlay}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <View style={[styles.sheet, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={[styles.sheetTitle, { color: colors.textPrimary }]}>{title}</Text>
          {children}
          {error ? <Text style={[styles.sheetError, { color: colors.danger }]}>{error}</Text> : null}
          <View style={styles.sheetButtons}>
            <TouchableOpacity style={styles.sheetCancel} onPress={onClose} disabled={busy}>
              <Text style={[styles.sheetCancelText, { color: colors.textSecondary }]}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.sheetSave, { backgroundColor: colors.accent, opacity: busy ? 0.7 : 1 }]}
              onPress={onSave}
              disabled={busy}
            >
              {busy ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.sheetSaveText}>{saveLabel}</Text>}
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

function Row({ icon, title, sub, onPress, danger, last, colors }) {
  const tint = danger ? colors.danger : colors.accent;
  return (
    <TouchableOpacity
      activeOpacity={0.6}
      onPress={onPress}
      style={[styles.row, !last && { borderBottomWidth: 1, borderBottomColor: colors.border }]}
    >
      <View style={[styles.rowIcon, { backgroundColor: `${tint}22` }]}>
        <Ionicons name={icon} size={19} color={tint} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={[styles.rowTitle, { color: danger ? colors.danger : colors.textPrimary }]}>{title}</Text>
        {sub ? <Text style={[styles.rowSub, { color: colors.textSecondary }]}>{sub}</Text> : null}
      </View>
      <Ionicons name="chevron-forward" size={18} color={colors.textSecondary} />
    </TouchableOpacity>
  );
}

export default function ProfileScreen({ user, onUpdateName, onChangePassword, onSettings, onSignOut, onViewHistory, onOpenScan }) {
  const { colors, mode } = useAppTheme();
  const { scans, refresh, clearHistory } = useHistory();
  const [refreshing, setRefreshing] = useState(false);
  const [avatar, setAvatar] = useState("");
  const [avatarFailed, setAvatarFailed] = useState(false);
  const avatarKey = user?.id ? `verisight_avatar_${user.id}` : null;

  useEffect(() => {
    let alive = true;
    setAvatarFailed(false);
    if (!avatarKey) return undefined;
    AsyncStorage.getItem(avatarKey)
      .then((v) => alive && setAvatar(v || ""))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [avatarKey]);

  const saveAvatar = (uri) => {
    setAvatar(uri);
    setAvatarFailed(false);
    if (!avatarKey) return;
    (uri ? AsyncStorage.setItem(avatarKey, uri) : AsyncStorage.removeItem(avatarKey)).catch(() => {});
  };

  const pickAvatar = async () => {
    try {
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) {
        Alert.alert("Photos needed", "Allow photo access in Settings to choose a profile picture.");
        return;
      }
      const res = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ["images"],
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.7,
      });
      if (!res.canceled && res.assets?.[0]?.uri) saveAvatar(res.assets[0].uri);
    } catch (e) {
      Alert.alert("Couldn't open photos", "Please try again.");
    }
  };

  const avatarMenu = () => {
    const buttons = [{ text: "Choose a photo", onPress: pickAvatar }];
    if (avatar) buttons.push({ text: "Remove photo", style: "destructive", onPress: () => saveAvatar("") });
    buttons.push({ text: "Cancel", style: "cancel" });
    Alert.alert("Profile picture", undefined, buttons);
  };

  const onRefresh = async () => {
    setRefreshing(true);
    try {
      await refresh();
    } catch (e) {
      // the list keeps showing what it had
    }
    setRefreshing(false);
  };

  const exportHistory = async () => {
    if (!scans.length) {
      Alert.alert("Nothing to export", "Scan something first, then come back.");
      return;
    }
    try {
      await Share.share({ title: "Verisight scan report", message: buildReport(user, scans) });
    } catch (e) {
      // closed without sharing
    }
  };

  const confirmClear = () => {
    if (!scans.length) {
      Alert.alert("History is empty", "There is nothing to delete.");
      return;
    }
    Alert.alert("Delete scan history?", "All your saved scans will be removed. Your account stays.", [
      { text: "Cancel", style: "cancel" },
      { text: "Delete", style: "destructive", onPress: () => clearHistory() },
    ]);
  };
  const heroColor = mode === "dark" ? colors.accentDark : colors.accent;

  const initials = (user?.name || user?.email || "?").trim().charAt(0).toUpperCase();
  const since = memberSince(user?.created_at);

  const counts = useMemo(() => {
    let ai = 0;
    let real = 0;
    scans.forEach((s) => {
      const v = s.result?.verdict?.verdict;
      if (v === "ai_generated") ai += 1;
      else if (v === "likely_authentic") real += 1;
    });
    const now = new Date();
    const thisMonth = scans.filter((s) => {
      const d = new Date(s.createdAt);
      return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
    }).length;
    const videos = scans.filter((s) => s.fileType === "video").length;
    return { total: scans.length, ai, real, other: scans.length - ai - real, thisMonth, videos };
  }, [scans]);

  const streak = useMemo(() => streakDays(scans), [scans]);
  const recent = scans.slice(0, 3);

  const badges = [
    { key: "first", icon: "ribbon-outline", title: "First scan", done: counts.total >= 1 },
    { key: "ten", icon: "medal-outline", title: "10 scans", done: counts.total >= 10 },
    { key: "fifty", icon: "trophy-outline", title: "50 scans", done: counts.total >= 50 },
    { key: "spot", icon: "eye-outline", title: "AI spotter", done: counts.ai >= 5 },
    { key: "video", icon: "videocam-outline", title: "Video checker", done: counts.videos >= 1 },
    { key: "streak", icon: "flame-outline", title: "3-day streak", done: streak >= 3 },
  ];
  const earned = badges.filter((b) => b.done).length;
  const pct = (n) => (counts.total ? (n / counts.total) * 100 : 0);

  // ----- change name -----
  const [nameOpen, setNameOpen] = useState(false);
  const [nameValue, setNameValue] = useState("");
  const [nameBusy, setNameBusy] = useState(false);
  const [nameError, setNameError] = useState("");

  const openName = () => {
    setNameValue(user?.name || "");
    setNameError("");
    setNameOpen(true);
  };

  const saveName = async () => {
    if (nameBusy) return;
    const clean = nameValue.trim();
    if (!clean) {
      setNameError("Enter a name.");
      return;
    }
    if (clean.length > 80) {
      setNameError("The name can be at most 80 characters.");
      return;
    }
    setNameError("");
    setNameBusy(true);
    try {
      await onUpdateName(clean);
      setNameOpen(false);
    } catch (e) {
      setNameError(friendly(e, "Couldn't save the name. Try again."));
    }
    setNameBusy(false);
  };

  // ----- change password -----
  const [pwOpen, setPwOpen] = useState(false);
  const [currentPw, setCurrentPw] = useState("");
  const [newPw, setNewPw] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [pwBusy, setPwBusy] = useState(false);
  const [pwError, setPwError] = useState("");

  const openPw = () => {
    setCurrentPw("");
    setNewPw("");
    setShowPw(false);
    setPwError("");
    setPwOpen(true);
  };

  const savePw = async () => {
    if (pwBusy) return;
    if (!currentPw) {
      setPwError("Enter your current password.");
      return;
    }
    if (newPw.length < 8) {
      setPwError("Your new password must be at least 8 characters.");
      return;
    }
    if (newPw.length > 72) {
      setPwError("Your new password can be at most 72 characters.");
      return;
    }
    setPwError("");
    setPwBusy(true);
    try {
      await onChangePassword(currentPw, newPw);
      setPwOpen(false);
      Alert.alert("Password changed", "Use your new password the next time you sign in.");
    } catch (e) {
      setPwError(friendly(e, "Couldn't change the password. Try again."));
    }
    setPwBusy(false);
  };

  const confirmSignOut = () => {
    Alert.alert("Sign out?", "You can sign in again any time.", [
      { text: "Cancel", style: "cancel" },
      { text: "Sign out", style: "destructive", onPress: onSignOut },
    ]);
  };

  const inputStyle = [styles.input, { backgroundColor: colors.background, color: colors.textPrimary, borderColor: colors.border }];

  return (
    <ScrollView
      style={{ backgroundColor: colors.background }}
      contentContainerStyle={[styles.container, { backgroundColor: colors.background }]}
      keyboardShouldPersistTaps="handled"
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.accent} />}
    >
      <TopBar showBrand />

      {/* Profile card */}
      <View style={[styles.hero, SHADOW, { backgroundColor: heroColor }]}>
        <View style={styles.heroCircleBig} />
        <View style={styles.heroCircleSmall} />
        <TouchableOpacity activeOpacity={0.8} onPress={avatarMenu} style={styles.heroAvatar}>
          {avatar && !avatarFailed ? (
            <Image source={{ uri: avatar }} style={styles.heroAvatarImg} onError={() => setAvatarFailed(true)} />
          ) : (
            <Text style={styles.heroAvatarText}>{initials}</Text>
          )}
          <View style={[styles.cameraBadge, { backgroundColor: colors.accent }]}>
            <Ionicons name="camera" size={13} color="#FFFFFF" />
          </View>
        </TouchableOpacity>
        <Text numberOfLines={1} style={styles.heroName}>
          {user?.name || "Your account"}
        </Text>
        <Text numberOfLines={1} style={styles.heroEmail}>{user?.email}</Text>
        <View style={styles.pillRow}>
          {since ? (
            <View style={styles.sincePill}>
              <Ionicons name="calendar-outline" size={13} color="#FFFFFF" />
              <Text style={styles.sinceText}>Member since {since}</Text>
            </View>
          ) : null}
          {streak > 0 ? (
            <View style={styles.sincePill}>
              <Ionicons name="flame" size={13} color="#FFFFFF" />
              <Text style={styles.sinceText}>{streak}-day streak</Text>
            </View>
          ) : null}
        </View>
      </View>

      {/* Numbers */}
      <View style={styles.statRow}>
        {[
          { label: "Scans", value: counts.total, color: colors.accent },
          { label: "AI found", value: counts.ai, color: colors.danger },
          { label: "Likely real", value: counts.real, color: colors.success },
        ].map((s) => (
          <View
            key={s.label}
            style={[styles.statCard, SHADOW, { backgroundColor: colors.card, borderColor: `${s.color}55` }]}
          >
            <Text style={[styles.statValue, { color: colors.textPrimary }]}>{s.value}</Text>
            <Text style={[styles.statLabel, { color: colors.textSecondary }]}>{s.label}</Text>
            <View style={[styles.statAccent, { backgroundColor: s.color }]} />
          </View>
        ))}
      </View>

      <Text style={[styles.monthLine, { color: colors.textSecondary }]}>
        {counts.thisMonth === 1 ? "1 scan this month" : `${counts.thisMonth} scans this month`}
      </Text>

      {/* AI vs real bar */}
      {counts.total > 0 ? (
        <View style={[styles.panel, SHADOW, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={[styles.panelTitle, { color: colors.textPrimary }]}>Your results</Text>
          <View style={[styles.bar, { backgroundColor: colors.border }]}>
            <View style={{ width: `${pct(counts.ai)}%`, backgroundColor: colors.danger }} />
            <View style={{ width: `${pct(counts.other)}%`, backgroundColor: colors.warning }} />
            <View style={{ width: `${pct(counts.real)}%`, backgroundColor: colors.success }} />
          </View>
          <View style={styles.legendRow}>
            {[
              { label: "AI", n: counts.ai, c: colors.danger },
              { label: "Unsure", n: counts.other, c: colors.warning },
              { label: "Real", n: counts.real, c: colors.success },
            ].map((l) => (
              <View key={l.label} style={styles.legendItem}>
                <View style={[styles.legendDot, { backgroundColor: l.c }]} />
                <Text style={[styles.legendText, { color: colors.textSecondary }]}>
                  {l.label} {Math.round(pct(l.n))}%
                </Text>
              </View>
            ))}
          </View>
        </View>
      ) : null}

      {/* Recent scans */}
      <View style={styles.sectionHead}>
        <Text style={[styles.sectionLabel, { color: colors.textSecondary, marginTop: 0, marginBottom: 0 }]}>RECENT SCANS</Text>
        {scans.length > 0 ? (
          <TouchableOpacity onPress={onViewHistory}>
            <Text style={[styles.seeAll, { color: colors.accent }]}>See all</Text>
          </TouchableOpacity>
        ) : null}
      </View>
      {recent.length === 0 ? (
        <View style={[styles.panel, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={[styles.emptyText, { color: colors.textSecondary }]}>
            No scans yet. Tap the camera button below to check your first one.
          </Text>
        </View>
      ) : (
        <View style={styles.recentRow}>
          {recent.map((sc) => {
            const v = sc.result?.verdict?.verdict;
            const tone = v === "ai_generated" ? colors.danger : v === "likely_authentic" ? colors.success : colors.warning;
            return (
              <TouchableOpacity
                key={sc.id}
                activeOpacity={0.8}
                onPress={() => onOpenScan && onOpenScan(sc)}
                style={[styles.recentCard, SHADOW, { backgroundColor: colors.card, borderColor: colors.border }]}
              >
                <Thumb scan={sc} colors={colors} size={72} />
                <Text numberOfLines={1} style={[styles.recentName, { color: colors.textPrimary }]}>{sc.fileName}</Text>
                <View style={[styles.verdictChip, { backgroundColor: `${tone}22` }]}>
                  <Text style={[styles.verdictChipText, { color: tone }]} numberOfLines={1}>
                    {v === "ai_generated" ? "AI" : v === "likely_authentic" ? "Real" : "Unsure"}
                  </Text>
                </View>
              </TouchableOpacity>
            );
          })}
        </View>
      )}

      {/* Achievements */}
      <View style={styles.sectionHead}>
        <Text style={[styles.sectionLabel, { color: colors.textSecondary, marginTop: 0, marginBottom: 0 }]}>ACHIEVEMENTS</Text>
        <Text style={[styles.seeAll, { color: colors.textSecondary }]}>{earned}/{badges.length}</Text>
      </View>
      <View style={styles.badgeGrid}>
        {badges.map((b) => (
          <View
            key={b.key}
            style={[
              styles.badge,
              { backgroundColor: colors.card, borderColor: b.done ? colors.accent : colors.border, opacity: b.done ? 1 : 0.55 },
            ]}
          >
            <Ionicons name={b.done ? b.icon.replace("-outline", "") : b.icon} size={22} color={b.done ? colors.accent : colors.textSecondary} />
            <Text style={[styles.badgeText, { color: colors.textPrimary }]} numberOfLines={1}>{b.title}</Text>
          </View>
        ))}
      </View>

      {/* Account */}
      <Text style={[styles.sectionLabel, { color: colors.textSecondary }]}>ACCOUNT</Text>
      <View style={[styles.group, SHADOW, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <Row icon="person-outline" title="Edit name" sub={user?.name || "Add your name"} onPress={openName} colors={colors} />
        <Row icon="lock-closed-outline" title="Change password" sub="Choose a new password" onPress={openPw} colors={colors} />
        <Row icon="time-outline" title="Scan history" sub="See everything you have checked" onPress={onViewHistory} colors={colors} last />
      </View>

      <Text style={[styles.sectionLabel, { color: colors.textSecondary }]}>YOUR DATA</Text>
      <View style={[styles.group, SHADOW, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <Row icon="share-outline" title="Export my history" sub="Share a text report of your scans" onPress={exportHistory} colors={colors} />
        <Row icon="trash-outline" title="Delete scan history" sub="Remove all scans, keep your account" onPress={confirmClear} danger colors={colors} last />
      </View>

      <Text style={[styles.sectionLabel, { color: colors.textSecondary }]}>MORE</Text>
      <View style={[styles.group, SHADOW, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <Row icon="settings-outline" title="Settings" sub="Appearance, video quality, privacy, help" onPress={onSettings} colors={colors} />
        <Row icon="log-out-outline" title="Sign out" onPress={confirmSignOut} danger colors={colors} last />
      </View>

      {/* Edit name pop-up */}
      <Sheet
        visible={nameOpen}
        title="Edit name"
        onClose={() => setNameOpen(false)}
        onSave={saveName}
        saveLabel="Save"
        busy={nameBusy}
        error={nameError}
        colors={colors}
      >
        <TextInput
          style={inputStyle}
          value={nameValue}
          onChangeText={(v) => {
            setNameValue(v);
            setNameError("");
          }}
          placeholder="Your name"
          placeholderTextColor={colors.textSecondary}
          autoCapitalize="words"
          autoFocus
          editable={!nameBusy}
          onSubmitEditing={saveName}
        />
      </Sheet>

      {/* Change password pop-up */}
      <Sheet
        visible={pwOpen}
        title="Change password"
        onClose={() => setPwOpen(false)}
        onSave={savePw}
        saveLabel="Change"
        busy={pwBusy}
        error={pwError}
        colors={colors}
      >
        <TextInput
          style={inputStyle}
          value={currentPw}
          onChangeText={(v) => {
            setCurrentPw(v);
            setPwError("");
          }}
          placeholder="Current password"
          placeholderTextColor={colors.textSecondary}
          secureTextEntry={!showPw}
          autoCapitalize="none"
          autoCorrect={false}
          editable={!pwBusy}
        />
        <View style={[styles.pwRow, { backgroundColor: colors.background, borderColor: colors.border }]}>
          <TextInput
            style={[styles.pwInput, { color: colors.textPrimary }]}
            value={newPw}
            onChangeText={(v) => {
              setNewPw(v);
              setPwError("");
            }}
            placeholder="New password (8+ characters)"
            placeholderTextColor={colors.textSecondary}
            secureTextEntry={!showPw}
            autoCapitalize="none"
            autoCorrect={false}
            editable={!pwBusy}
            onSubmitEditing={savePw}
          />
          <TouchableOpacity onPress={() => setShowPw((s) => !s)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            <Ionicons name={showPw ? "eye-off-outline" : "eye-outline"} size={20} color={colors.textSecondary} />
          </TouchableOpacity>
        </View>
      </Sheet>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flexGrow: 1, paddingHorizontal: 24, paddingBottom: 40 },

  hero: { borderRadius: 28, padding: 22, marginTop: 8, marginBottom: 16, overflow: "hidden", alignItems: "center" },
  heroCircleBig: {
    position: "absolute", right: -50, top: -50, width: 190, height: 190,
    borderRadius: 95, backgroundColor: "rgba(255,255,255,0.10)",
  },
  heroCircleSmall: {
    position: "absolute", left: -30, bottom: -50, width: 130, height: 130,
    borderRadius: 65, backgroundColor: "rgba(255,255,255,0.07)",
  },
  heroAvatar: {
    width: 84, height: 84, borderRadius: 42, backgroundColor: "rgba(255,255,255,0.2)",
    alignItems: "center", justifyContent: "center", marginBottom: 12,
    borderWidth: 3, borderColor: "rgba(255,255,255,0.35)",
  },
  heroAvatarImg: { width: 78, height: 78, borderRadius: 39 },
  cameraBadge: {
    position: "absolute", right: -2, bottom: -2, width: 28, height: 28, borderRadius: 14,
    alignItems: "center", justifyContent: "center", borderWidth: 2, borderColor: "#FFFFFF",
  },
  pillRow: { flexDirection: "row", flexWrap: "wrap", justifyContent: "center", gap: 8, marginTop: 14 },
  heroAvatarText: { color: "#FFFFFF", fontSize: 34, fontWeight: "800" },
  heroName: { color: "#FFFFFF", fontSize: 22, fontWeight: "800", maxWidth: "100%" },
  heroEmail: { color: "rgba(255,255,255,0.8)", fontSize: 13, marginTop: 3, maxWidth: "100%" },
  sincePill: {
    flexDirection: "row", alignItems: "center", gap: 6,
    backgroundColor: "rgba(255,255,255,0.18)", paddingHorizontal: 12, paddingVertical: 6, borderRadius: 14,
  },
  sinceText: { color: "#FFFFFF", fontSize: 12, fontWeight: "700" },

  statRow: { flexDirection: "row", gap: 10 },
  statCard: { flex: 1, borderWidth: 1, borderRadius: 18, padding: 14, overflow: "hidden" },
  statValue: { fontSize: 26, fontWeight: "800", letterSpacing: -0.5 },
  statLabel: { fontSize: 12, fontWeight: "600", marginTop: 2, marginBottom: 10 },
  statAccent: { height: 4, borderRadius: 2, width: 28 },

  monthLine: { fontSize: 12, fontWeight: "600", marginTop: 12, textAlign: "center" },
  panel: { borderWidth: 1, borderRadius: 20, padding: 16, marginTop: 16 },
  panelTitle: { fontSize: 15, fontWeight: "800", marginBottom: 12 },
  bar: { flexDirection: "row", height: 12, borderRadius: 6, overflow: "hidden" },
  legendRow: { flexDirection: "row", justifyContent: "space-between", marginTop: 12 },
  legendItem: { flexDirection: "row", alignItems: "center", gap: 6 },
  legendDot: { width: 9, height: 9, borderRadius: 5 },
  legendText: { fontSize: 12, fontWeight: "700" },
  sectionHead: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: 24, marginBottom: 10 },
  seeAll: { fontSize: 12, fontWeight: "800" },
  emptyText: { fontSize: 13, lineHeight: 19, textAlign: "center" },
  recentRow: { flexDirection: "row", gap: 10 },
  recentCard: { flex: 1, borderWidth: 1, borderRadius: 18, padding: 10, alignItems: "center", gap: 8 },
  recentName: { fontSize: 11, fontWeight: "700", maxWidth: "100%" },
  verdictChip: { paddingHorizontal: 10, paddingVertical: 3, borderRadius: 10 },
  verdictChipText: { fontSize: 11, fontWeight: "800" },
  badgeGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  badge: { width: "31%", flexGrow: 1, borderWidth: 1, borderRadius: 16, paddingVertical: 14, paddingHorizontal: 6, alignItems: "center", gap: 6 },
  badgeText: { fontSize: 11, fontWeight: "700" },
  sectionLabel: { fontSize: 11, fontWeight: "700", letterSpacing: 1.2, marginTop: 24, marginBottom: 10 },
  group: { borderWidth: 1, borderRadius: 20, overflow: "hidden" },
  row: { flexDirection: "row", alignItems: "center", gap: 14, paddingHorizontal: 16, paddingVertical: 14 },
  rowIcon: { width: 38, height: 38, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  rowTitle: { fontSize: 15, fontWeight: "700" },
  rowSub: { fontSize: 12, lineHeight: 17, marginTop: 2 },

  overlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.55)", justifyContent: "center", paddingHorizontal: 24 },
  sheet: { borderWidth: 1, borderRadius: 22, padding: 20 },
  sheetTitle: { fontSize: 18, fontWeight: "800", marginBottom: 16 },
  input: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 13, fontSize: 15, marginBottom: 12 },
  pwRow: { flexDirection: "row", alignItems: "center", borderWidth: 1, borderRadius: 12, paddingHorizontal: 14, marginBottom: 12 },
  pwInput: { flex: 1, fontSize: 15, paddingVertical: 13 },
  sheetError: { fontSize: 13, fontWeight: "600", lineHeight: 19, marginBottom: 8 },
  sheetButtons: { flexDirection: "row", justifyContent: "flex-end", alignItems: "center", gap: 10, marginTop: 6 },
  sheetCancel: { paddingHorizontal: 16, paddingVertical: 12 },
  sheetCancelText: { fontSize: 14, fontWeight: "700" },
  sheetSave: { minWidth: 96, alignItems: "center", justifyContent: "center", paddingHorizontal: 20, paddingVertical: 12, borderRadius: 12 },
  sheetSaveText: { color: "#FFFFFF", fontSize: 14, fontWeight: "800" },
});