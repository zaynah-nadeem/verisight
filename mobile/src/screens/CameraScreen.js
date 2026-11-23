import React, { useEffect, useRef, useState } from "react";
import { View, Text, TouchableOpacity, StyleSheet, Alert } from "react-native";
import { CameraView, useCameraPermissions, useMicrophonePermissions } from "expo-camera";
import { Ionicons } from "@expo/vector-icons";
import { useAppTheme } from "../context/ThemeContext";

// Videos are limited so the check stays reasonably quick on the laptop
const MAX_SECONDS = 10;

function clock(seconds) {
  const s = Math.floor(seconds);
  return `0:${String(s).padStart(2, "0")}`;
}

// Turns the recorded video into the same kind of "file" the rest of the app already scans
function videoFile(uri) {
  const ext = (uri.split("?")[0].split(".").pop() || "mov").toLowerCase();
  return {
    uri,
    fileName: `recording-${Date.now()}.${ext}`,
    mimeType: ext === "mp4" ? "video/mp4" : "video/quicktime",
    type: "video",
    source: "camera",
  };
}

export default function CameraScreen({ onCapture, onBack }) {
  const { colors } = useAppTheme();
  const [permission, requestPermission] = useCameraPermissions();
  const [micPermission, requestMicPermission] = useMicrophonePermissions();
  const [facing, setFacing] = useState("back");
  const [flash, setFlash] = useState("off");
  const [mode, setMode] = useState("picture"); // "picture" | "video"
  const [recording, setRecording] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const cameraRef = useRef(null);
  const timerRef = useRef(null);
  const startedAtRef = useRef(0);
  const discardRef = useRef(false);

  // leaving the screen while recording throws the recording away
  useEffect(
    () => () => {
      clearInterval(timerRef.current);
      discardRef.current = true;
      try {
        cameraRef.current?.stopRecording();
      } catch (e) {
        // nothing was recording
      }
    },
    []
  );

  if (!permission) {
    return <View style={[styles.container, { backgroundColor: colors.background }]} />;
  }

  if (!permission.granted) {
    return (
      <View style={[styles.permissionContainer, { backgroundColor: colors.background }]}>
        <Ionicons name="camera-outline" size={32} color={colors.textSecondary} />
        <Text style={[styles.permissionTitle, { color: colors.textPrimary }]}>
          Camera access needed
        </Text>
        <Text style={[styles.permissionSubtitle, { color: colors.textSecondary }]}>
          Verisight needs your camera to capture a photo or a short video to check.
        </Text>
        <TouchableOpacity
          style={[styles.permissionButton, { backgroundColor: colors.accent }]}
          onPress={requestPermission}
        >
          <Text style={styles.permissionButtonText}>Allow camera access</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={onBack}>
          <Text style={[styles.cancelLink, { color: colors.textSecondary }]}>Cancel</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const stopTimer = () => {
    clearInterval(timerRef.current);
    timerRef.current = null;
  };

  const handleBack = () => {
    if (recording) {
      discardRef.current = true;
      try {
        cameraRef.current?.stopRecording();
      } catch (e) {
        // already stopped
      }
    }
    onBack();
  };

  const switchMode = async (next) => {
    if (recording || next === mode) return;
    setMode(next);
    // sound is optional: without the microphone permission the video is recorded without sound
    if (next === "video" && !micPermission?.granted && micPermission?.canAskAgain !== false) {
      try {
        await requestMicPermission();
      } catch (e) {
        // recording without sound still works
      }
    }
  };

  const handleCapture = async () => {
    if (!cameraRef.current) return;
    const photo = await cameraRef.current.takePictureAsync({ quality: 1 });
    onCapture(photo);
  };

  const startRecording = async () => {
    if (!cameraRef.current || recording) return;
    discardRef.current = false;
    setElapsed(0);
    setRecording(true);
    startedAtRef.current = Date.now();
    timerRef.current = setInterval(() => {
      setElapsed(Math.min(MAX_SECONDS, (Date.now() - startedAtRef.current) / 1000));
    }, 200);

    try {
      // resolves when stopRecording() is called or MAX_SECONDS has passed
      const video = await cameraRef.current.recordAsync({ maxDuration: MAX_SECONDS });
      stopTimer();
      setRecording(false);
      if (!discardRef.current && video?.uri) onCapture(videoFile(video.uri));
    } catch (e) {
      stopTimer();
      setRecording(false);
      if (!discardRef.current) {
        Alert.alert("Couldn't record", "The video was too short or the camera stopped. Please try again.");
      }
    }
  };

  const stopRecording = () => {
    try {
      cameraRef.current?.stopRecording();
    } catch (e) {
      // already stopped
    }
  };

  const onShutter = () => {
    if (mode === "picture") handleCapture();
    else if (recording) stopRecording();
    else startRecording();
  };

  const videoMode = mode === "video";

  return (
    <View style={styles.container}>
      <CameraView
        ref={cameraRef}
        style={StyleSheet.absoluteFill}
        facing={facing}
        mode={mode}
        flash={videoMode ? "off" : flash}
        enableTorch={videoMode && flash === "on"}
        videoQuality="720p"
        mute={!micPermission?.granted}
      />

      <View style={styles.topRow}>
        <TouchableOpacity style={styles.iconButton} onPress={handleBack}>
          <Ionicons name="arrow-back" size={22} color="#FFFFFF" />
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.iconButton}
          onPress={() => setFlash((f) => (f === "off" ? "on" : "off"))}
        >
          <Ionicons name={flash === "off" ? "flash-off" : "flash"} size={22} color="#FFFFFF" />
        </TouchableOpacity>
      </View>

      {recording ? (
        <View style={styles.timerWrap} pointerEvents="none">
          <View style={styles.timerPill}>
            <View style={[styles.recDot, { backgroundColor: colors.danger }]} />
            <Text style={styles.timerText}>
              {clock(elapsed)} / {clock(MAX_SECONDS)}
            </Text>
          </View>
        </View>
      ) : null}

      <View style={styles.frameGuide} pointerEvents="none">
        <View style={[styles.corner, styles.cornerTL, { borderColor: colors.accent }]} />
        <View style={[styles.corner, styles.cornerTR, { borderColor: colors.accent }]} />
        <View style={[styles.corner, styles.cornerBL, { borderColor: colors.accent }]} />
        <View style={[styles.corner, styles.cornerBR, { borderColor: colors.accent }]} />
      </View>

      {!recording ? (
        <View style={styles.modeWrap}>
          <View style={styles.modeSwitch}>
            {[
              { key: "picture", label: "Photo", icon: "camera-outline" },
              { key: "video", label: "Video", icon: "videocam-outline" },
            ].map((m) => {
              const active = mode === m.key;
              return (
                <TouchableOpacity
                  key={m.key}
                  style={[styles.modeButton, active && { backgroundColor: colors.accent }]}
                  onPress={() => switchMode(m.key)}
                >
                  <Ionicons name={m.icon} size={15} color={active ? "#FFFFFF" : "rgba(255,255,255,0.75)"} />
                  <Text style={[styles.modeText, { color: active ? "#FFFFFF" : "rgba(255,255,255,0.75)" }]}>
                    {m.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
          {videoMode ? <Text style={styles.modeHint}>Up to {MAX_SECONDS} seconds</Text> : null}
        </View>
      ) : null}

      <View style={styles.bottomRow}>
        <View style={{ width: 48 }} />
        <TouchableOpacity style={styles.captureOuter} onPress={onShutter} activeOpacity={0.8}>
          {videoMode ? (
            recording ? (
              <View style={[styles.stopSquare, { backgroundColor: colors.danger }]} />
            ) : (
              <View style={[styles.captureInner, { backgroundColor: colors.danger }]} />
            )
          ) : (
            <View style={[styles.captureInner, { backgroundColor: colors.accent }]} />
          )}
        </TouchableOpacity>
        {recording ? (
          <View style={{ width: 48 }} />
        ) : (
          <TouchableOpacity
            style={styles.iconButton}
            onPress={() => setFacing((f) => (f === "back" ? "front" : "back"))}
          >
            <Ionicons name="camera-reverse-outline" size={24} color="#FFFFFF" />
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#000" },
  topRow: {
    position: "absolute",
    top: 50,
    left: 20,
    right: 20,
    flexDirection: "row",
    justifyContent: "space-between",
  },
  iconButton: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: "rgba(0,0,0,0.4)",
    alignItems: "center",
    justifyContent: "center",
  },
  timerWrap: { position: "absolute", top: 56, left: 0, right: 0, alignItems: "center" },
  timerPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "rgba(0,0,0,0.55)",
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 18,
  },
  recDot: { width: 10, height: 10, borderRadius: 5 },
  timerText: { color: "#FFFFFF", fontSize: 14, fontWeight: "800", letterSpacing: 0.5 },
  frameGuide: {
    position: "absolute",
    top: "28%",
    left: "12%",
    right: "12%",
    bottom: "28%",
  },
  corner: { position: "absolute", width: 28, height: 28, borderWidth: 3 },
  cornerTL: { top: 0, left: 0, borderRightWidth: 0, borderBottomWidth: 0 },
  cornerTR: { top: 0, right: 0, borderLeftWidth: 0, borderBottomWidth: 0 },
  cornerBL: { bottom: 0, left: 0, borderRightWidth: 0, borderTopWidth: 0 },
  cornerBR: { bottom: 0, right: 0, borderLeftWidth: 0, borderTopWidth: 0 },
  modeWrap: { position: "absolute", bottom: 150, left: 0, right: 0, alignItems: "center", gap: 8 },
  modeSwitch: {
    flexDirection: "row",
    backgroundColor: "rgba(0,0,0,0.5)",
    borderRadius: 22,
    padding: 4,
    gap: 4,
  },
  modeButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 18,
  },
  modeText: { fontSize: 13, fontWeight: "800" },
  modeHint: {
    color: "#FFFFFF",
    fontSize: 12,
    fontWeight: "600",
    backgroundColor: "rgba(0,0,0,0.45)",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 10,
    overflow: "hidden",
  },
  bottomRow: {
    position: "absolute",
    bottom: 50,
    left: 30,
    right: 30,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  captureOuter: {
    width: 76,
    height: 76,
    borderRadius: 38,
    borderWidth: 4,
    borderColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
  },
  captureInner: { width: 60, height: 60, borderRadius: 30 },
  stopSquare: { width: 30, height: 30, borderRadius: 8 },
  permissionContainer: { flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 32 },
  permissionTitle: { fontSize: 18, fontWeight: "700", marginTop: 14, marginBottom: 6 },
  permissionSubtitle: { fontSize: 13, textAlign: "center", lineHeight: 19, marginBottom: 24 },
  permissionButton: { paddingHorizontal: 24, paddingVertical: 14, borderRadius: 10, marginBottom: 14 },
  permissionButtonText: { color: "#FFFFFF", fontWeight: "700", fontSize: 14 },
  cancelLink: { fontSize: 13 },
});