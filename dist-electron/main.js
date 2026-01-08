"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const electron_1 = require("electron");
const path_1 = __importDefault(require("path"));
let mainWindow = null;
const createWindow = () => {
    const primaryDisplay = electron_1.screen.getPrimaryDisplay();
    const { width: screenWidth } = primaryDisplay.workAreaSize;
    // Fixed size (large enough for expanded state + padding for shadows)
    const width = 420; // 360 + 60 padding
    const height = 300; // 240 + 60 padding
    mainWindow = new electron_1.BrowserWindow({
        width: width,
        height: height,
        x: Math.round(screenWidth / 2 - width / 2),
        y: 0, // Top of screen
        frame: false,
        transparent: true,
        alwaysOnTop: true,
        resizable: false, // controlled by setSize
        hasShadow: false, // We'll render shadow in CSS for more control over shape
        webPreferences: {
            preload: path_1.default.join(__dirname, 'preload.js'),
            nodeIntegration: false,
            contextIsolation: true,
            backgroundThrottling: false, // Prevent lag when window is blurred
        },
        skipTaskbar: true, // Optional: keep it less intrusive
    });
    const devUrl = process.env.VITE_DEV_SERVER_URL || 'http://localhost:5173';
    if (!electron_1.app.isPackaged) {
        mainWindow.loadURL(devUrl);
        // mainWindow.webContents.openDevTools({ mode: 'detach' });
    }
    else {
        mainWindow.loadFile(path_1.default.join(__dirname, '../dist/index.html'));
    }
    // Make the window ignore mouse events when transparent parts are clicked?
    // For now, we want it clickable everywhere inside the pill.
    // We might need setIgnoreMouseEvents if we have large transparent areas, 
    // but since we resize the window to match content, it's fine.
};
electron_1.app.on('ready', createWindow);
electron_1.app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        electron_1.app.quit();
    }
});
electron_1.app.on('activate', () => {
    if (electron_1.BrowserWindow.getAllWindows().length === 0) {
        createWindow();
    }
});
// IPC Handlers
electron_1.ipcMain.handle('resize-window', (event, { width, height }) => {
    if (!mainWindow)
        return;
    const bounds = mainWindow.getBounds();
    const primaryDisplay = electron_1.screen.getPrimaryDisplay();
    const { width: screenWidth } = primaryDisplay.workAreaSize;
    // Center horizontally
    const x = Math.round(screenWidth / 2 - width / 2);
    mainWindow.setBounds({
        x: x,
        y: bounds.y, // keep current Y
        width: Math.round(width),
        height: Math.round(height)
    }, true);
});
electron_1.ipcMain.handle('move-window', (event, { deltaX, deltaY }) => {
    if (!mainWindow)
        return;
    const bounds = mainWindow.getBounds();
    const display = electron_1.screen.getDisplayMatching(bounds);
    const { workArea } = display;
    // Calculate new position
    let newX = bounds.x + deltaX;
    let newY = bounds.y + deltaY;
    // Clamp to screen bounds (keep at least 50px visible)
    const minVisible = 50;
    newX = Math.max(workArea.x - bounds.width + minVisible, Math.min(newX, workArea.x + workArea.width - minVisible));
    newY = Math.max(workArea.y, Math.min(newY, workArea.y + workArea.height - minVisible));
    mainWindow.setPosition(Math.round(newX), Math.round(newY));
});
electron_1.ipcMain.handle('get-window-position', () => {
    if (!mainWindow)
        return { x: 0, y: 0 };
    const bounds = mainWindow.getBounds();
    return { x: bounds.x, y: bounds.y };
});
//# sourceMappingURL=main.js.map