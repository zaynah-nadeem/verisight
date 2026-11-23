import React, { useEffect, useRef, useState } from "react";
import { View, Text, Image, TouchableOpacity, StyleSheet, Animated, PanResponder, Alert } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useAppTheme } from "../context/ThemeContext";
import { useHistory } from "../context/HistoryContext";
import TopBar from "../components/TopBar";
import VerdictBadge from "../components/VerdictBadge";
import SkeletonRows from "../components/SkeletonRows";
import ErrorCard from "../components/ErrorCard";
import RefreshScroll from "../components/RefreshScroll";
import { timeAgo } from "../utils/timeAgo";

const TYPE_FILTERS = [
  { key: "all", label: "All files" },
  { key: "image", label: "Images" },
  { key: "video", label: "Videos" },
];

const VERDICT_FILTERS = [
  { key: "all", label: "Any verdict" },
  { key: "likely_authentic", label: "Authentic" },
  { key: "inconclusive", label: "Inconclusive" },
  { key: "ai_generated", label: "AI-generated" },
];

function Chip({ label, active, onPress, colors }) {
  return (
    <TouchableOpacity
      onPress={onPress}
      style={[
        styles.chip,
        { borderColor: active ? colors.accent : colors.border, backgroundColor: active ? colors.accent : "transparent" },
      ]}
    >
      <Text style={[styles.chipText, { color: active ? "#FFFFFF" : colors.textSecondary }]}>{label}</Text>
    </TouchableOpacity>
  );
}

const DELETE_W = 88; // width of the red Delete button that appears when you swipe

// A row you can swipe to the left to show a Delete button
function SwipeRow({ open, onOpen, onClose, onDelete, colors, children }) {
  const x = useRef(new Animated.Value(0)).current;
  const resting = useRef(0); // where the row rests: 0 (closed) or -DELETE_W (open)
  const callbacks = useRef({ onOpen, onClose });
  callbacks.current = { onOpen, onClose };

  const snap = (to) => {
    resting.current = to;
    Animated.spring(x, { toValue: to, useNativeDriver: false, bounciness: 0, speed: 20 }).start();
  };

  // when the screen says "close this row" (for example another row was opened)
  useEffect(() => {
    snap(open ? -DELETE_W : 0);
  }, [open]);

  const pan = useRef(
    PanResponder.create({
      // only start when the finger moves sideways, so up/down scrolling still works
      onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dx) > 10 && Math.abs(g.dx) > Math.abs(g.dy) * 1.5,
      onPanResponderTerminationRequest: () => false,
      onPanResponderMove: (_, g) => {
        const next = Math.max(-DELETE_W - 24, Math.min(0, resting.current + g.dx));
        x.setValue(next);
      },
      onPanResponderRelease: (_, g) => {
        const end = resting.current + g.dx;
        const shouldOpen = g.vx < -0.4 || (g.vx < 0.4 && end < -DELETE_W / 2);
        snap(shouldOpen ? -DELETE_W : 0);
        if (shouldOpen) callbacks.current.onOpen();
        else callbacks.current.onClose();
      },
      onPanResponderTerminate: () => snap(resting.current),
    })
  ).current;

  return (
    <View style={[styles.swipeWrap, { borderColor: colors.border }]}>
      <TouchableOpacity
        activeOpacity={0.8}
        onPress={onDelete}
        style={[styles.deleteBtn, { backgroundColor: colors.danger }]}
      >
        <Ionicons name="trash-outline" size={20} color="#FFFFFF" />
        <Text style={styles.deleteText}>Delete</Text>
      </TouchableOpacity>
      <Animated.View
        style={{ backgroundColor: colors.background, transform: [{ translateX: x }] }}
        {...pan.panHandlers}
      >
        {children}
      </Animated.View>
    </View>
  );
}

export default function HistoryScreen({ onBack, onOpenScan }) {
  const { colors } = useAppTheme();
  const { scans, refresh, loading, error, deleteScan } = useHistory();
  const [typeFilter, setTypeFilter] = useState("all");
  const [verdictFilter, setVerdictFilter] = useState("all");
  const [openId, setOpenId] = useState(null); // the row that is currently swiped open

  const confirmDelete = (scan) => {
    Alert.alert("Delete this scan?", "It will be removed from your history.", [
      { text: "Cancel", style: "cancel", onPress: () => setOpenId(null) },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          try {
            await deleteScan(scan.id);
          } catch (e) {
            Alert.alert("Couldn't delete", e?.message || "Something went wrong. Try again.");
          }
          setOpenId(null);
        },
      },
    ]);
  };

  const visible = scans.filter(
    (s) =>
      (typeFilter === "all" || s.fileType === typeFilter) &&
      (verdictFilter === "all" || s.result.verdict.verdict === verdictFilter)
  );

  const showSkeleton = loading && scans.length === 0;
  const showError = !!error && scans.length === 0 && !loading;

  return (
    <RefreshScroll
      onRefresh={refresh}
      contentContainerStyle={[styles.container, { backgroundColor: colors.background }]}
    >
      <TopBar onBack={onBack} />

      <Text style={[styles.title, { color: colors.textPrimary }]}>Scan history</Text>

      <View style={styles.chipRow}>
        {TYPE_FILTERS.map((f) => (
          <Chip key={f.key} label={f.label} active={typeFilter === f.key} onPress={() => setTypeFilter(f.key)} colors={colors} />
        ))}
      </View>
      <View style={[styles.chipRow, { marginBottom: 20 }]}>
        {VERDICT_FILTERS.map((f) => (
          <Chip key={f.key} label={f.label} active={verdictFilter === f.key} onPress={() => setVerdictFilter(f.key)} colors={colors} />
        ))}
      </View>

      {visible.length > 0 ? (
        <Text style={[styles.swipeHint, { color: colors.textSecondary }]}>Swipe a scan to the left to delete it</Text>
      ) : null}

      {error && scans.length > 0 ? (
        <View style={[styles.notice, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Ionicons name="cloud-offline-outline" size={14} color={colors.textSecondary} />
          <Text style={[styles.noticeText, { color: colors.textSecondary }]}>
            Couldn't refresh. Showing your last saved list.
          </Text>
        </View>
      ) : null}

      {showSkeleton ? (
        <SkeletonRows count={5} withThumb />
      ) : showError ? (
        <ErrorCard error={error} onRetry={refresh} />
      ) : visible.length === 0 ? (
        <View style={[styles.emptyCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Ionicons name="file-tray-outline" size={22} color={colors.textSecondary} />
          <Text style={[styles.emptyTitle, { color: colors.textPrimary }]}>
            {scans.length === 0 ? "No scans yet" : "Nothing matches these filters"}
          </Text>
          <Text style={[styles.emptySubtitle, { color: colors.textSecondary }]}>
            {scans.length === 0
              ? "Check a file and the result will be saved here."
              : "Try a different file type or verdict."}
          </Text>
        </View>
      ) : (
        visible.map((scan) => (
          <SwipeRow
            key={scan.id}
            open={openId === scan.id}
            onOpen={() => setOpenId(scan.id)}
            onClose={() => setOpenId((id) => (id === scan.id ? null : id))}
            onDelete={() => confirmDelete(scan)}
            colors={colors}
          >
            <TouchableOpacity
              activeOpacity={0.7}
              style={styles.row}
              onPress={() => (openId === scan.id ? setOpenId(null) : onOpenScan(scan))}
            >
              {scan.fileType === "image" && scan.uri ? (
                <Image source={{ uri: scan.uri }} style={styles.thumb} />
              ) : (
                <View style={[styles.thumb, styles.thumbPlaceholder, { backgroundColor: colors.card, borderColor: colors.border }]}>
                  <Ionicons
                    name={scan.fileType === "video" ? "videocam-outline" : "image-outline"}
                    size={18}
                    color={colors.textSecondary}
                  />
                </View>
              )}
              <View style={{ flex: 1 }}>
                <Text numberOfLines={1} style={[styles.fileName, { color: colors.textPrimary }]}>{scan.fileName}</Text>
                <Text style={[styles.date, { color: colors.textSecondary }]}>{timeAgo(scan.createdAt)}</Text>
              </View>
              <VerdictBadge verdict={scan.result.verdict.verdict} />
            </TouchableOpacity>
          </SwipeRow>
        ))
      )}
    </RefreshScroll>
  );
}

const styles = StyleSheet.create({
  container: { flexGrow: 1, paddingHorizontal: 24, paddingBottom: 40 },
  title: { fontSize: 26, fontWeight: "800", marginTop: 12, marginBottom: 18, letterSpacing: -0.3 },
  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 10 },
  chip: { borderWidth: 1, borderRadius: 20, paddingHorizontal: 12, paddingVertical: 6 },
  chipText: { fontSize: 12, fontWeight: "600" },
  notice: { flexDirection: "row", alignItems: "center", gap: 8, borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 9, marginBottom: 12 },
  noticeText: { fontSize: 12, flex: 1 },
  swipeHint: { fontSize: 11, marginBottom: 6 },
  swipeWrap: { borderBottomWidth: 1, overflow: "hidden" },
  deleteBtn: {
    position: "absolute", right: 0, top: 0, bottom: 0, width: DELETE_W,
    alignItems: "center", justifyContent: "center", gap: 3,
  },
  deleteText: { color: "#FFFFFF", fontSize: 12, fontWeight: "700" },
  row: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 12 },
  thumb: { width: 46, height: 46, borderRadius: 10 },
  thumbPlaceholder: { borderWidth: 1, alignItems: "center", justifyContent: "center" },
  fileName: { fontSize: 14, fontWeight: "600" },
  date: { fontSize: 11, marginTop: 2 },
  emptyCard: { borderRadius: 16, borderWidth: 1, padding: 22, alignItems: "center" },
  emptyTitle: { fontSize: 14, fontWeight: "700", marginTop: 10, marginBottom: 4 },
  emptySubtitle: { fontSize: 12, textAlign: "center", lineHeight: 17 },
});