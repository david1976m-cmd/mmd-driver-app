export const palette = {
primary: "#3b82f6",
primaryDeep: "#2563eb",
success: "#059669",
accent: "#f59e0b",
accentDeep: "#d97f06",
blue: "#3b82f6",
successLight: "#10b981",
gray: "#6b7280",
background: "#f8fafc",
surface: "#ffffff",
white: "#ffffff",
text: "#1f2937",
textMuted: "#9ca3af",
border: "#e2e8f0",
borderSoft: "#eef2f7",
card: "#ffffff",
danger: "#dc2626",
dangerSoft: "#fef2f2",
} as const;

export default {
light: {
  text: palette.text,
  background: palette.background,
  tint: palette.primary,
  tabIconDefault: palette.gray,
  tabIconSelected: palette.primary,
},
};

export const ink = palette.primary;
export const emerald = palette.success;
export const gold = palette.accent;