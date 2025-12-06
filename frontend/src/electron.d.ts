export {};

declare global {
  interface Window {
    electronAPI?: {
      getStoragePath: () => Promise<string>;
      getAppVersion: () => Promise<string>;
      isDev: () => Promise<boolean>;
      platform: string;
      isElectron: boolean;
    };
  }
}
