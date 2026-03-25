const { app, BrowserWindow, shell, Tray, Menu, nativeImage } = require("electron");
const { spawn } = require("child_process");
const path = require("path");
const http = require("http");
const fs   = require("fs");

// ========================
// config
// ========================

function loadConfig() {
    const configPath = path.join(__dirname, "..", "config.json");
    const defaults   = { host: "0.0.0.0", port: 8000, yt_dlp_browser: "chromium" };
    try {
        const data = JSON.parse(fs.readFileSync(configPath, "utf-8"));
        return { ...defaults, ...data };
    } catch {
        return defaults;
    }
}

const cfg        = loadConfig();
const FLASK_PORT = cfg.port;
const FLASK_HOST = cfg.host;
const FLASK_URL  = `http://127.0.0.1:${FLASK_PORT}`;

let mainWindow   = null;
let flaskProcess = null;
let tray         = null;
let isQuitting   = false;

// ========================
// inicia o Flask
// ========================

function getAppDir() {
    if (app.isPackaged) {
        return path.join(process.resourcesPath);
    }
    return path.join(__dirname, "..");
}

function startFlask() {
    const appDir = getAppDir();
    flaskProcess = spawn("python", [
        "-m", "flask", "run",
        "--host", FLASK_HOST,
        "--port", String(FLASK_PORT),
        "--no-debugger"
    ], {
        cwd: appDir,
        env: { ...process.env, FLASK_APP: "app.py" },
    });

    flaskProcess.stdout.on("data", (d) => process.stdout.write(`[flask] ${d}`));
    flaskProcess.stderr.on("data", (d) => process.stderr.write(`[flask] ${d}`));
    flaskProcess.on("exit", (code) => console.log(`[flask] encerrou com código ${code}`));
}

// ========================
// aguarda Flask estar pronto
// ========================

function waitForFlask(retries = 40, interval = 300) {
    return new Promise((resolve, reject) => {
        let attempts = 0;
        function check() {
            http.get(FLASK_URL, () => resolve()).on("error", () => {
                if (++attempts >= retries) reject(new Error("Flask não subiu a tempo"));
                else setTimeout(check, interval);
            });
        }
        check();
    });
}

// ========================
// janela principal
// ========================

function createWindow() {
    if (mainWindow) {
        mainWindow.show();
        mainWindow.focus();
        return;
    }

    mainWindow = new BrowserWindow({
        width:     1100,
        height:    700,
        minWidth:  800,
        minHeight: 600,
        title:     "Sonar",
        icon: path.join(__dirname, "..", "static", "icons", "desktop.png"),
        webPreferences: {
            nodeIntegration:          false,
            contextIsolation:         true
        },
        backgroundColor: "#0d0d0d",
        autoHideMenuBar:  true,
    });

    mainWindow.loadURL(FLASK_URL);

    mainWindow.webContents.setWindowOpenHandler(({ url }) => {
        shell.openExternal(url);
        return { action: "deny" };
    });

    // fechar esconde a janela — servidor continua rodando
    mainWindow.on("close", (e) => {
        if (!isQuitting) {
            e.preventDefault();
            mainWindow.hide();
        }
    });

    mainWindow.on("closed", () => {
        mainWindow = null;
    });
}

// ========================
// tray
// ========================

function createTray() {
    const iconPath = path.join(__dirname, "..", "static", "icons", "tray.png");
    const icon     = nativeImage.createFromPath(iconPath);

    tray = new Tray(icon.isEmpty() ? nativeImage.createEmpty() : icon);
    tray.setToolTip("Sonar");

    const menu = Menu.buildFromTemplate([
        {
            label: "Abrir Sonar",
            click: () => createWindow(),
        },
        {
            label: "Abrir no navegador",
            click: () => shell.openExternal(FLASK_URL),
        },
        { type: "separator" },
        {
            label: "Encerrar tudo",
            click: () => {
                isQuitting = true;
                if (flaskProcess) flaskProcess.kill();
                app.quit();
            },
        },
    ]);

    tray.setContextMenu(menu);
    tray.on("double-click", () => createWindow());
}

// ========================
// lifecycle
// ========================

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
    app.quit();
} else {
    app.on("second-instance", () => {
        if (mainWindow) {
            if (mainWindow.isMinimized()) mainWindow.restore();
            mainWindow.show();
            mainWindow.focus();
        }
    });
}

app.whenReady().then(async () => {
    app.setAppUserModelId("sonar");

    startFlask();
    createTray();

    try {
        await waitForFlask();
        createWindow();
    } catch (e) {
        console.error(e.message);
        isQuitting = true;
        if (flaskProcess) flaskProcess.kill();
        app.quit();
    }
});

app.on("window-all-closed", () => {
    // não encerra — fica na tray
});

app.on("activate", () => {
    createWindow();
});

app.on("before-quit", () => {
    isQuitting = true;
    if (flaskProcess) flaskProcess.kill();
});