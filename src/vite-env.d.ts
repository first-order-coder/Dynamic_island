/// <reference types="vite/client" />

interface ElectronAPI {
    resizeWindow: (width: number, height: number) => Promise<void>;
}

interface Window {
    electron: ElectronAPI;
}
