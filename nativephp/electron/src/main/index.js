import NativePHP from '#plugin';
import { app, BrowserWindow } from 'electron';
import fs from 'fs';
import path from 'path';
import { createSplash } from './splash.js';
// Inherit User's PATH in Process & ChildProcess
import fixPath from 'fix-path';
fixPath();

// A packaged app has no visible console, and this is where NativePHP reports a process that would not start or exited.
// Mirror it into <user data>/logs/main.log (kept to about 1 MB, one older copy) so a problem can be read afterwards.
(function mirrorConsoleToFile() {
    try {
        const directory = path.join(app.getPath('userData'), 'logs');
        fs.mkdirSync(directory, { recursive: true });

        const file = path.join(directory, 'main.log');

        try {
            if (fs.statSync(file).size > 1_000_000) {
                fs.renameSync(file, path.join(directory, 'main.old.log'));
            }
        } catch {
            // No log yet.
        }

        const stream = fs.createWriteStream(file, { flags: 'a' });
        const text = (value) => (typeof value === 'string' ? value : value instanceof Error ? value.stack : JSON.stringify(value));

        for (const level of ['log', 'info', 'warn', 'error']) {
            const original = console[level].bind(console);

            console[level] = (...args) => {
                original(...args);
                stream.write(`${new Date().toISOString()} [${level}] ${args.map(text).join(' ')}\n`);
            };
        }

        // Only watches: the default crash dialog still appears.
        process.on('uncaughtExceptionMonitor', (error) => {
            stream.write(`${new Date().toISOString()} [fatal] ${text(error)}\n`);
        });
    } catch {
        // Logging must never stop the app from starting.
    }
})();

const buildPath = path.resolve(import.meta.dirname, import.meta.env.MAIN_VITE_NATIVEPHP_BUILD_PATH);
const defaultIcon = path.join(buildPath, 'icon.png');
const certificate = path.join(buildPath, 'cacert.pem');

const executable = process.platform === 'win32' ? 'php.exe' : 'php';
const phpBinary = path.join(buildPath, 'php', executable);
const appPath = path.join(buildPath, 'app');

let splashWindow;

app.whenReady().then(() => {
    try {
        splashWindow = createSplash(appPath, import.meta.dirname);
    } catch (error) {
        console.error('Error creating splash screen:', error);
    }

    NativePHP.bootstrap(app, defaultIcon, phpBinary, certificate, appPath);
});

app.on('browser-window-created', (event, window) => {
    if (splashWindow && window !== splashWindow) {
        window.webContents.on('did-navigate', (evt, url) => {
            if (url.startsWith('http://127.0.0.1') || url.startsWith('http://localhost')) {
                if (splashWindow) {
                    splashWindow.close();
                    splashWindow = null;
                }
            }
        });
    }
});
