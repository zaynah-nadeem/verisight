import { Alert } from "react-native";
import * as ImagePicker from "expo-image-picker";
import * as DocumentPicker from "expo-document-picker";

async function pickFromLibrary(videoQuality) {
  const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!permission.granted) {
    Alert.alert("Permission needed", "Allow access to your photos in Settings to choose a file.");
    return null;
  }
  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ["images", "videos"],
    quality: 1,
    videoExportPreset:
      videoQuality === "full"
        ? ImagePicker.VideoExportPreset.Passthrough
        : ImagePicker.VideoExportPreset.H264_960x540,
  });
  if (result.canceled) return null;
  // remember where the file came from, so the result screen can explain a missing credential
  return { ...result.assets[0], source: "photos" };
}

async function pickFromFiles() {
  const result = await DocumentPicker.getDocumentAsync({
    type: ["image/*", "video/*"],
    copyToCacheDirectory: true,
  });
  if (result.canceled) return null;

  const asset = result.assets[0];
  const mime = asset.mimeType || "";
  const isVideo = mime.startsWith("video/") || /\.(mp4|mov|m4v)$/i.test(asset.name || "");

  return {
    uri: asset.uri,
    fileName: asset.name,
    mimeType: mime || undefined,
    fileSize: asset.size,
    type: isVideo ? "video" : "image",
    source: "files",
  };
}

export function chooseFile(onPicked, videoQuality = "quick") {
  Alert.alert(
    "Choose a file",
    "Files sends the original, so content credentials are kept. Photo library is quicker for videos.",
    [
      {
        text: "Files (original)",
        onPress: async () => {
          const file = await pickFromFiles();
          if (file) onPicked(file);
        },
      },
      {
        text: "Photo library",
        onPress: async () => {
          const file = await pickFromLibrary(videoQuality);
          if (file) onPicked(file);
        },
      },
      { text: "Cancel", style: "cancel" },
    ]
  );
}