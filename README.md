# Dynamic Island Timer

A premium Dynamic Island-style timer overlay built with Electron, React, Tailwind, and Framer Motion.

## Development

Run the development server:

```bash
npm run dev
```

### Dev Server Port

The development server port is configurable via the `DEV_PORT` environment variable (default: 5174).

To change the port:
1. Create a `.env.development` file in the root directory
2. Add: `DEV_PORT=5174` (or your preferred port)

The port is used consistently across:
- Vite dev server
- Electron window loading
- Wait-on script

## Building

```bash
npm run build
```


