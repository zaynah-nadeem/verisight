import React, { useState } from "react";
import { View, TextInput, TouchableOpacity, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useAppTheme } from "../context/ThemeContext";

// A password box with an eye button that shows or hides what you typed
export default function PasswordInput({
  value,
  onChangeText,
  placeholder = "Password",
  editable = true,
  onSubmitEditing,
  withBorder = false,
}) {
  const { colors } = useAppTheme();
  const [visible, setVisible] = useState(false);

  return (
    <View
      style={[
        styles.box,
        { backgroundColor: colors.card },
        withBorder && { borderWidth: 1, borderColor: colors.border },
      ]}
    >
      <TextInput
        style={[styles.input, { color: colors.textPrimary }]}
        placeholder={placeholder}
        placeholderTextColor={colors.textSecondary}
        value={value}
        onChangeText={onChangeText}
        secureTextEntry={!visible}
        autoCapitalize="none"
        autoCorrect={false}
        editable={editable}
        onSubmitEditing={onSubmitEditing}
      />
      <TouchableOpacity
        onPress={() => setVisible((v) => !v)}
        hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
        accessibilityLabel={visible ? "Hide password" : "Show password"}
      >
        <Ionicons
          name={visible ? "eye-off-outline" : "eye-outline"}
          size={22}
          color={colors.textSecondary}
        />
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  box: {
    width: "100%",
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 10,
    paddingHorizontal: 16,
    marginBottom: 14,
  },
  input: { flex: 1, paddingVertical: 14, fontSize: 15 },
});