const { app, BrowserWindow, dialog, ipcMain, shell, Menu } = require("electron");
const path = require("path");
const fs = require("fs");
const { spawn } = require("child_process");
const http = require("http");

const isDev = !app.isPackaged;
const HOST = "127.0.0.1";
const PORT = process.env.GITTUBE_PORT ? parseInt(process.env.GITTUBE_PORT, 10) : 3123;
const APP_URL = `http://${HOST}:${PORT}`;

let serverProcess = null;
let mainWindow = null;

function waitForServer(timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  return new Promise((resolve, reject) => {
    const tryConnect = () => {
      const req = http.get(APP_URL, (res) => {
        res.resume();
        resolve();
      });
      req.on("error", () => {
        if (Date.now() > deadline) {
          reject(new Error(`GitTube server did not start on ${APP_URL}`));
          return;
        }
        setTimeout(tryConnect, 300);
      });
    };
    tryConnect();
  });
}

function startServer() {
  return new Promise((resolve, reject) => {
    if (isDev) {
      serverProcess = spawn("npm", ["run", "dev", "--", "-p", String(PORT)], {
        cwd: path.join(__dirname, ".."),
        env: { ...process.env, HOSTNAME: HOST },
        stdio: "inherit",
      });
    } else {
      // Production: run the Next.js standalone server with Electron's bundled
      // Node runtime (ELECTRON_RUN_AS_NODE turns the Electron binary into node).
      const standaloneDir = path.join(process.resourcesPath, "app", ".next", "standalone");
      serverProcess = spawn(process.execPath, ["server.js"], {
        cwd: standaloneDir,
        env: {
          ...process.env,
          ELECTRON_RUN_AS_NODE: "1",
          HOSTNAME: HOST,
          PORT: String(PORT),
          NODE_ENV: "production",
        },
        stdio: "inherit",
      });
    }

    serverProcess.on("error", reject);
    serverProcess.on("exit", (code) => {
      serverProcess = null;
      if (code && code !== 0) {
        console.error(`[gittube] server exited with code ${code}`);
      }
    });

    waitForServer(60_000).then(resolve, reject);
  });
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    title: "GitTube",
    backgroundColor: "#1a1625",
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  mainWindow.loadURL(APP_URL);
  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

app.whenReady().then(async () => {
  if (!isDev) {
    Menu.setApplicationMenu(null);
  }

  try {
    await startServer();
  } catch (err) {
    dialog.showErrorBox("GitTube failed to start", String(err && err.message ? err.message : err));
    app.quit();
    return;
  }

  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

ipcMain.handle("save-download", async (_event, payload) => {
  const srcPath = payload && payload.path;
  if (!srcPath || !fs.existsSync(srcPath)) {
    return { saved: false, error: "Downloaded file not found" };
  }

  const result = await dialog.showSaveDialog(mainWindow, {
    title: "Save Download",
    defaultPath: path.join(app.getPath("downloads"), payload.filename || "download"),
  });

  if (result.canceled || !result.filePath) {
    return { saved: false, canceled: true };
  }

  try {
    fs.copyFileSync(srcPath, result.filePath);
    shell.showItemInFolder(result.filePath);
    return { saved: true, path: result.filePath };
  } catch (err) {
    return { saved: false, error: String(err && err.message ? err.message : err) };
  }
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("quit", () => {
  if (serverProcess && !serverProcess.killed) {
    serverProcess.kill();
  }
});
