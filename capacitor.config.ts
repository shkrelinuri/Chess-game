import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.endgame.chess",
  appName: "Endgame Chess",
  webDir: "out",
  plugins: {
    FirebaseAuthentication: {
      providers: ["google.com", "facebook.com"],
    },
  },
};

export default config;