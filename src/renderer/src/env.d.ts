export {};

declare global {
  interface Window {
    rasterterm: {
      getStartupInfo: () => Promise<{
        path: string;
        startedAt: number;
      }>;
    };
  }
}
