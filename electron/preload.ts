import { contextBridge, ipcRenderer } from 'electron';

const exposedObject = {
    resizeWindow: (width: number, height: number) => ipcRenderer.invoke('resize-window', { width, height }),
    moveWindow: (deltaX: number, deltaY: number) => ipcRenderer.invoke('move-window', { deltaX, deltaY }),
    setIgnoreMouseEvents: (ignore: boolean, options?: { forward?: boolean }) => ipcRenderer.invoke('set-ignore-mouse-events', ignore, options),
    setAlwaysOnTop: (alwaysOnTop: boolean) => ipcRenderer.invoke('set-always-on-top', alwaysOnTop),
    
    // Focus request
    focusWindow: () => ipcRenderer.invoke('focus-window'),
    
    // Real window blur/focus events from main process
    onWindowBlur: (cb: () => void) => {
        ipcRenderer.removeAllListeners('overlay-window-blur');
        ipcRenderer.on('overlay-window-blur', cb);
    },
    onWindowFocus: (cb: () => void) => {
        ipcRenderer.removeAllListeners('overlay-window-focus');
        ipcRenderer.on('overlay-window-focus', cb);
    },
    
    // Selective click-through control
    overlaySetMode: (expanded: boolean, pinned: boolean) =>
        ipcRenderer.invoke('overlay-set-mode', { expanded, pinned }),
    
    overlaySetInteractiveRect: (rect: { x: number; y: number; width: number; height: number }) =>
        ipcRenderer.invoke('overlay-set-interactive-rect', rect),
    
    // Recenter window
    recenterWindow: () => ipcRenderer.invoke('recenter-window'),
    
    // Quit app
    quitApp: () => ipcRenderer.invoke('quit-app'),
};

console.log('[preload] electron keys exposed:', Object.keys(exposedObject));

contextBridge.exposeInMainWorld('electron', exposedObject);