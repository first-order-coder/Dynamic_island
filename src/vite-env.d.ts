/// <reference types="vite/client" />

interface ElectronAPI {
    resizeWindow: (width: number, height: number) => Promise<void>;
    moveWindow: (deltaX: number, deltaY: number) => Promise<void>;
    setIgnoreMouseEvents: (ignore: boolean, options?: { forward?: boolean }) => Promise<void>;
    setAlwaysOnTop: (alwaysOnTop: boolean) => Promise<void>;
    focusWindow: () => Promise<void>;
    onWindowBlur: (cb: () => void) => void;
    onWindowFocus: (cb: () => void) => void;
    overlaySetMode: (expanded: boolean, pinned: boolean) => Promise<void>;
    overlaySetInteractiveRect: (rect: { x: number; y: number; width: number; height: number }) => Promise<void>;
}

interface Window {
    electron?: ElectronAPI;
}
