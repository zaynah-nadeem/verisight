import React, { useEffect, useRef } from "react";
import { Pressable, Animated, StyleSheet, Text, Easing } from "react-native";
import { useAppTheme } from "../context/ThemeContext";

const PILL_WIDTH = 76;
const PILL_HEIGHT = 36;
const KNOB_SIZE = 28;
const INSET = 3;
const TRAVEL = PILL_WIDTH - KNOB_SIZE - INSET * 2;
const bounceEasing = Easing.bezier(0.34, 1.56, 0.64, 1);

export default function ThemeToggle() {
  const { mode, colors, toggleTheme } = useAppTheme();
  const anim = useRef(new Animated.Value(mode === "dark" ? 1 : 0)).current;

  useEffect(() => {
    Animated.timing(anim, { toValue: mode === "dark" ? 1 : 0, duration: 300, easing: bounceEasing, useNativeDriver: false }).start();
  }, [mode]);

  const translateX = anim.interpolate({ inputRange: [0, 1], outputRange: [0, TRAVEL] });
  const knobColor = mode === "dark" ? "#1A0D06" : colors.accent;

  return (
    <Pressable onPress={toggleTheme}>
      <Animated.View style={[styles.pill, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}>
        <Animated.View style={[styles.knob, { backgroundColor: knobColor, transform: [{ translateX }] }]}>
          <Text style={styles.knobIcon}>{mode === "dark" ? "🌙" : "☀️"}</Text>
        </Animated.View>
      </Animated.View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  pill: { width: PILL_WIDTH, height: PILL_HEIGHT, borderRadius: PILL_HEIGHT / 2, borderWidth: 0.5, justifyContent: "center" },
  knob: { width: KNOB_SIZE, height: KNOB_SIZE, borderRadius: KNOB_SIZE / 2, marginLeft: INSET, alignItems: "center", justifyContent: "center" },
  knobIcon: { fontSize: 14 },
});