const { app, BrowserWindow, ipcMain, shell } = require('electron');
const path = require('path');
const { spawn } = require('child_process');

// Keep references to prevent garbage collection
let mainWindow = null;
let backendProcess = null;

// Determine if we're in development or production
const isDev = !app.isPackaged;

// Get the correct paths based on environment
function getBackendPath() {
  if (isDev) {
    return path.join(__dirname, '..', 'backend');
  }
  return path.join(process.resourcesPath, 'backend');
}

function getConfigPath() {
  if (isDev) {
    return path.join(__dirname, '..', 'tasks.config.json');
  }
  return path.join(process.resourcesPath, 'tasks.config.json');
}

function getStoragePath() {
  // Always use user data directory for storage (cookies, browser profile)
  return path.join(app.getPath('userData'), 'storage');
}

// Start the backend server (only in production, dev uses external servers)
async function startBackend() {
  return new Promise((resolve, reject) => {
    // In dev mode, backend is started separately via npm run dev:backend
    if (isDev) {
      console.log('Dev mode: expecting backend to be running externally on port 3001');
      resolve();
      return;
    }

    const backendPath = getBackendPath();
    const storagePath = getStoragePath();

    // Ensure storage directory exists
    const fs = require('fs');
    if (!fs.existsSync(storagePath)) {
      fs.mkdirSync(storagePath, { recursive: true });
    }

    const configPath = getConfigPath();

    const env = {
      ...process.env,
      PORT: '3001',
      STORAGE_PATH: storagePath,
      CONFIG_PATH: configPath,
      NODE_ENV: 'production',
    };

    // In production, run compiled JavaScript using Electron's node
    const nodePath = process.execPath; // Use Electron's bundled node
    const scriptPath = path.join(backendPath, 'dist', 'index.js');

    console.log('Starting backend with:', nodePath, scriptPath);
    console.log('Backend path:', backendPath);
    console.log('Config path:', configPath);
    console.log('Storage path:', storagePath);

    // Use fork-like approach with Electron's node
    backendProcess = spawn(nodePath, [scriptPath], {
      cwd: backendPath,
      env: {
        ...env,
        ELECTRON_RUN_AS_NODE: '1', // Tell Electron to act as Node.js
      },
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    backendProcess.stdout.on('data', (data) => {
      console.log(`[Backend] ${data}`);
      if (data.toString().includes('Server running')) {
        resolve();
      }
    });

    backendProcess.stderr.on('data', (data) => {
      console.error(`[Backend Error] ${data}`);
    });

    backendProcess.on('error', (error) => {
      console.error('Failed to start backend:', error);
      reject(error);
    });

    backendProcess.on('close', (code) => {
      console.log(`Backend process exited with code ${code}`);
      backendProcess = null;
    });

    // Resolve after timeout if server message not detected
    setTimeout(() => resolve(), 3000);
  });
}

// Stop the backend server
function stopBackend() {
  if (backendProcess) {
    backendProcess.kill();
    backendProcess = null;
  }
}

// Create the main application window
function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1000,
    minHeight: 700,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
    },
    titleBarStyle: 'default',
    show: false, // Show when ready
  });

  // Load the app
  if (isDev) {
    // In dev, load from Vite dev server
    mainWindow.loadURL('http://localhost:5173');
    mainWindow.webContents.openDevTools();
  } else {
    // In production, load the built files
    mainWindow.loadFile(path.join(__dirname, '..', 'frontend', 'dist', 'index.html'));
  }

  // Show window when ready
  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

  // Handle external links
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// App lifecycle
app.whenReady().then(async () => {
  console.log('App ready, starting backend...');
  console.log('Storage path:', getStoragePath());

  try {
    await startBackend();
    console.log('Backend started, creating window...');
    createWindow();
  } catch (error) {
    console.error('Failed to start:', error);
    app.quit();
  }

  app.on('activate', () => {
    // On macOS, recreate window when dock icon clicked
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  stopBackend();
  // On macOS, apps stay active until Cmd+Q
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('before-quit', () => {
  stopBackend();
});

// IPC handlers
ipcMain.handle('get-storage-path', () => {
  return getStoragePath();
});

ipcMain.handle('get-app-version', () => {
  return app.getVersion();
});

ipcMain.handle('is-dev', () => {
  return isDev;
});
