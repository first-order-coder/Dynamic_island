"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const electron_1 = require("electron");
const path_1 = __importDefault(require("path"));
// Disable hardware acceleration to prevent GPU crashes with transparent windows
electron_1.app.disableHardwareAcceleration();
let mainWindow = null;
// Click-through failsafe: poll cursor position to auto-enable interactivity
let ignoreMouse = false;
let hoverPollTimer = null;
function pointInRect(p, b) {
    return p.x >= b.x && p.x <= b.x + b.width && p.y >= b.y && p.y <= b.y + b.height;
}
function startHoverPoll() {
    // Stop any existing poll first to avoid duplicates
    stopHoverPoll();
    if (!mainWindow)
        return;
    hoverPollTimer = setInterval(() => {
        if (!mainWindow) {
            stopHoverPoll();
            return;
        }
        // If not currently click-through, stop polling.
        if (!ignoreMouse) {
            stopHoverPoll();
            return;
        }
        const cursor = electron_1.screen.getCursorScreenPoint();
        const bounds = mainWindow.getBounds();
        // If cursor is over the window, force interactivity back on immediately
        if (pointInRect(cursor, bounds)) {
            ignoreMouse = false;
            mainWindow.setIgnoreMouseEvents(false);
            // Keep it visible
            if (!mainWindow.isVisible())
                mainWindow.show();
            // Stop polling since we're now interactive
            stopHoverPoll();
        }
    }, 50); // 20Hz is enough; low overhead
}
function stopHoverPoll() {
    if (hoverPollTimer) {
        clearInterval(hoverPollTimer);
        hoverPollTimer = null;
    }
}
const createWindow = () => {
    const primaryDisplay = electron_1.screen.getPrimaryDisplay();
    const { width: screenWidth } = primaryDisplay.workAreaSize;
    // Fixed size (large enough for expanded state + padding for shadows)
    const width = 500;
    const height = 500;
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
    // Bridge logs from renderer to terminal
    mainWindow.webContents.on('console-message', (event, level, message) => {
        const levels = ['DEBUG', 'INFO', 'WARN', 'ERROR'];
        console.log(`[Renderer ${levels[level] || 'LOG'}] ${message}`);
    });
    mainWindow.on('closed', () => {
        stopHoverPoll();
        mainWindow = null;
    });
};
const gotTheLock = electron_1.app.requestSingleInstanceLock();
if (!gotTheLock) {
    electron_1.app.quit();
}
else {
    electron_1.app.on('second-instance', (event, commandLine, workingDirectory) => {
        // Someone tried to run a second instance, we should focus our window.
        if (mainWindow) {
            if (mainWindow.isMinimized())
                mainWindow.restore();
            mainWindow.focus();
        }
    });
    electron_1.app.on('ready', createWindow);
}
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
electron_1.ipcMain.handle('resize-window', (_event, { width, height }) => {
    if (!mainWindow)
        return;
    const b = mainWindow.getBounds();
    const display = electron_1.screen.getDisplayMatching(b);
    const { workArea } = display;
    const nextW = Math.round(width);
    const nextH = Math.round(height);
    // Preserve current window center X, keep y fixed.
    const centerX = b.x + b.width / 2;
    let x = Math.round(centerX - nextW / 2);
    let y = b.y;
    // Clamp inside work area
    x = Math.min(Math.max(x, workArea.x), workArea.x + workArea.width - nextW);
    y = Math.min(Math.max(y, workArea.y), workArea.y + workArea.height - nextH);
    mainWindow.setBounds({ x, y, width: nextW, height: nextH }, false);
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
electron_1.ipcMain.handle('set-ignore-mouse-events', (_event, ignore, options) => {
    if (!mainWindow)
        return;
    ignoreMouse = ignore;
    mainWindow.setIgnoreMouseEvents(ignore, options);
    if (ignore) {
        startHoverPoll();
    }
    else {
        stopHoverPoll();
    }
});
electron_1.ipcMain.handle('set-always-on-top', (_event, alwaysOnTop) => {
    if (!mainWindow)
        return;
    const b = mainWindow.getBounds();
    // Force it to be interactive during z-order changes - CRITICAL
    ignoreMouse = false;
    mainWindow.setIgnoreMouseEvents(false);
    stopHoverPoll();
    if (alwaysOnTop) {
        mainWindow.setAlwaysOnTop(true, 'floating');
        mainWindow.setSkipTaskbar(true);
    }
    else {
        mainWindow.setAlwaysOnTop(false);
        mainWindow.setSkipTaskbar(false);
    }
    // Preserve exact bounds; no jumping
    mainWindow.setBounds(b, false);
    // Keep visible (avoid "disappear")
    if (!mainWindow.isVisible())
        mainWindow.show();
    else
        mainWindow.showInactive();
    // Double-check interactivity after z-order change - sometimes it gets lost
    setTimeout(() => {
        if (mainWindow && ignoreMouse) {
            ignoreMouse = false;
            mainWindow.setIgnoreMouseEvents(false);
            stopHoverPoll();
        }
    }, 50);
});
//# sourceMappingURL=main.js.map