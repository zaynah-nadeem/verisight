export const dark = {
  background: "#0F0B09",
  card: "#1A1411",
  border: "#2A211C",
  textPrimary: "#F5EFE8",
  textSecondary: "#B8A99C",
  accent: "#E07A54",
  accentDark: "#8A3D28",
  success: "#6FA98A",
  warning: "#D9A441",
  danger: "#D9534F",
};

export const light = {
  background: "#F0E6D6",
  card: "#FAF5EC",
  border: "#E3D4BE",
  textPrimary: "#2B1B12",
  textSecondary: "#7A6A5A",
  accent: "#7F2D2D",
  accentDark: "#4A1A1A",
  success: "#3F7A57",
  warning: "#966A1E",
  danger: "#B03A2E",
};

export const getTheme = (mode) => (mode === "dark" ? dark : light);