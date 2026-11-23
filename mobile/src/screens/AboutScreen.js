import React from "react";
import { View, Text, StyleSheet, ScrollView } from "react-native";
import { useAppTheme } from "../context/ThemeContext";
import TopBar from "../components/TopBar";

const SECTIONS = [
  {
    title: "What Verisight does",
    body: "Verisight gives you a second opinion on an image or video. It estimates how likely the file is to be AI-generated or manipulated, and it checks whether the file carries content credentials.",
  },
  {
    title: "How to read a result",
    body: "The likelihood is shown as a range, not a single number, because the estimate has some uncertainty. A result is a probability estimate. It is not proof that a file is real or fake.",
  },
  {
    title: "Content credentials",
    body: "Some cameras and editing tools attach a signed record of how a file was made. When it is there and verifies, it is strong evidence of where the file came from. When it is missing, that tells you nothing either way: most files don't have it, and re-saving or compressing a file can remove it. Choosing a file from Files keeps the original and its credentials.",
  },
  {
    title: "Ways to check an image",
    body: "You can choose a file from your phone, take a live photo, or paste the link of an image. For a link, our server downloads the picture and checks it like any other file. Only links that lead straight to a public picture work. After a check, \"Search on Google Lens\" can help you find where else a picture appears online.",
  },
  {
    title: "Limits to keep in mind",
    body: "No detector is always right. Heavily compressed, very small or low-quality files are harder to judge, and new generation methods can fool older detectors. For anything important, check the source and look for other confirmation.",
  },
  {
    title: "Your files and your account",
    body: "Files you check are sent to the Verisight server for analysis. As a guest, nothing is kept on the server and your history stays on this phone only; you can clear it in Settings. If you sign in, each file you check and its result are saved in your account so your history follows you. You can delete single scans, clear your history, or delete your whole account in Settings, which removes everything we saved. If you use Google Lens, the picture or its link is handled by Google, under Google's own rules.",
  },
];

export default function AboutScreen({ onBack }) {
  const { colors } = useAppTheme();

  return (
    <ScrollView contentContainerStyle={[styles.container, { backgroundColor: colors.background }]}>
      <TopBar onBack={onBack} />

      <Text style={[styles.title, { color: colors.textPrimary }]}>About Verisight</Text>

      {SECTIONS.map((section) => (
        <View key={section.title} style={styles.section}>
          <Text style={[styles.heading, { color: colors.textPrimary }]}>{section.title}</Text>
          <Text style={[styles.body, { color: colors.textSecondary }]}>{section.body}</Text>
        </View>
      ))}

      <Text style={[styles.version, { color: colors.textSecondary }]}>Version 0.1 (prototype)</Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flexGrow: 1, paddingHorizontal: 24, paddingBottom: 50 },
  title: { fontSize: 26, fontWeight: "800", marginTop: 12, marginBottom: 20, letterSpacing: -0.3 },
  section: { marginBottom: 22 },
  heading: { fontSize: 16, fontWeight: "700", marginBottom: 6 },
  body: { fontSize: 14, lineHeight: 21 },
  version: { fontSize: 12, marginTop: 6 },
});