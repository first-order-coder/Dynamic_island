"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const electron_1 = require("electron");
const exposedObject = {
    resizeWindow: (width, height) => electron_1.ipcRenderer.invoke('resize-window', { width, height }),
    moveWindow: (deltaX, deltaY) => electron_1.ipcRenderer.invoke('move-window', { deltaX, deltaY }),
    setIgnoreMouseEvents: (ignore, options) => electron_1.ipcRenderer.invoke('set-ignore-mouse-events', ignore, options),
    setAlwaysOnTop: (alwaysOnTop) => electron_1.ipcRenderer.invoke('set-always-on-top', alwaysOnTop),
    // Focus request
    focusWindow: () => electron_1.ipcRenderer.invoke('focus-window'),
    // Real window blur/focus events from main process
    onWindowBlur: (cb) => {
        electron_1.ipcRenderer.removeAllListeners('overlay-window-blur');
        electron_1.ipcRenderer.on('overlay-window-blur', cb);
    },
    onWindowFocus: (cb) => {
        electron_1.ipcRenderer.removeAllListeners('overlay-window-focus');
        electron_1.ipcRenderer.on('overlay-window-focus', cb);
    },
    // Selective click-through control
    overlaySetMode: (expanded, pinned) => electron_1.ipcRenderer.invoke('overlay-set-mode', { expanded, pinned }),
    overlaySetInteractiveRect: (rect) => electron_1.ipcRenderer.invoke('overlay-set-interactive-rect', rect),
    // Recenter window
    recenterWindow: () => electron_1.ipcRenderer.invoke('recenter-window'),
};
console.log('[preload] electron API keys:', Object.keys(exposedObject));
electron_1.contextBridge.exposeInMainWorld('electron', exposedObject);
//# sourceMappingURL=preload.js.map