"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const electron_1 = require("electron");
electron_1.contextBridge.exposeInMainWorld('electron', {
    resizeWindow: (width, height) => electron_1.ipcRenderer.invoke('resize-window', { width, height }),
    moveWindow: (deltaX, deltaY) => electron_1.ipcRenderer.invoke('move-window', { deltaX, deltaY }),
});
//# sourceMappingURL=preload.js.map