import React, { useState } from "react";
import {
  View, Text, Image, TouchableOpacity, StyleSheet, ScrollView, ActivityIndicator, Alert, Linking,
} from "react-native";
import { VideoView, useVideoPlayer } from "expo-video";
import { Ionicons } from "@expo/vector-icons";
import { useAppTheme } from "../context/ThemeContext";
import TopBar from "../components/TopBar";
import { shareReport } from "../utils/exportReport";
import { saveWrongReport } from "../utils/reportWrong";

const VERDICTS = {
  likely_authentic: { title: "Likely authentic", icon: "checkmark-circle-outline", tone: "success" },
  inconclusive: { title: "Inconclusive", icon: "help-circle-outline", tone: "warning" },
  ai_generated: { title: "Likely AI-generated", icon: "alert-circle-outline", tone: "danger" },
};

const C2PA_TITLES = {
  absent: "Not present",
  present: "Present",
  valid: "Present and verified",
  unverified: "Signer not verified",
  invalid: "Failed verification",
};

const C2PA_SUMMARY = {
  absent: "No content credentials found in this file. That's common and doesn't mean it's fake.",
  present: "Content credentials found. This file carries a signed record of how it was made.",
  valid: "The credentials match the file and the signer is trusted.",
  unverified:
    "The credentials match the file, but we couldn't verify the signer's certificate. This doesn't mean the file was changed.",
  invalid: "The credentials no longer match the file, so it may have been changed after it was signed.",
  validUntrusted:
    "The credentials match the file, but the signer isn't on our trusted list, so we can't confirm who made it.",
};

// Google Lens: finds where else a picture appears online
const LENS_HOME = "https://lens.google.com/";
const lensForLink = (link) => `https://lens.google.com/uploadbyurl?url=${encodeURIComponent(link)}`;

async function openInBrowser(url) {
  try {
    await Linking.openURL(url);
  } catch (e) {
    Alert.alert("Couldn't open Google Lens", "Open lens.google.com in your browser and upload the photo there.");
  }
}

const PHOTO_LIBRARY_HINT =
  "Credentials can be removed when files are picked from Photos. Try 'Files (original)'.";

function VideoPreview({ uri, style }) {
  const player = useVideoPlayer(uri, (p) => {
    p.loop = false;
  });
  return <VideoView player={player} style={style} nativeControls contentFit="contain" />;
}

// The photo with the highlight on top. Both pictures are stretched to the same box,
// which has the photo's own shape, so the highlight lands on the right spot.
function HeatPreview({ uri, heatmap, aspect, borderColor }) {
  return (
    <View style={[styles.preview, { height: undefined, aspectRatio: aspect || 1, borderColor, marginBottom: 12 }]}>
      <Image source={{ uri }} style={StyleSheet.absoluteFill} resizeMode="stretch" />
      <Image source={{ uri: heatmap }} style={StyleSheet.absoluteFill} resizeMode="stretch" />
    </View>
  );
}

function InfoRow({ label, value, colors }) {
  return (
    <View style={styles.infoRow}>
      <Text style={[styles.infoLabel, { color: colors.textSecondary }]}>{label}</Text>
      <Text style={[styles.infoValue, { color: colors.textPrimary }]}>{value}</Text>
    </View>
  );
}

function CredentialsCard({ c2pa, file, colors }) {
  const [showDetails, setShowDetails] = useState(false);

  const actions = Array.isArray(c2pa.actions) ? c2pa.actions : [];
  const codes = Array.isArray(c2pa.codes) ? [...new Set(c2pa.codes)] : [];
  const notTrusted = c2pa.status === "valid" && c2pa.trusted === false;
  const title = notTrusted ? "Present, signer not on trusted list" : C2PA_TITLES[c2pa.status] || "Unknown";
  const summary = notTrusted
    ? C2PA_SUMMARY.validUntrusted
    : C2PA_SUMMARY[c2pa.status] || c2pa.detail || "Status unknown.";
  const hasStructured = !!(c2pa.tool || c2pa.signer || actions.length || codes.length);
  const fromPhotos = c2pa.status === "absent" && file?.source === "photos";

  return (
    <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <View style={styles.c2paHeader}>
        <Text style={[styles.c2paStatus, { color: colors.textPrimary }]}>
          {title}
        </Text>
        {c2pa.ai_generated ? (
          <View style={[styles.aiBadge, { borderColor: colors.danger }]}>
            <Ionicons name="sparkles-outline" size={12} color={colors.danger} />
            <Text style={[styles.aiBadgeText, { color: colors.danger }]}>AI-generated</Text>
          </View>
        ) : null}
      </View>

      <Text style={[styles.c2paText, { color: colors.textSecondary }]}>
        {summary}
      </Text>

      {hasStructured ? (
        <View style={[styles.infoBlock, { borderTopColor: colors.border }]}>
          {c2pa.tool ? <InfoRow label="Made with" value={c2pa.tool} colors={colors} /> : null}
          {c2pa.signer ? <InfoRow label="Signed by" value={c2pa.signer} colors={colors} /> : null}
          {actions.length ? (
            <View style={styles.infoRow}>
              <Text style={[styles.infoLabel, { color: colors.textSecondary }]}>History</Text>
              <View style={styles.historyList}>
                {actions.map((a, i) => (
                  <View key={`${a}-${i}`} style={styles.historyItem}>
                    <View style={[styles.historyDot, { backgroundColor: colors.accent }]} />
                    <Text style={[styles.infoValue, { color: colors.textPrimary }]}>{a}</Text>
                  </View>
                ))}
              </View>
            </View>
          ) : null}
        </View>
      ) : c2pa.status !== "absent" && c2pa.detail ? (
        // older saved scans only have the text version
        <Text style={[styles.c2paText, { color: colors.textSecondary, marginTop: 10 }]}>{c2pa.detail}</Text>
      ) : null}

      {fromPhotos ? (
        <View style={[styles.hintBox, { borderColor: colors.border }]}>
          <Ionicons name="information-circle-outline" size={16} color={colors.warning} />
          <Text style={[styles.hintText, { color: colors.textSecondary }]}>{PHOTO_LIBRARY_HINT}</Text>
        </View>
      ) : null}

      {codes.length ? (
        <>
          <TouchableOpacity style={styles.detailsToggle} onPress={() => setShowDetails((v) => !v)}>
            <Text style={[styles.detailsToggleText, { color: colors.accent }]}>
              {showDetails ? "Hide details" : "Details"}
            </Text>
            <Ionicons name={showDetails ? "chevron-up" : "chevron-down"} size={16} color={colors.accent} />
          </TouchableOpacity>
          {showDetails ? (
            <View style={styles.codesBlock}>
              <Text style={[styles.infoLabel, styles.wideLabel, { color: colors.textSecondary }]}>Technical codes</Text>
              {codes.map((code, i) => (
                <Text key={`${code}-${i}`} style={[styles.codeText, { color: colors.textPrimary }]}>
                  {code}
                </Text>
              ))}
              <Text style={[styles.c2paText, { color: colors.textSecondary, marginTop: 8 }]}>
                {c2pa.trusted
                  ? "Signer is on a trusted list."
                  : "Signer is not on our trusted list, or its certificate could not be checked."}
              </Text>
            </View>
          ) : null}
        </>
      ) : null}
    </View>
  );
}

export default function ResultScreen({ result, file, onBack, onNewScan, actionLabel = "Check another file" }) {
  const { colors } = useAppTheme();
  const [sharing, setSharing] = useState(false);
  const [reported, setReported] = useState(false);
  const [showHeat, setShowHeat] = useState(false);
  const { verdict, c2pa, disclaimer } = result;

  const meta = VERDICTS[verdict.verdict] || VERDICTS.inconclusive;
  const toneColor = colors[meta.tone];
  const low = Math.round(verdict.confidence_low);
  const high = Math.round(verdict.confidence_high);

  const handleShare = async () => {
    if (sharing) return;
    setSharing(true);
    try {
      await shareReport({ result, file });
    } catch (e) {
      Alert.alert("Couldn't create the report", e.message || "Something went wrong. Try again.");
    } finally {
      setSharing(false);
    }
  };

  // "Report wrong result": the person tells us what the file really is
  const sendReport = async (actuallyIs) => {
    try {
      await saveWrongReport({ result, file, actuallyIs });
      setReported(true);
      Alert.alert("Thank you", "Your report was saved. It helps us find where the detector gets things wrong.");
    } catch (e) {
      Alert.alert("Couldn't save the report", "Something went wrong. Try again.");
    }
  };

  const handleReportWrong = () => {
    if (reported) return;
    Alert.alert("Report wrong result", "What is this file really?", [
      { text: "It's real (not AI)", onPress: () => sendReport("real") },
      { text: "It's AI-generated", onPress: () => sendReport("ai_generated") },
      { text: "Cancel", style: "cancel" },
    ]);
  };

  // Google Lens is for pictures, and needs the picture to still be on this phone (or a link)
  const isImage = result.file_type !== "video";
  const fromLink = /^https?:\/\//i.test(file?.uri || "");
  const canUseLens = isImage && !!file?.uri;

  const searchOnLens = () => {
    if (fromLink) {
      // a picture from a link: Lens can open it directly
      openInBrowser(lensForLink(file.uri));
      return;
    }
    Alert.alert(
      "Search on Google Lens",
      "Google Lens will open in your browser. Tap the camera icon there and choose this photo from your gallery. (If it isn't in your gallery, save it to your photos first.)",
      [
        { text: "Cancel", style: "cancel" },
        { text: "Open Google Lens", onPress: () => openInBrowser(LENS_HOME) },
      ]
    );
  };

  const heatmap = verdict.heatmap;
  const canHeat = !!heatmap && result.file_type !== "video" && !!file?.uri;

  const previewStyle = [styles.preview, { borderColor: colors.border }, canHeat ? { marginBottom: 12 } : null];

  let preview;
  if (canHeat && showHeat) {
    preview = (
      <HeatPreview
        uri={file.uri}
        heatmap={heatmap}
        aspect={verdict.heatmap_aspect}
        borderColor={colors.border}
      />
    );
  } else if (file?.uri && result.file_type === "video") {
    preview = <VideoPreview uri={file.uri} style={[previewStyle, { backgroundColor: "#000" }]} />;
  } else if (file?.uri) {
    preview = <Image source={{ uri: file.uri }} style={previewStyle} />;
  } else {
    preview = (
      <View style={[previewStyle, styles.previewPlaceholder, { backgroundColor: colors.card }]}>
        <Ionicons name="image-outline" size={30} color={colors.textSecondary} />
      </View>
    );
  }

  return (
    <ScrollView contentContainerStyle={[styles.container, { backgroundColor: colors.background }]}>
      <TopBar onBack={onBack} />

      {preview}

      {canHeat ? (
        <View style={styles.heatWrap}>
          <TouchableOpacity
            activeOpacity={0.7}
            style={[styles.heatButton, { borderColor: showHeat ? colors.danger : colors.border, backgroundColor: colors.card }]}
            onPress={() => setShowHeat((v) => !v)}
          >
            <Ionicons name={showHeat ? "eye-off-outline" : "scan-outline"} size={16} color={showHeat ? colors.danger : colors.textPrimary} />
            <Text style={[styles.heatButtonText, { color: showHeat ? colors.danger : colors.textPrimary }]}>
              {showHeat ? "Hide highlights" : "Show highlights"}
            </Text>
          </TouchableOpacity>
          {showHeat ? (
            <Text style={[styles.heatNote, { color: colors.textSecondary }]}>
              Red areas are the parts of the picture the detector was most sensitive to when it made its decision. This shows where it looked, it is not proof that this part was edited.
            </Text>
          ) : null}
        </View>
      ) : null}

      <View style={styles.verdictRow}>
        <Ionicons name={meta.icon} size={28} color={toneColor} />
        <Text style={[styles.verdictTitle, { color: colors.textPrimary }]}>{meta.title}</Text>
      </View>

      <Text style={[styles.sectionLabel, { color: colors.textSecondary }]}>AI-GENERATED LIKELIHOOD</Text>
      <View style={[styles.barTrack, { backgroundColor: colors.border }]}>
        <View
          style={[
            styles.barRange,
            { left: `${low}%`, width: `${Math.max(high - low, 2)}%`, backgroundColor: toneColor },
          ]}
        />
      </View>
      <View style={styles.barLabels}>
        <Text style={[styles.barLabel, { color: colors.textSecondary }]}>0%</Text>
        <Text style={[styles.rangeText, { color: colors.textPrimary }]}>
          Between {low}% and {high}%
        </Text>
        <Text style={[styles.barLabel, { color: colors.textSecondary }]}>100%</Text>
      </View>

      <Text style={[styles.sectionLabel, { color: colors.textSecondary, marginTop: 28 }]}>WHY WE SAY THAT</Text>
      <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
        {verdict.explanation.map((line, i) => (
          <View key={i} style={styles.reasonRow}>
            <View style={[styles.dot, { backgroundColor: toneColor }]} />
            <Text style={[styles.reasonText, { color: colors.textPrimary }]}>{line}</Text>
          </View>
        ))}
      </View>

      <Text style={[styles.sectionLabel, { color: colors.textSecondary, marginTop: 28 }]}>CONTENT CREDENTIALS</Text>
      <CredentialsCard c2pa={c2pa} file={file} colors={colors} />

      {canUseLens ? (
        <TouchableOpacity
          activeOpacity={0.7}
          style={[styles.lensCard, { backgroundColor: colors.card, borderColor: colors.border }]}
          onPress={searchOnLens}
        >
          <View style={[styles.lensIcon, { backgroundColor: `${colors.accent}22` }]}>
            <Ionicons name="search-outline" size={20} color={colors.accent} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[styles.lensTitle, { color: colors.textPrimary }]}>Search on Google Lens</Text>
            <Text style={[styles.lensSub, { color: colors.textSecondary }]}>
              {fromLink ? "See where else this image appears online" : "Find where this photo appears online"}
            </Text>
          </View>
          <Ionicons name="open-outline" size={18} color={colors.textSecondary} />
        </TouchableOpacity>
      ) : null}

      <Text style={[styles.disclaimer, { color: colors.textSecondary }]}>{disclaimer}</Text>

      <TouchableOpacity
        style={[styles.shareButton, { borderColor: colors.accent }]}
        onPress={handleShare}
        disabled={sharing}
      >
        {sharing ? (
          <ActivityIndicator color={colors.accent} />
        ) : (
          <>
            <Ionicons name="share-outline" size={18} color={colors.accent} />
            <Text style={[styles.shareText, { color: colors.accent }]}>Share report</Text>
          </>
        )}
      </TouchableOpacity>

      <TouchableOpacity style={styles.reportButton} onPress={handleReportWrong} disabled={reported} activeOpacity={0.7}>
        <Ionicons
          name={reported ? "checkmark-circle-outline" : "flag-outline"}
          size={16}
          color={reported ? colors.success : colors.textSecondary}
        />
        <Text style={[styles.reportText, { color: reported ? colors.success : colors.textSecondary }]}>
          {reported ? "Reported, thank you" : "Report wrong result"}
        </Text>
      </TouchableOpacity>

      <TouchableOpacity style={[styles.newScanButton, { backgroundColor: colors.accent }]} onPress={onNewScan}>
        <Text style={styles.newScanText}>{actionLabel}</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flexGrow: 1, paddingHorizontal: 24, paddingBottom: 40 },
  preview: { width: "100%", height: 220, borderRadius: 16, borderWidth: 1, marginTop: 10, marginBottom: 22, overflow: "hidden" },
  previewPlaceholder: { alignItems: "center", justifyContent: "center" },
  heatWrap: { marginBottom: 18 },
  heatButton: {
    flexDirection: "row", alignItems: "center", gap: 8, alignSelf: "flex-start",
    borderWidth: 1, borderRadius: 999, paddingHorizontal: 14, paddingVertical: 8,
  },
  heatButtonText: { fontSize: 13, fontWeight: "700" },
  heatNote: { fontSize: 12, lineHeight: 17, marginTop: 8 },
  verdictRow: { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 24 },
  verdictTitle: { fontSize: 24, fontWeight: "800", letterSpacing: -0.3 },
  sectionLabel: { fontSize: 11, fontWeight: "700", letterSpacing: 1.2, marginBottom: 10 },
  barTrack: { height: 10, borderRadius: 5, overflow: "hidden" },
  barRange: { position: "absolute", top: 0, bottom: 0, borderRadius: 5 },
  barLabels: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: 8 },
  barLabel: { fontSize: 11 },
  rangeText: { fontSize: 13, fontWeight: "700" },
  card: { borderWidth: 1, borderRadius: 16, padding: 16 },
  reasonRow: { flexDirection: "row", alignItems: "flex-start", gap: 10, marginBottom: 10 },
  dot: { width: 6, height: 6, borderRadius: 3, marginTop: 7 },
  reasonText: { flex: 1, fontSize: 14, lineHeight: 20 },
  c2paHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 4, gap: 8 },
  c2paStatus: { fontSize: 14, fontWeight: "700", flexShrink: 1 },
  c2paText: { fontSize: 13, lineHeight: 19 },
  aiBadge: {
    flexDirection: "row", alignItems: "center", gap: 4,
    borderWidth: 1, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 3,
  },
  aiBadgeText: { fontSize: 11, fontWeight: "700" },
  infoBlock: { borderTopWidth: 1, marginTop: 12, paddingTop: 12, gap: 8 },
  infoRow: { flexDirection: "row", alignItems: "flex-start", gap: 12 },
  infoLabel: { width: 78, fontSize: 12, fontWeight: "600" },
  wideLabel: { width: "auto" },
  infoValue: { flex: 1, fontSize: 13, lineHeight: 19 },
  historyList: { flex: 1, gap: 4 },
  historyItem: { flexDirection: "row", alignItems: "center", gap: 8 },
  historyDot: { width: 6, height: 6, borderRadius: 3 },
  hintBox: {
    flexDirection: "row", alignItems: "flex-start", gap: 8,
    borderTopWidth: 1, marginTop: 12, paddingTop: 12,
  },
  hintText: { flex: 1, fontSize: 12, lineHeight: 18 },
  detailsToggle: { flexDirection: "row", alignItems: "center", gap: 4, marginTop: 12, alignSelf: "flex-start" },
  detailsToggleText: { fontSize: 13, fontWeight: "700" },
  codesBlock: { marginTop: 10, gap: 4 },
  codeText: { fontSize: 12 },
  lensCard: {
    flexDirection: "row", alignItems: "center", gap: 14,
    borderWidth: 1, borderRadius: 16, padding: 14, marginTop: 28,
  },
  lensIcon: { width: 42, height: 42, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  lensTitle: { fontSize: 15, fontWeight: "800" },
  lensSub: { fontSize: 12, marginTop: 2, lineHeight: 17 },
  disclaimer: { fontSize: 11, lineHeight: 16, marginTop: 24, marginBottom: 20 },
  shareButton: {
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8,
    paddingVertical: 14, borderRadius: 12, borderWidth: 1.5, marginBottom: 12, minHeight: 50,
  },
  shareText: { fontWeight: "700", fontSize: 15 },
  reportButton: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 10, marginBottom: 10 },
  reportText: { fontSize: 13, fontWeight: "600" },
  newScanButton: { paddingVertical: 15, borderRadius: 12, alignItems: "center" },
  newScanText: { color: "#FFFFFF", fontWeight: "700", fontSize: 15 },
});