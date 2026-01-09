import { app, BrowserWindow, ipcMain, screen } from 'electron';
import path from 'path';

// Disable hardware acceleration to prevent GPU crashes with transparent windows
app.disableHardwareAcceleration();

let mainWindow: BrowserWindow | null = null;

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
ipcMain.handle('resize-window', (event, { width, height }) => {
    if (!mainWindow) return;
    const bounds = mainWindow.getBounds();
    const primaryDisplay = screen.getPrimaryDisplay();
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

ipcMain.handle('set-ignore-mouse-events', (event, ignore, options) => {
    if (!mainWindow) return;
    mainWindow.setIgnoreMouseEvents(ignore, options);
});

ipcMain.handle('set-always-on-top', (event, alwaysOnTop) => {
    if (!mainWindow) return;
    mainWindow.setAlwaysOnTop(alwaysOnTop);
});
