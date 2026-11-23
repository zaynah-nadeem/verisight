import React, { useRef, useState } from "react";
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  FlatList,
  Platform,
  StatusBar,
  useWindowDimensions,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useAppTheme } from "../context/ThemeContext";

const STEPS = [
  {
    icon: "arrow-up-circle-outline",
    title: "Pick a file or use the camera",
    body: "Choose an image or video from your phone or capture one live. Choose from Files to send the original untouched.",
  },
  {
    icon: "analytics-outline",
    title: "Read the result",
    body: "You get a likelihood range and the reasons behind it. It is an estimate, not proof.",
  },
  {
    icon: "ribbon-outline",
    title: "Check the credentials",
    body: "If a file carries content credentials, we verify them.",
  },
];

const TOP_PADDING = Platform.OS === "ios" ? 60 : (StatusBar.currentHeight || 24) + 16;

export default function HowItWorksModal({ visible, onClose }) {
  const { colors } = useAppTheme();
  const { width } = useWindowDimensions();
  const listRef = useRef(null);
  const [index, setIndex] = useState(0);
  const isLast = index === STEPS.length - 1;

  const close = () => {
    setIndex(0);
    onClose();
  };

  const goNext = () => {
    if (isLast) {
      close();
      return;
    }
    const next = index + 1;
    listRef.current?.scrollToOffset({ offset: next * width, animated: true });
    setIndex(next);
  };

  const onScrollEnd = (e) => {
    const i = Math.round(e.nativeEvent.contentOffset.x / width);
    if (i >= 0 && i < STEPS.length) setIndex(i);
  };

  const renderStep = ({ item, index: i }) => (
    <View style={[styles.page, { width }]}>
      <View style={[styles.ring, { borderColor: colors.border }]}>
        <View style={[styles.iconCircle, { backgroundColor: colors.accent }]}>
          <Ionicons name={item.icon} size={52} color="#FFFFFF" />
        </View>
      </View>
      <Text style={[styles.stepLabel, { color: colors.textSecondary }]}>
        STEP {i + 1} OF {STEPS.length}
      </Text>
      <Text style={[styles.title, { color: colors.textPrimary }]}>{item.title}</Text>
      <Text style={[styles.body, { color: colors.textSecondary }]}>{item.body}</Text>
    </View>
  );

  return (
    <Modal
      visible={visible}
      animationType="slide"
      statusBarTranslucent
      onRequestClose={close}
    >
      <View style={[styles.screen, { backgroundColor: colors.background, paddingTop: TOP_PADDING }]}>
        <View style={styles.topRow}>
          {!isLast ? (
            <TouchableOpacity onPress={close} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
              <Text style={[styles.skip, { color: colors.textSecondary }]}>Skip</Text>
            </TouchableOpacity>
          ) : (
            <View />
          )}
        </View>

        <FlatList
          ref={listRef}
          data={STEPS}
          keyExtractor={(item) => item.title}
          renderItem={renderStep}
          horizontal
          pagingEnabled
          bounces={false}
          showsHorizontalScrollIndicator={false}
          onMomentumScrollEnd={onScrollEnd}
          getItemLayout={(_, i) => ({ length: width, offset: width * i, index: i })}
          style={styles.list}
        />

        <View style={styles.bottom}>
          <View style={styles.dots}>
            {STEPS.map((_, i) => (
              <View
                key={i}
                style={[
                  styles.dot,
                  i === index
                    ? { width: 24, backgroundColor: colors.accent }
                    : { width: 8, backgroundColor: colors.border },
                ]}
              />
            ))}
          </View>

          <TouchableOpacity
            style={[styles.button, { backgroundColor: colors.accent }]}
            onPress={goNext}
          >
            <Text style={styles.buttonText}>{isLast ? "Get started" : "Next"}</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  topRow: {
    height: 32,
    paddingHorizontal: 24,
    flexDirection: "row",
    justifyContent: "flex-end",
    alignItems: "center",
  },
  skip: { fontSize: 15, fontWeight: "700" },
  list: { flex: 1 },
  page: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 32,
  },
  ring: {
    width: 190,
    height: 190,
    borderRadius: 95,
    borderWidth: 2,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 40,
  },
  iconCircle: {
    width: 128,
    height: 128,
    borderRadius: 64,
    alignItems: "center",
    justifyContent: "center",
  },
  stepLabel: { fontSize: 11, fontWeight: "700", letterSpacing: 1.4, marginBottom: 12 },
  title: { fontSize: 28, fontWeight: "800", textAlign: "center", letterSpacing: -0.4, marginBottom: 14 },
  body: { fontSize: 16, lineHeight: 24, textAlign: "center" },
  bottom: {
    paddingHorizontal: 24,
    paddingBottom: Platform.OS === "ios" ? 44 : 32,
    alignItems: "center",
  },
  dots: { flexDirection: "row", gap: 6, marginBottom: 24, alignItems: "center" },
  dot: { height: 8, borderRadius: 4 },
  button: { width: "100%", paddingVertical: 16, borderRadius: 30, alignItems: "center" },
  buttonText: { color: "#FFFFFF", fontWeight: "700", fontSize: 15 },
});