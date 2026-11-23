import React, { useEffect, useRef, useState } from "react";
import {
  Animated,
  Easing,
  LayoutAnimation,
  Platform,
  RefreshControl,
  ScrollView,
  StyleSheet,
  View,
} from "react-native";
import * as Haptics from "expo-haptics";
import { Ionicons } from "@expo/vector-icons";
import { useAppTheme } from "../context/ThemeContext";

const THRESHOLD = 80; // how far (in points) the user must pull before it refreshes
const SPACER = 60; // room made for the badge while refreshing
const MIN_MS = 800; // keep the badge visible at least this long so it can be seen

// A scroll view with pull-to-refresh. On iPhone it shows a Verisight shield badge that
// flips like a coin, below the Dynamic Island. On Android it uses the normal spinner.
export default function RefreshScroll({ onRefresh, contentContainerStyle, children }) {
  const { colors } = useAppTheme();
  const [refreshing, setRefreshing] = useState(false);
  const pull = useRef(new Animated.Value(0)).current;
  const spin = useRef(new Animated.Value(0)).current;
  const crossed = useRef(false);
  const busy = useRef(false);

  const run = async () => {
    if (busy.current) return;
    busy.current = true;
    try {
      LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    } catch (e) {}
    setRefreshing(true);
    const started = Date.now();
    try {
      await onRefresh();
    } catch (e) {
      // the screens show their own error state
    }
    const wait = MIN_MS - (Date.now() - started);
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    try {
      LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    } catch (e) {}
    setRefreshing(false);
    busy.current = false;
  };

  // Coin flip loop while refreshing
  useEffect(() => {
    if (!refreshing) return undefined;
    spin.setValue(0);
    const loop = Animated.loop(
      Animated.timing(spin, {
        toValue: 1,
        duration: 900,
        easing: Easing.inOut(Easing.ease),
        useNativeDriver: true,
      })
    );
    loop.start();
    return () => {
      loop.stop();
      spin.setValue(0);
    };
  }, [refreshing, spin]);

  const onScroll = (e) => {
    const p = Math.max(0, -e.nativeEvent.contentOffset.y);
    pull.setValue(p);
    if (refreshing) return;
    spin.setValue(Math.min(p / THRESHOLD, 1) * 0.5); // tilts as you pull
    if (p >= THRESHOLD && !crossed.current) {
      crossed.current = true;
      try {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      } catch (err) {}
    } else if (p < THRESHOLD * 0.5) {
      crossed.current = false;
    }
  };

  const onEndDrag = (e) => {
    if (e.nativeEvent.contentOffset.y <= -THRESHOLD && !refreshing) run();
  };

  // ---------- Android / other: normal spinner ----------
  if (Platform.OS !== "ios") {
    return (
      <ScrollView
        style={{ flex: 1, backgroundColor: colors.background }}
        contentContainerStyle={contentContainerStyle}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={run} tintColor={colors.accent} />}
      >
        {children}
      </ScrollView>
    );
  }

  // ---------- iPhone: our own badge ----------
  const rotateY = spin.interpolate({ inputRange: [0, 1], outputRange: ["0deg", "360deg"] });
  const indicatorStyle = refreshing
    ? { opacity: 1 }
    : {
        opacity: pull.interpolate({ inputRange: [30, 60], outputRange: [0, 1], extrapolate: "clamp" }),
        transform: [
          {
            scale: pull.interpolate({ inputRange: [0, THRESHOLD], outputRange: [0.6, 1], extrapolate: "clamp" }),
          },
        ],
      };

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <ScrollView
        style={{ flex: 1, backgroundColor: colors.background }}
        contentContainerStyle={contentContainerStyle}
        scrollEventThrottle={16}
        alwaysBounceVertical
        onScroll={onScroll}
        onScrollEndDrag={onEndDrag}
      >
        {refreshing ? <View style={{ height: SPACER }} /> : null}
        {children}
      </ScrollView>

      <Animated.View pointerEvents="none" style={[styles.indicator, indicatorStyle]}>
        <Animated.View
          style={[
            styles.coin,
            { backgroundColor: colors.accent, transform: [{ perspective: 600 }, { rotateY }] },
          ]}
        >
          <Ionicons name="shield-checkmark" size={20} color="#FFFFFF" />
        </Animated.View>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  indicator: { position: "absolute", top: 60, left: 0, right: 0, alignItems: "center" },
  coin: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center" },
});