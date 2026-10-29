// Bridge exposed by electron/preload.cjs. Absent when the app runs in a normal browser (npm run dev).
interface BlsDesktopBridge {
  version: () => Promise<string>;
  checkForUpdates: () => Promise<void>;
}
interface Window { blsDesktop?: BlsDesktopBridge }
