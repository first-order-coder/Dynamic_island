import { app, BrowserWindow, ipcMain, screen, globalShortcut } from 'electron';
import path from 'path';

// Disable hardware acceleration to prevent GPU crashes with transparent windows
app.disableHardwareAcceleration();

let mainWindow: BrowserWindow | null = null;

// Click-through failsafe: poll cursor position to auto-enable interactivity
let ignoreMouse = false;
let hoverPollTimer: NodeJS.Timeout | null = null;

// Selective click-through controller for pill hit-testing
let overlayExpanded = false;
let overlayPinned = true;
let interactiveRect = { x: 0, y: 0, width: 0, height: 0 };
let pollTimer: NodeJS.Timeout | null = null;
let currentlyIgnoring = false;

function setIgnoring(ignore: boolean) {
    if (!mainWindow) return;
    if (currentlyIgnoring === ignore) return;
    currentlyIgnoring = ignore;
    mainWindow.setIgnoreMouseEvents(ignore); // NO forward:true
}

function startPoll() {
    if (pollTimer || !mainWindow) return;
    pollTimer = setInterval(() => {
        if (!mainWindow) return;

        // If expanded OR unpinned -> always interactive (never click-through)
        if (overlayExpanded || !overlayPinned) {
            setIgnoring(false);
            return;
        }

        // Collapsed + pinned: click-through outside interactiveRect
        const cursor = screen.getCursorScreenPoint();
        const b = mainWindow.getBounds();

        const localX = cursor.x - b.x;
        const localY = cursor.y - b.y;

        const inside =
            localX >= interactiveRect.x &&
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

// Recenter window helper function (main process)
function recenterMainWindow() {
    if (!mainWindow) return { ok: false, reason: 'mainWindow is null' };

    const b = mainWindow.getBounds();
    const display = screen.getDisplayMatching(b);
    const { workArea } = display;

    const TOP_MARGIN = 12;

    let x = Math.round(workArea.x + (workArea.width - b.width) / 2);
    let y = Math.round(workArea.y + TOP_MARGIN);

    // Clamp inside work area
    x = Math.min(Math.max(x, workArea.x), workArea.x + workArea.width - b.width);
    y = Math.min(Math.max(y, workArea.y), workArea.y + workArea.height - b.height);

    console.log('[recenter] from', b, 'to', { x, y }, 'workArea', workArea);

    // Ensure it can receive input during move
    mainWindow.setIgnoreMouseEvents(false);

    // Move reliably
    mainWindow.setBounds({ x, y, width: b.width, height: b.height }, false);

    // Keep visible and on top
    mainWindow.show();
    mainWindow.moveTop();

    return { ok: true, bounds: mainWindow.getBounds() };
}

function pointInRect(p: { x: number; y: number }, b: { x: number; y: number; width: number; height: number }) {
    return p.x >= b.x && p.x <= b.x + b.width && p.y >= b.y && p.y <= b.y + b.height;
}

function startHoverPoll() {
    // Stop any existing poll first to avoid duplicates
    stopHoverPoll();
    
    if (!mainWindow) return;

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

        const cursor = screen.getCursorScreenPoint();
        const bounds = mainWindow.getBounds();

        // If cursor is over the window, force interactivity back on immediately
        if (pointInRect(cursor, bounds)) {
            ignoreMouse = false;
            mainWindow.setIgnoreMouseEvents(false);
            // Keep it visible
            if (!mainWindow.isVisible()) mainWindow.show();
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
    const primaryDisplay = screen.getPrimaryDisplay();
    const { workArea } = primaryDisplay;

    // Start with small collapsed size + minimal padding
    const COLLAPSED_W = 190;
    const COLLAPSED_H = 60;

    mainWindow = new BrowserWindow({
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
            preload: path.join(__dirname, 'preload.js'),
            nodeIntegration: false,
            contextIsolation: true,
            backgroundThrottling: false, // Prevent lag when window is blurred
        },
        skipTaskbar: true, // Optional: keep it less intrusive
    });

    // Use VITE_DEV_SERVER_URL if provided, otherwise construct from DEV_PORT (default 5174)
    const devPort = process.env.DEV_PORT || '5174';
    const devUrl = process.env.VITE_DEV_SERVER_URL || `http://localhost:${devPort}`;

    if (!app.isPackaged) {
        mainWindow.loadURL(devUrl);
        // mainWindow.webContents.openDevTools({ mode: 'detach' });
    } else {
        mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
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

const gotTheLock = app.requestSingleInstanceLock();

if (!gotTheLock) {
    app.quit();
} else {
    app.on('second-instance', (event, commandLine, workingDirectory) => {
        // Someone tried to run a second instance, we should focus our window.
        if (mainWindow) {
            if (mainWindow.isMinimized()) mainWindow.restore();
            mainWindow.focus();
        }
    });

    app.on('ready', () => {
        createWindow();

        // TEMP DEV TEST: recenter via Ctrl+Alt+R
        globalShortcut.register('Control+Alt+R', () => {
            console.log('[shortcut] Ctrl+Alt+R pressed');
            recenterMainWindow();
        });
    });
}

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit();
    }
});

app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
        createWindow();
    }
});

app.on('will-quit', () => {
    globalShortcut.unregisterAll();
});

// IPC Handlers
ipcMain.handle('resize-window', (_event, { width, height }) => {
    if (!mainWindow) return;

    const b = mainWindow.getBounds();
    const display = screen.getDisplayMatching(b);
    const { workArea } = display;

    const nextW = Math.round(width);
    const nextH = Math.round(height);

    const centerX = b.x + b.width / 2;
    let x = Math.round(centerX - nextW / 2);
    let y = b.y;

    x = Math.min(Math.max(x, workArea.x), workArea.x + workArea.width - nextW);
    y = Math.min(Math.max(y, workArea.y), workArea.y + workArea.height - nextH);

    mainWindow.setBounds({ x, y, width: nextW, height: nextH }, false);

    return { ok: true, bounds: mainWindow.getBounds() };
});

ipcMain.handle('move-window', (event, { deltaX, deltaY }) => {
    if (!mainWindow) return;

    const bounds = mainWindow.getBounds();
    const display = screen.getDisplayMatching(bounds);
    const { workArea } = display;

    // Calculate new position
    let newX = bounds.x + deltaX;
    let newY = bounds.y + deltaY;

    // Clamp to screen bounds (keep at least 50px visible)
    const minVisible = 50;
    newX = Math.max(workArea.x - bounds.width + minVisible, Math.min(newX, workArea.x + workArea.width - minVisible));
    newY = Math.max(workArea.y, Math.min(newY, workArea.y + workArea.height - minVisible));

    // Use setBounds instead of setPosition for smoother movement on some systems
    mainWindow.setBounds(
        { x: Math.round(newX), y: Math.round(newY), width: bounds.width, height: bounds.height },
        false
    );
});

ipcMain.handle('get-window-position', () => {
    if (!mainWindow) return { x: 0, y: 0 };
    const bounds = mainWindow.getBounds();
    return { x: bounds.x, y: bounds.y };
});

ipcMain.handle('set-ignore-mouse-events', (_event, ignore: boolean, options?: { forward?: boolean }) => {
    if (!mainWindow) return;

    ignoreMouse = ignore;
    mainWindow.setIgnoreMouseEvents(ignore, options);

    if (ignore) {
        startHoverPoll();
    } else {
        stopHoverPoll();
    }
});

ipcMain.handle('set-always-on-top', (_event, alwaysOnTop: boolean) => {
    if (!mainWindow) return;

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
    } else {
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

ipcMain.handle('focus-window', () => {
    if (!mainWindow) return;
    mainWindow.setIgnoreMouseEvents(false); // must be interactive to focus properly
    setIgnoring(false); // Also update selective click-through state
    mainWindow.show();
    mainWindow.focus();
});

ipcMain.handle('overlay-set-mode', (_event, payload: { expanded: boolean; pinned: boolean }) => {
    overlayExpanded = payload.expanded;
    overlayPinned = payload.pinned;

    // When expanded or unpinned: ensure interactive immediately
    if (overlayExpanded || !overlayPinned) {
        setIgnoring(false);
    }

    startPoll();
});

ipcMain.handle('overlay-set-interactive-rect', (_event, rect: { x: number; y: number; width: number; height: number }) => {
    interactiveRect = {
        x: Math.round(rect.x),
        y: Math.round(rect.y),
        width: Math.round(rect.width),
        height: Math.round(rect.height),
    };
    startPoll();
});

ipcMain.handle('recenter-window', () => {
    return recenterMainWindow();
});

ipcMain.handle('quit-app', () => {
    // Ensure a clean quit
    app.quit();
});
