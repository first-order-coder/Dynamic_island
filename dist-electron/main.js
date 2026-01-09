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
// Selective click-through controller for pill hit-testing
let overlayExpanded = false;
let overlayPinned = true;
let interactiveRect = { x: 0, y: 0, width: 0, height: 0 };
let pollTimer = null;
let currentlyIgnoring = false;
function setIgnoring(ignore) {
    if (!mainWindow)
        return;
    if (currentlyIgnoring === ignore)
        return;
    currentlyIgnoring = ignore;
    mainWindow.setIgnoreMouseEvents(ignore); // NO forward:true
}
function startPoll() {
    if (pollTimer || !mainWindow)
        return;
    pollTimer = setInterval(() => {
        if (!mainWindow)
            return;
        // If expanded OR unpinned -> always interactive (never click-through)
        if (overlayExpanded || !overlayPinned) {
            setIgnoring(false);
            return;
        }
        // Collapsed + pinned: click-through outside interactiveRect
        const cursor = electron_1.screen.getCursorScreenPoint();
        const b = mainWindow.getBounds();
        const localX = cursor.x - b.x;
        const localY = cursor.y - b.y;
        const inside = localX >= interactiveRect.x &&
            localX <= interactiveRect.x + interactiveRect.width &&
            localY >= interactiveRect.y &&
            localY <= interactiveRect.y + interactiveRect.height;
        // If cursor is over pill -> interactive, else click-through
        setIgnoring(!inside);
    }, 33); // ~30fps
}
function stopPoll() {
    if (pollTimer) {
        clearInterval(pollTimer);
        pollTimer = null;
    }
}
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
    const { workArea } = primaryDisplay;
    // Start with small collapsed size + minimal padding
    const COLLAPSED_W = 190;
    const COLLAPSED_H = 60;
    mainWindow = new electron_1.BrowserWindow({
        width: COLLAPSED_W,
        height: COLLAPSED_H,
        x: Math.round(workArea.x + workArea.width / 2 - COLLAPSED_W / 2),
        y: workArea.y + 8,
        frame: false,
        transparent: true,
        backgroundColor: '#00000000', // Fully transparent background
        alwaysOnTop: true,
        resizable: false, // controlled by setSize
        hasShadow: false, // No window shadow - shadow only in CSS when needed
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
    // Real BrowserWindow blur/focus events - source of truth for collapse-on-outside-click
    mainWindow.on('blur', () => {
        mainWindow?.webContents.send('overlay-window-blur');
    });
    mainWindow.on('focus', () => {
        mainWindow?.webContents.send('overlay-window-focus');
    });
    mainWindow.on('closed', () => {
        stopHoverPoll();
        stopPoll();
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
    // Preserve the current center X so resizing feels stable even after dragging
    const centerX = b.x + b.width / 2;
    let x = Math.round(centerX - nextW / 2);
    let y = b.y;
    // Clamp window inside work area
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
    // Use setBounds instead of setPosition for smoother movement on some systems
    mainWindow.setBounds({ x: Math.round(newX), y: Math.round(newY), width: bounds.width, height: bounds.height }, false);
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
    // Ensure interactive during the transition
    ignoreMouse = false;
    mainWindow.setIgnoreMouseEvents(false);
    stopHoverPoll();
    setIgnoring(false); // Also update selective click-through state
    // Update overlayPinned to match alwaysOnTop
    overlayPinned = alwaysOnTop;
    if (alwaysOnTop) {
        mainWindow.setAlwaysOnTop(true, 'floating');
        mainWindow.setSkipTaskbar(true);
    }
    else {
        mainWindow.setAlwaysOnTop(false);
        mainWindow.setSkipTaskbar(false);
    }
    // Preserve exact position and size
    mainWindow.setBounds(b, false);
    // Keep visible
    mainWindow.show();
    mainWindow.moveTop();
    // Restart selective click-through poll
    startPoll();
});
electron_1.ipcMain.handle('focus-window', () => {
    if (!mainWindow)
        return;
    mainWindow.setIgnoreMouseEvents(false); // must be interactive to focus properly
    setIgnoring(false); // Also update selective click-through state
    mainWindow.show();
    mainWindow.focus();
});
electron_1.ipcMain.handle('overlay-set-mode', (_event, payload) => {
    overlayExpanded = payload.expanded;
    overlayPinned = payload.pinned;
    // When expanded or unpinned: ensure interactive immediately
    if (overlayExpanded || !overlayPinned) {
        setIgnoring(false);
    }
    startPoll();
});
electron_1.ipcMain.handle('overlay-set-interactive-rect', (_event, rect) => {
    interactiveRect = {
        x: Math.round(rect.x),
        y: Math.round(rect.y),
        width: Math.round(rect.width),
        height: Math.round(rect.height),
    };
    startPoll();
});
electron_1.ipcMain.handle('recenter-window', () => {
    if (!mainWindow)
        return { ok: false, reason: 'no-window' };
    const b = mainWindow.getBounds();
    const display = electron_1.screen.getDisplayMatching(b);
    const { workArea } = display;
    const TOP_MARGIN = 12;
    // top-center of the work area, preserve current size
    let x = Math.round(workArea.x + (workArea.width - b.width) / 2);
    let y = Math.round(workArea.y + TOP_MARGIN);
    // clamp (just in case)
    x = Math.min(Math.max(x, workArea.x), workArea.x + workArea.width - b.width);
    y = Math.min(Math.max(y, workArea.y), workArea.y + workArea.height - b.height);
    console.log('[ipc recenter-window] from', b, 'to', { x, y }, 'workArea', workArea);
    // Force interactivity while moving (prevents click-through controllers from interfering)
    mainWindow.setIgnoreMouseEvents(false);
    setIgnoring(false); // Also update selective click-through state
    // Move window (use setBounds for reliability)
    mainWindow.setBounds({ x, y, width: b.width, height: b.height }, false);
    // Make sure it is visible
    mainWindow.showInactive();
    // Return new bounds to renderer for confirmation
    const nb = mainWindow.getBounds();
    return { ok: true, bounds: nb };
});
//# sourceMappingURL=main.js.map