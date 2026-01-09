import { app, BrowserWindow, ipcMain, screen } from 'electron';
import path from 'path';

// Disable hardware acceleration to prevent GPU crashes with transparent windows
app.disableHardwareAcceleration();

let mainWindow: BrowserWindow | null = null;

// Click-through failsafe: poll cursor position to auto-enable interactivity
let ignoreMouse = false;
let hoverPollTimer: NodeJS.Timeout | null = null;

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
    const { width: screenWidth } = primaryDisplay.workAreaSize;

    // Fixed size (large enough for expanded state + padding for shadows)
    const width = 500;
    const height = 500;

    mainWindow = new BrowserWindow({
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
            preload: path.join(__dirname, 'preload.js'),
            nodeIntegration: false,
            contextIsolation: true,
            backgroundThrottling: false, // Prevent lag when window is blurred
        },
        skipTaskbar: true, // Optional: keep it less intrusive
    });

    const devUrl = process.env.VITE_DEV_SERVER_URL || 'http://localhost:5173';

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

    mainWindow.on('closed', () => {
        stopHoverPoll();
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

    app.on('ready', createWindow);
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

// IPC Handlers
ipcMain.handle('resize-window', (_event, { width, height }) => {
    if (!mainWindow) return;
    const b = mainWindow.getBounds();
    const display = screen.getDisplayMatching(b);
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

    mainWindow.setPosition(Math.round(newX), Math.round(newY));
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

    // Force it to be interactive during z-order changes - CRITICAL
    ignoreMouse = false;
    mainWindow.setIgnoreMouseEvents(false);
    stopHoverPoll();

    if (alwaysOnTop) {
        mainWindow.setAlwaysOnTop(true, 'floating');
        mainWindow.setSkipTaskbar(true);
    } else {
        mainWindow.setAlwaysOnTop(false);
        mainWindow.setSkipTaskbar(false);
    }

    // Preserve exact bounds; no jumping
    mainWindow.setBounds(b, false);

    // Keep visible (avoid "disappear")
    if (!mainWindow.isVisible()) mainWindow.show();
    else mainWindow.showInactive();
    
    // Double-check interactivity after z-order change - sometimes it gets lost
    setTimeout(() => {
        if (mainWindow && ignoreMouse) {
            ignoreMouse = false;
            mainWindow.setIgnoreMouseEvents(false);
            stopHoverPoll();
        }
    }, 50);
});
