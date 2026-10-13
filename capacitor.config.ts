import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.freekickmaster.game',
  appName: 'Free Kick Master',
  webDir: 'dist',
  backgroundColor: '#101713',
  android: {
    backgroundColor: '#101713',
    allowMixedContent: false,
    captureInput: true,
    webContentsDebuggingEnabled: false,
  },
};

export default config;
