import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('electron', {
    resizeWindow: (width: number, height: number) => ipcRenderer.invoke('resize-window', { width, height }),
    moveWindow: (deltaX: number, deltaY: number) => ipcRenderer.invoke('move-window', { deltaX, deltaY }),
});
