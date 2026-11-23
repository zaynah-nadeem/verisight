import React, { useEffect, useRef, useState } from "react";
import { View, Animated, Easing, StyleSheet, useWindowDimensions } from "react-native";

// Colours taken from the app icon
const BG = "#241711";
const SEAM = "#6B4A36";

const BLADES = 6;
const ICON_SIZE = 120;

const MIN_SHOW_MS = 2500; // the icon is always shown at least this long
const MAX_WAIT_MS = 8000; // never wait longer than this for the app

const ICON = require("../../assets/splash-small.png");

// Shows the app icon, then the camera shutter blades open to reveal the app.
// ready = the first real screen of the app is waiting underneath.
export default function ShutterSplash({ ready, onFinish }) {
  const { width: W, height: H } = useWindowDimensions();
  const CX = W / 2; // the exact middle of the screen
  const CY = H / 2;
  const BIG = Math.max(W, H) * 2;
  // how far the blades must move so the opening is bigger than the whole screen
  const OPEN_TO = Math.hypot(W, H) / 2 + 60;

  const [minElapsed, setMinElapsed] = useState(false);
  const [timedOut, setTimedOut] = useState(false);
  const startedRef = useRef(false);

  const iconIn = useRef(new Animated.Value(0)).current; // icon fades in
  const iconOut = useRef(new Animated.Value(0)).current; // icon grows and fades away
  const open = useRef(new Animated.Value(0)).current; // 0 = shutter closed, 1 = fully open

  useEffect(() => {
    Animated.timing(iconIn, {
      toValue: 1,
      duration: 180,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
    const t1 = setTimeout(() => setMinElapsed(true), MIN_SHOW_MS);
    const t2 = setTimeout(() => setTimedOut(true), MAX_WAIT_MS);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, []);

  useEffect(() => {
    if (startedRef.current) return;
    if (!((ready && minElapsed) || timedOut)) return;
    startedRef.current = true;

    Animated.parallel([
      Animated.timing(iconOut, {
        toValue: 1,
        duration: 380,
        easing: Easing.in(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(open, {
        toValue: 1,
        duration: 950,
        delay: 180,
        easing: Easing.bezier(0.65, 0, 0.35, 1),
        useNativeDriver: true,
      }),
    ]).start(() => onFinish && onFinish());
  }, [ready, minElapsed, timedOut]);

  const bladeShift = open.interpolate({ inputRange: [0, 1], outputRange: [0, OPEN_TO] });
  const twist = open.interpolate({ inputRange: [0, 1], outputRange: ["0deg", "50deg"] });
  // the seam lines fade away while the shutter opens
  const seamOpacity = open.interpolate({
    inputRange: [0, 0.55],
    outputRange: [1, 0],
    extrapolate: "clamp",
  });
  const iconScale = Animated.multiply(
    iconIn.interpolate({ inputRange: [0, 1], outputRange: [0.9, 1] }),
    iconOut.interpolate({ inputRange: [0, 1], outputRange: [1, 1.35] })
  );
  const iconOpacity = Animated.multiply(
    iconIn,
    iconOut.interpolate({ inputRange: [0, 1], outputRange: [1, 0] })
  );

  return (
    <View style={[styles.overlay, { width: W, height: H }]} pointerEvents="auto">
      <Animated.View style={{ position: "absolute", left: 0, top: 0, width: W, height: H, transform: [{ rotate: twist }] }}>
        {/* the shutter blades: six big flat plates that slide away from the middle */}
        {Array.from({ length: BLADES }, (_, i) => (
          <View
            key={"b" + i}
            style={{
              position: "absolute",
              left: CX,
              top: CY,
              width: 0,
              height: 0,
              transform: [{ rotate: `${(360 / BLADES) * i}deg` }],
            }}
          >
            <Animated.View
              style={{
                position: "absolute",
                left: 0,
                top: -BIG / 2,
                width: BIG,
                height: BIG,
                backgroundColor: BG,
                transform: [{ translateX: bladeShift }],
              }}
            />
          </View>
        ))}

        {/* the seam lines: drawn in their own layer ON TOP of all blades,
            so all six always show */}
        {Array.from({ length: BLADES }, (_, i) => (
          <View
            key={"s" + i}
            pointerEvents="none"
            style={{
              position: "absolute",
              left: CX,
              top: CY,
              width: 0,
              height: 0,
              transform: [{ rotate: `${(360 / BLADES) * i}deg` }],
            }}
          >
            <Animated.View
              style={{
                position: "absolute",
                left: -1,
                top: -BIG / 2,
                width: 2,
                height: BIG / 2,
                backgroundColor: SEAM,
                opacity: seamOpacity,
                transform: [{ translateX: bladeShift }],
              }}
            />
          </View>
        ))}
      </Animated.View>

      {/* the icon, in the exact middle */}
      <Animated.Image
        source={ICON}
        resizeMode="contain"
        pointerEvents="none"
        onLoad={() => console.log("[splash] icon loaded")}
        onError={(e) => console.log("[splash] icon FAILED to load", e?.nativeEvent)}
        style={{
          position: "absolute",
          left: CX - ICON_SIZE / 2,
          top: CY - ICON_SIZE / 2,
          width: ICON_SIZE,
          height: ICON_SIZE,
          opacity: iconOpacity,
          transform: [{ scale: iconScale }],
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: { position: "absolute", left: 0, top: 0, zIndex: 999, elevation: 999 },
});