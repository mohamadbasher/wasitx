import type { ExpoConfig } from "expo/config";

const brand = process.env.EXPO_PUBLIC_BRAND_NAME ?? "WASIT X";

/**
 * Store builds must be produced by the licensed legal entity's developer accounts (see
 * docs/STORE-SUBMISSION.md). Bundle identifiers below are placeholders until that entity exists.
 */
const config: ExpoConfig = {
  name: brand,
  slug: "wasitx",
  scheme: "wasitx",
  version: "0.1.0",
  orientation: "portrait",
  icon: "./assets/icon.png",
  userInterfaceStyle: "automatic",
  backgroundColor: "#060A13",
  ios: {
    supportsTablet: true,
    bundleIdentifier: process.env.IOS_BUNDLE_ID ?? "com.example.wasitx",
    config: { usesNonExemptEncryption: false },
    infoPlist: { NSFaceIDUsageDescription: "Unlock your account securely." },
    privacyManifests: {
      NSPrivacyAccessedAPITypes: [
        { NSPrivacyAccessedAPIType: "NSPrivacyAccessedAPICategoryUserDefaults", NSPrivacyAccessedAPITypeReasons: ["CA92.1"] },
      ],
    },
  },
  android: {
    package: process.env.ANDROID_PACKAGE ?? "com.example.wasitx",
    adaptiveIcon: {
      backgroundColor: "#060A13",
      foregroundImage: "./assets/android-icon-foreground.png",
      backgroundImage: "./assets/android-icon-background.png",
      monochromeImage: "./assets/android-icon-monochrome.png",
    },
    blockedPermissions: ["android.permission.READ_PHONE_STATE", "android.permission.SYSTEM_ALERT_WINDOW"],
    predictiveBackGestureEnabled: false,
  },
  web: { favicon: "./assets/favicon.png" },
  plugins: ["expo-router", "expo-status-bar", "expo-secure-store", "expo-localization", ["expo-notifications", { color: "#10B981" }], ["expo-splash-screen", { image: "./assets/splash-icon.png", imageWidth: 160, resizeMode: "contain", backgroundColor: "#060A13" }]],
  experiments: { typedRoutes: true },
  extra: {
    apiUrl: process.env.EXPO_PUBLIC_API_URL ?? "http://localhost:4000/api/v1",
    eas: { projectId: process.env.EAS_PROJECT_ID },
  },
};

export default config;
