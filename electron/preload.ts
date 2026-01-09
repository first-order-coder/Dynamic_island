import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('electron', {
    resizeWindow: (width: number, height: number) => ipcRenderer.invoke('resize-window', { width, height }),
    moveWindow: (deltaX: number, deltaY: number) => ipcRenderer.invoke('move-window', { deltaX, deltaY }),
    setIgnoreMouseEvents: (ignore: boolean, options?: { forward?: boolean }) => ipcRenderer.invoke('set-ignore-mouse-events', ignore, options),
    setAlwaysOnTop: (alwaysOnTop: boolean) => ipcRenderer.invoke('set-always-on-top', alwaysOnTop),
});
