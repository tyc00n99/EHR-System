import type { CapacitorConfig } from "@capacitor/cli";

/**
 * EVVora caregiver app: a native shell that carries the hosted web app, so the store download
 * and the website are always the same product. Point `server.url` at a staging deploy to test.
 */
const config: CapacitorConfig = {
  appId: "com.evvora.caregiver",
  appName: "EVVora",
  webDir: "www",
  server: {
    url: "https://ehr-system-eight.vercel.app",
    cleartext: false,
  },
  ios: {
    contentInset: "always",
  },
};

export default config;
