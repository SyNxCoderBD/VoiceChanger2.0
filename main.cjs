const { app, BrowserWindow, protocol, session } = require('electron');
const fs = require('node:fs/promises');
const path = require('node:path');

protocol.registerSchemesAsPrivileged([
  { scheme: 'voicechanger', privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true } }
]);

const rendererRoot = path.resolve(__dirname, 'renderer');
const contentTypes = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8'
};

async function serveRenderer(request) {
  const requestedPath = decodeURIComponent(new URL(request.url).pathname).replace(/^\/+/, '');
  const filePath = path.resolve(rendererRoot, requestedPath || 'index.html');
  if (!filePath.startsWith(`${rendererRoot}${path.sep}`)) {
    return new Response('Not found', { status: 404 });
  }

  try {
    const body = await fs.readFile(filePath);
    return new Response(body, {
      headers: {
        'Content-Type': contentTypes[path.extname(filePath)] || 'application/octet-stream',
        'Cache-Control': 'no-store'
      }
    });
  } catch {
    return new Response('Not found', { status: 404 });
  }
}

function createWindow() {
  const window = new BrowserWindow({
    width: 1080,
    height: 820,
    minWidth: 760,
    minHeight: 640,
    backgroundColor: '#f3f5f2',
    title: 'VoiceChanger',
    icon: path.join(__dirname, 'assets/icon.ico'),
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });

  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  window.webContents.on('will-navigate', (event, url) => {
    if (!url.startsWith('voicechanger://')) event.preventDefault();
  });
  window.loadURL('voicechanger://ui/index.html');
}

app.whenReady().then(() => {
  protocol.handle('voicechanger', serveRenderer);
  session.defaultSession.setPermissionRequestHandler((_contents, permission, callback) => {
    callback(permission === 'media');
  });
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});