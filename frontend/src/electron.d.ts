export {};

interface Credentials {
  email: string;
  password: string;
  remember: boolean;
}

declare global {
  interface Window {
    electronAPI?: {
      getStoragePath: () => Promise<string>;
      getAppVersion: () => Promise<string>;
      isDev: () => Promise<boolean>;
      platform: string;
      isElectron: boolean;
      credentials: {
        get: () => Promise<Credentials>;
        set: (credentials: Credentials) => Promise<{ success: boolean }>;
        clear: () => Promise<{ success: boolean }>;
        has: () => Promise<boolean>;
      };
    };
  }
}
