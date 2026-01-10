import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

// Read dev port from environment variable (default 5174 to avoid conflicts)
const DEV_PORT = parseInt(process.env.DEV_PORT || '5174', 10);

// https://vitejs.dev/config/
export default defineConfig({
    plugins: [react()],
    base: './',
    resolve: {
        alias: {
            '@': path.resolve(__dirname, './src'),
        },
    },
    server: {
        port: DEV_PORT,
        strictPort: true,
    },
})
