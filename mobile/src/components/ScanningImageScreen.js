import React, { useEffect, useRef, useState } from "react";
import { View, Text, Image, Animated, Easing, StyleSheet, Dimensions } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import * as VideoThumbnails from "expo-video-thumbnails";
import { useAppTheme } from "../context/ThemeContext";

const MIN_MS = 3000; // shortest time the scanner is shown, even if the answer comes sooner
const SCREEN = Dimensions.get("window");
const MAX_W = SCREEN.width - 90;
const MAX_H = Math.round(SCREEN.height * 0.5);
const PARTICLE_COUNT = 50;

const DUSTY_BLACK = "#121012";
const DARK_RED = "#5A0000";
const BRIGHT_RED = "#FF1E3C";

// Same face-marker boxes as the start-up screen (positions are % of the picture)
const MARKERS = [
  { top: 0.22, left: 0.28, w: 34, h: 22, delay: 0 },
  { top: 0.22, left: 0.62, w: 34, h: 22, delay: 300 },
  { top: 0.42, left: 0.45, w: 26, h: 26, delay: 650 },
  { top: 0.58, left: 0.33, w: 44, h: 18, delay: 950 },
  { top: 0.72, left: 0.3, w: 50, h: 24, delay: 1250 },
  { top: 0.15, left: 0.46, w: 30, h: 20, delay: 1550 },
];

function ParticleField() {
  const particles = useRef(
    Array.from({ length: PARTICLE_COUNT }, () => ({
      left: Math.random() * SCREEN.width,
      top: Math.random() * SCREEN.height,
      size: 1 + Math.random() * 2.2,
      duration: 7000 + Math.random() * 9000,
      delay: Math.random() * 4000,
      anim: new Animated.Value(0),
    }))
  ).current;

  useEffect(() => {
    const loops = particles.map((p) =>
      Animated.loop(
        Animated.timing(p.anim, {
          toValue: 1,
          duration: p.duration,
          delay: p.delay,
          easing: Easing.linear,
          useNativeDriver: true,
        })
      )
    );
    loops.forEach((l) => l.start());
    return () => loops.forEach((l) => l.stop());
  }, []);

  return (
    <>
      {particles.map((p, i) => {
        const translateY = p.anim.interpolate({
          inputRange: [0, 1],
          outputRange: [SCREEN.height * 0.08, -SCREEN.height * 0.08],
        });
        const opacity = p.anim.interpolate({
          inputRange: [0, 0.1, 0.9, 1],
          outputRange: [0, 0.5, 0.5, 0],
        });
        return (
          <Animated.View
            key={i}
            style={{
              position: "absolute",
              left: p.left,
              top: p.top,
              width: p.size,
              height: p.size,
              borderRadius: p.size,
              backgroundColor: "#D8CFC4",
              opacity,
              transform: [{ translateY }],
            }}
          />
        );
      })}
    </>
  );
}

function AnalysisMarkers() {
  const anims = useRef(MARKERS.map(() => new Animated.Value(0))).current;

  useEffect(() => {
    const loops = MARKERS.map((m, i) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay(m.delay),
          Animated.timing(anims[i], { toValue: 1, duration: 180, useNativeDriver: true }),
          Animated.delay(450),
          Animated.timing(anims[i], { toValue: 0, duration: 220, useNativeDriver: true }),
          Animated.delay(900),
        ])
      )
    );
    loops.forEach((l) => l.start());
    return () => loops.forEach((l) => l.stop());
  }, []);

  return (
    <>
      {MARKERS.map((m, i) => (
        <Animated.View
          key={i}
          style={{
            position: "absolute",
            top: `${m.top * 100}%`,
            left: `${m.left * 100}%`,
            width: m.w,
            height: m.h,
            borderWidth: 1,
            borderColor: BRIGHT_RED,
            opacity: anims[i],
            transform: [{ scale: anims[i].interpolate({ inputRange: [0, 1], outputRange: [0.85, 1] }) }],
          }}
        />
      ))}
    </>
  );
}

// Looks like the start-up screen, but shows the file that is being checked
export default function ScanningImageScreen({ file, label, onComplete }) {
  const { colors } = useAppTheme();
  const isVideo = file?.type === "video";
  const uri = file?.uri || "";
  const [ratio, setRatio] = useState(0.8); // width / height, until the real size is known
  const [failed, setFailed] = useState(false);
  const [thumb, setThumb] = useState(""); // a still picture taken from a video
  const [percent, setPercent] = useState(0);

  const sweepAnim = useRef(new Animated.Value(0)).current;
  const fade = useRef(new Animated.Value(0)).current;

  // pictures: work out the shape so the box fits it
  useEffect(() => {
    if (!uri || isVideo) return;
    Image.getSize(
      uri,
      (w, h) => {
        if (w > 0 && h > 0) setRatio(w / h);
      },
      () => setFailed(true)
    );
  }, [uri, isVideo]);

  // videos: grab one still picture from the video to show
  useEffect(() => {
    if (!uri || !isVideo) return undefined;
    let alive = true;
    (async () => {
      for (const time of [1000, 300, 0]) {
        try {
          const res = await VideoThumbnails.getThumbnailAsync(uri, { time, quality: 0.7 });
          if (alive && res?.uri) {
            if (res.width > 0 && res.height > 0) setRatio(res.width / res.height);
            setThumb(res.uri);
          }
          return;
        } catch (e) {
          // try an earlier moment (very short clips have no frame at 1 second)
        }
      }
    })();
    return () => {
      alive = false;
    };
  }, [uri, isVideo]);

  // tell the app the animation had its minimum time
  useEffect(() => {
    const t = setTimeout(() => onComplete && onComplete(), MIN_MS);
    return () => clearTimeout(t);
  }, []);

  // the number climbs quickly, then slows down and waits near the end until the answer arrives
  useEffect(() => {
    const timer = setInterval(() => {
      setPercent((p) => (p >= 99 ? 99 : Math.min(99, p + Math.max(1, Math.round((99 - p) * 0.06)))));
    }, 180);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    Animated.timing(fade, { toValue: 1, duration: 350, useNativeDriver: true }).start();
    const loop = Animated.loop(
      Animated.timing(sweepAnim, { toValue: 1, duration: 2200, easing: Easing.linear, useNativeDriver: true })
    );
    loop.start();
    return () => loop.stop();
  }, []);

  const shownUri = isVideo ? thumb : uri;
  let boxW = MAX_W;
  let boxH = boxW / ratio;
  if (boxH > MAX_H) {
    boxH = MAX_H;
    boxW = boxH * ratio;
  }
  if (!shownUri || failed) {
    boxW = MAX_W;
    boxH = Math.round(MAX_W * 1.2);
  }

  const translateY = sweepAnim.interpolate({ inputRange: [0, 1], outputRange: [-boxH / 2, boxH / 2] });
  const trailOpacity = sweepAnim.interpolate({ inputRange: [0, 0.05, 0.95, 1], outputRange: [0, 1, 1, 0] });

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <ParticleField />

      <Animated.View style={[styles.centerArea, { opacity: fade }]}>
        <View style={{ width: boxW, height: boxH }}>
          <View style={[styles.clip, { width: boxW, height: boxH, backgroundColor: DUSTY_BLACK }]}>
            {shownUri && !failed ? (
              <Image
                source={{ uri: shownUri }}
                style={styles.photo}
                resizeMode="cover"
                onError={() => setFailed(true)}
              />
            ) : (
              <View style={styles.placeholder}>
                <Ionicons name={isVideo ? "videocam-outline" : "image-outline"} size={54} color="#8A7F74" />
                {isVideo ? (
                  <Text style={styles.placeholderText} numberOfLines={1}>
                    {file?.fileName || "Your video"}
                  </Text>
                ) : null}
              </View>
            )}

            <AnalysisMarkers />

            <Animated.View style={[styles.scanGroup, { transform: [{ translateY }], opacity: trailOpacity }]}>
              <LinearGradient colors={["transparent", BRIGHT_RED]} style={styles.glowUp} pointerEvents="none" />
              <View style={styles.scanCore} />
              <LinearGradient colors={[BRIGHT_RED, "transparent"]} style={styles.glowDown} pointerEvents="none" />
            </Animated.View>
          </View>
          <View pointerEvents="none" style={styles.fixedBorder} />
        </View>
      </Animated.View>

      <View style={styles.bottomArea}>
        <View style={styles.percentRow}>
          <Text style={styles.loadingLabel}>LOADING</Text>
          <Text style={styles.percent}>{percent}</Text>
          <Text style={styles.percentSign}>%</Text>
        </View>
        <Text style={styles.caption}>{label || "Analyzing"}</Text>
        <Text style={styles.hint}>
          {isVideo ? "Please keep the app open. Videos take longer." : "Please keep the app open."}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, overflow: "hidden" },
  centerArea: { flex: 1, alignItems: "center", justifyContent: "center", paddingBottom: 60 },
  clip: { position: "absolute", overflow: "hidden", borderRadius: 4 },
  photo: { width: "100%", height: "100%" },
  placeholder: { flex: 1, alignItems: "center", justifyContent: "center", gap: 10, paddingHorizontal: 16 },
  placeholderText: { fontSize: 13, fontWeight: "600", color: "#8A7F74" },

  scanGroup: { position: "absolute", left: 0, right: 0, top: "50%", marginTop: -14, alignItems: "center" },
  glowUp: { width: "100%", height: 13 },
  glowDown: { width: "100%", height: 13 },
  scanCore: { width: "100%", height: 1, backgroundColor: DARK_RED },

  fixedBorder: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    borderWidth: 2,
    borderColor: BRIGHT_RED,
    borderRadius: 8,
  },

  bottomArea: { position: "absolute", bottom: 48, left: 0, right: 0, alignItems: "center", paddingHorizontal: 24 },
  percentRow: { flexDirection: "row", alignItems: "flex-end" },
  loadingLabel: {
    fontSize: 11,
    fontWeight: "600",
    letterSpacing: 2,
    color: "#8A7F74",
    marginRight: 10,
    marginBottom: 6,
    textTransform: "uppercase",
  },
  percent: { fontSize: 40, fontWeight: "700", letterSpacing: -1, color: BRIGHT_RED },
  percentSign: { fontSize: 16, fontWeight: "500", color: "#8A7F74", marginLeft: 2, marginBottom: 6 },
  caption: { marginTop: 6, fontSize: 13, color: "#8A7F74", textAlign: "center" },
  hint: { marginTop: 4, fontSize: 11, color: "#8A7F74", textAlign: "center" },
});