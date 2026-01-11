# Windows Build Fix: Symbolic Link Error

## Problem

When running `npm run dist:win` on Windows, you may encounter this error:

```
ERROR: Cannot create symbolic link : A required privilege is not held by the client.
```

This occurs because electron-builder needs to extract `winCodeSign` and create symbolic links, which requires elevated privileges on Windows.

## Solution 1: Enable Developer Mode (Recommended)

**Windows 11:**
1. Open **Settings** → **Privacy & security** → **For developers**
2. Enable **Developer Mode**
3. Restart your terminal/IDE
4. Clear electron-builder cache and rebuild:

```powershell
Remove-Item -Recurse -Force "$env:LOCALAPPDATA\electron-builder\Cache\winCodeSign"
npm run dist:win
```

**Windows 10:**
1. Open **Settings** → **Update & Security** → **For developers**
2. Enable **Developer Mode**
3. Restart your terminal/IDE
4. Clear electron-builder cache and rebuild (commands above)

## Solution 2: Run PowerShell as Administrator

1. Right-click **PowerShell** → **Run as Administrator**
2. Navigate to your project directory
3. Clear cache and rebuild:

```powershell
Remove-Item -Recurse -Force "$env:LOCALAPPDATA\electron-builder\Cache\winCodeSign"
npm run dist:win
```

## Quick Fix (Automated)

The `dist:win` script now automatically clears the cache before building. If you still encounter issues, manually run:

```powershell
npm run clean:eb-cache
npm run dist:win
```

## Additional Notes

- Developer Mode is the preferred solution as it doesn't require running as admin each time
- The cache clear is now automated in the build process, but you can run it manually if needed
- This issue only affects Windows builds; macOS and Linux builds are unaffected




