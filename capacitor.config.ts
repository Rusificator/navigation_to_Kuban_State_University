import type { CapacitorConfig } from "@capacitor/cli";
const config: CapacitorConfig = {
  appId: "org.kubsu.navigator.next",
  appName: "КубГУ Навигатор",
  webDir: "dist",
  backgroundColor: "#f4f7f4",
  android: { allowMixedContent: false },
  ios: { contentInset: "never" },
};
export default config;
