# Island Timer

A beautiful Dynamic Island-style timer overlay for Windows, built with Electron, React, Tailwind CSS, and Framer Motion.

## Features

- **Dynamic Island UI**: Smooth, macOS-inspired pill-shaped interface that expands and collapses
- **Multiple Timer Modes**: 
  - Countdown timer
  - Stopwatch (count up)
  - Pomodoro timer with work/break sessions
- **Always on Top**: Stay focused with a floating timer overlay
- **Click-Through Mode**: Timer becomes transparent to mouse clicks when collapsed (Windows)
- **Smooth Animations**: Premium iOS-like animations and transitions
- **Customizable**: Adjustable work/break durations for Pomodoro mode

## Installation

### For Users (No Coding Required)

1. Go to the [Releases](https://github.com/first-order-coder/Dynamic_island/releases) page
2. Download the latest `Island Timer Setup X.X.X.exe` installer
3. Run the installer and follow the setup wizard
4. Launch Island Timer from your Start menu or desktop

### Windows SmartScreen Warning

Since this app is not code-signed yet, Windows SmartScreen may show a warning when you first run the installer. This is normal for unsigned applications.

**To proceed:**
1. Click "More info"
2. Click "Run anyway"

The app is safe to use - it's open source and you can review the code. Code signing will be added in a future release.

## Development

### Prerequisites

- Node.js 18+ and npm
- Windows 10/11 (for Windows builds)

### Setup

```bash
npm install
```

### Run Development Server

```bash
npm run dev
```

This starts both the React dev server (Vite) and Electron in development mode.

### Build

Build the app for production:

```bash
npm run build
```

This creates production-ready files in `dist/` and `dist-electron/`.

### Create Windows Installer

Generate a Windows NSIS installer:

```bash
npm run dist:win
```

The installer will be created in the `release/` directory.

**Note:** If you encounter a symlink error on Windows, see [docs/WINDOWS_BUILD_FIX.md](docs/WINDOWS_BUILD_FIX.md).

## Release Steps

To create a new release:

1. **Update version** in `package.json`
2. **Build the installer:**
   ```bash
   npm run dist:win
   ```
3. **Test the installer** on a clean Windows machine (optional but recommended)
4. **Create a GitHub Release:**
   - Go to the Releases page on GitHub
   - Click "Draft a new release"
   - Tag: `v0.1.0` (match the version in package.json)
   - Title: `v0.1.0` or a descriptive name
   - Description: List changes/features
   - Attach: `release/Island Timer Setup X.X.X.exe`
5. **Publish the release**

## Project Structure

```
.
├── electron/          # Electron main process and preload
├── src/              # React application source
├── dist/             # Built React app (generated)
├── dist-electron/    # Built Electron files (generated)
├── release/          # Build outputs and installers (generated)
└── docs/             # Documentation
```

## Technologies

- **Electron**: Cross-platform desktop app framework
- **React**: UI library
- **Vite**: Build tool and dev server
- **Tailwind CSS**: Utility-first CSS framework
- **Framer Motion**: Animation library
- **TypeScript**: Type safety

## License

MIT License - see [LICENSE](LICENSE) file for details.

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.
