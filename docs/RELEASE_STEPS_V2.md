## GitHub Release Steps for v0.2.0

This document describes how to publish the **v0.2.0** release of **Island Timer** with a downloadable Windows installer.

### 1. Confirm Git State

- Branch: `main`
- Version in `package.json`: `"version": "0.2.0"`
- Tag: `v0.2.0` pointing to the latest commit on `main`

You can verify locally:

```bash
git checkout main
git pull
git log -1 --oneline
git show v0.2.0 --oneline
```

They should reference the same commit.

### 2. Build Artifacts (Already Done Locally)

The following commands were run locally to produce the Windows installer:

```bash
npm ci
npm run build
npm run dist:win
```

This produced the installer artifacts in the `release/` directory:

- `release/Island Timer Setup 0.2.0.exe`
- `release/Island Timer Setup 0.2.0.exe.blockmap`

These are the files you will upload to the GitHub Release.

### 3. Create the Git Tag (Already Done)

The tag was created and pushed:

```bash
git tag -a v0.2.0 -m "v0.2.0"
git push origin v0.2.0
```

You can verify on GitHub under the **Tags** section.

### 4. Create the GitHub Release (Web UI)

1. Go to the repository on GitHub:
   - `first-order-coder/Dynamic_island`
2. Click on **Releases** in the right sidebar or under the **Code** tab.
3. Click **Draft a new release**.
4. In the **Tag** dropdown:
   - Select existing tag: `v0.2.0`
5. Set the **Release title**:
   - `v0.2.0`
6. In the description/body, you can use the following as a starting point:

   ```markdown
   ## Changes in v0.2.0

   - Add **Activity** mode with GitHub-style heatmap
   - Split year view into two halves: **Jan–Jun (H1)** and **Jul–Dec (H2)**
   - Track sessions from countdown and pomodoro work phases into the activity heatmap
   - Persist selected mode and half across app restarts
   - Improve heatmap readability (larger cells, aligned month/weekday labels, DD/MM tooltips)
   - Validate Windows installer build flow (`npm ci`, `npm run build`, `npm run dist:win`)
   ```

7. Under **Assets**, click **Upload files** and upload:
   - `release/Island Timer Setup 0.2.0.exe`
   - `release/Island Timer Setup 0.2.0.exe.blockmap`

8. Ensure **This is a pre-release** is **unchecked** (this should be a full release).
9. Click **Publish release**.

### 5. Release Notes Template for Future Versions

For future releases, you can use this template:

```markdown
## Changes in vX.Y.Z

- [Short bullet 1]
- [Short bullet 2]
- [Short bullet 3]

## Installation

- Download the `Island Timer Setup X.Y.Z.exe` from the Assets section below.
- Run the installer and follow the setup wizard.

## Notes

- Windows SmartScreen may warn about an unsigned app. Click **More info** → **Run anyway**.
```

