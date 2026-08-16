export {};

declare global {
  interface Window {
    gitTube?: {
      platform: string;
      saveDownload: (payload: {
        path: string;
        filename?: string;
      }) => Promise<{ saved: boolean; canceled?: boolean; path?: string; error?: string }>;
    };
  }
}
