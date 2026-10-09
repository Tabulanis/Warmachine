// War Machine desktop shell: a locked-down window around the packed game.
// No menu, no devtools, no navigation, no new windows. Loads the WAD build
// that `node pack.js` writes to dist/www/index.html (bundled as a resource
// by electron-builder).
const { app, BrowserWindow, Menu } = require('electron');
const path = require('path');
const fs = require('fs');

function gamePage() {
  const packaged = path.join(process.resourcesPath || '', 'www', 'index.html');
  const dev = path.join(__dirname, '..', 'dist', 'www', 'index.html');
  return app.isPackaged && fs.existsSync(packaged) ? packaged : dev;
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 720,
    minWidth: 640,
    minHeight: 360,
    backgroundColor: '#07060a',
    title: 'War Machine',
    autoHideMenuBar: true,
    fullscreenable: true,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      devTools: false,
      webSecurity: true,
    },
  });
  Menu.setApplicationMenu(null);
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  win.webContents.on('will-navigate', (e) => e.preventDefault());
  win.webContents.on('context-menu', (e) => e.preventDefault());
  win.webContents.on('before-input-event', (e, input) => {
    // F11 toggles fullscreen; everything else that looks like a browser
    // shortcut (devtools, reload, zoom) is swallowed.
    if (input.key === 'F11' && input.type === 'keyDown') { win.setFullScreen(!win.isFullScreen()); e.preventDefault(); }
    if ((input.control || input.meta) && ['r', 'R', '+', '-', '=', '0', 'i', 'I', 'j', 'J', 'u', 'U'].includes(input.key)) e.preventDefault();
    if (input.key === 'F12' || input.key === 'F5') e.preventDefault();
  });
  win.loadFile(gamePage());

  // `WM_SMOKE=1 npm start` boots the game, prints whether it came up, and
  // quits. Used for automated checks; harmless otherwise.
  if (process.env.WM_SMOKE) {
    win.webContents.on('did-finish-load', async () => {
      await new Promise((r) => setTimeout(r, 2500));
      const state = await win.webContents.executeJavaScript('window.warMachine ? window.warMachine.state : "no game"');
      const three = await win.webContents.executeJavaScript('window.THREE ? THREE.REVISION : "no three"');
      console.log(`WM_SMOKE page=${gamePage()} state=${state} three=${three}`);
      app.quit();
    });
  }
}

app.whenReady().then(() => {
  createWindow();
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});
app.on('window-all-closed', () => app.quit());
app.on('web-contents-created', (_, contents) => {
  contents.on('will-attach-webview', (e) => e.preventDefault());
  contents.setWindowOpenHandler(() => ({ action: 'deny' }));
});
