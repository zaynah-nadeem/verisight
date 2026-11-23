import AsyncStorage from "@react-native-async-storage/async-storage";

const KEY = "deepfake_onboarding_seen_v6";

export async function hasSeenOnboarding() {
  try {
    return (await AsyncStorage.getItem(KEY)) === "1";
  } catch (e) {
    return true; // if storage fails, don't nag the user
  }
}

export async function markOnboardingSeen() {
  try {
    await AsyncStorage.setItem(KEY, "1");
  } catch (e) {}
}