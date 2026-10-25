/**
 * Design tokens — single source for web (CSS variables in styles.css) and mobile (React Native).
 * Contrast: text/muted on bg/surface meet WCAG 2.2 AA (≥ 4.5:1) in both themes; accent text uses
 * accentStrong on light backgrounds.
 */
export const palette = {
  dark: {
    bg: "#060A13",
    surface: "#0B1220",
    surface2: "#111A2E",
    surface3: "#18233B",
    border: "#1F2B45",
    borderStrong: "#2C3B5C",
    text: "#E8EEF8",
    muted: "#93A3BF",
    subtle: "#64748F",
    accent: "#10B981",
    accentStrong: "#34D399",
    accent2: "#2DD4BF",
    accentFg: "#04130D",
    success: "#22C55E",
    warning: "#F59E0B",
    danger: "#F43F5E",
    info: "#38BDF8",
    overlay: "rgba(3,6,12,0.72)",
  },
  light: {
    bg: "#F5F7FB",
    surface: "#FFFFFF",
    surface2: "#F0F3F9",
    surface3: "#E7ECF5",
    border: "#DCE3EE",
    borderStrong: "#C3CEDF",
    text: "#0A1120",
    muted: "#4C5B75",
    subtle: "#6B7A93",
    accent: "#059669",
    accentStrong: "#047857",
    accent2: "#0D9488",
    accentFg: "#FFFFFF",
    success: "#15803D",
    warning: "#B45309",
    danger: "#BE123C",
    info: "#0369A1",
    overlay: "rgba(10,17,32,0.45)",
  },
} as const;

export const radius = { sm: 8, md: 12, lg: 16, xl: 22, full: 999 } as const;
export const space = { 1: 4, 2: 8, 3: 12, 4: 16, 5: 20, 6: 24, 8: 32, 10: 40, 12: 48 } as const;
export const fontSize = { xs: 12, sm: 14, md: 16, lg: 18, xl: 22, "2xl": 28, "3xl": 36, "4xl": 48 } as const;

export type ThemeName = keyof typeof palette;
export type Palette = (typeof palette)[ThemeName];
