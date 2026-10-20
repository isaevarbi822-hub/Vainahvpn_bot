'use strict';
const path = require('node:path');
const { app, BrowserWindow, ipcMain, session, shell, Menu } = require('electron');
const { safePage } = require('../shared/official.cjs');
const { plans } = require('../shared/catalog.cjs');
const { PUBLIC_CAPABILITIES } = require('../shared/h1-protocol.cjs');

let mainWindow;
const PREVIEW_STATUS = Object.freeze({
  state: 'unavailable',
  protected: false,
  label: 'VPN не подключён',
  explanation: 'Это предварительная версия интерфейса. H1Cloud/VLESS-движок ещё не встроен. Интернет-трафик не защищён.'
});

function authorizedSender(event) {
  return mainWindow && !mainWindow.isDestroyed() &&
         event.sender === mainWindow.webContents &&
         event.senderFrame === mainWindow.webContents.mainFrame;
}
function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1240, height: 840, minWidth: 860, minHeight: 620,
    backgroundColor: '#080b15',
    title: 'Vainah VPN — демонстрация интерфейса',
    autoHideMenuBar: true,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      nodeIntegration: false, contextIsolation: true, sandbox: true,
      webSecurity: true, webviewTag: false, spellcheck: false
    }
  });
  mainWindow.webContents.setWindowOpenHandler(() => ({action:'deny'}));
  mainWindow.webContents.on('will-navigate', e => e.preventDefault());
  mainWindow.webContents.on('will-redirect', e => e.preventDefault());
  mainWindow.webContents.on('will-attach-webview', e => e.preventDefault());
  mainWindow.loadFile(path.join(__dirname,'..','ui','index.html'));
  mainWindow.once('ready-to-show',()=>mainWindow?.show());
}
app.whenReady().then(()=>{
  if(process.platform==='win32') app.setAppUserModelId('app.vainah.vpn.desktop');
  Menu.setApplicationMenu(null);
  session.defaultSession.setPermissionRequestHandler((_wc,_permission,callback)=>callback(false));
  session.defaultSession.setPermissionCheckHandler(()=>false);
  ipcMain.handle('vainah:info',event=>authorizedSender(event)?{
    platform:process.platform,
    version:app.getVersion(),
    preview:true
  }:null);
  ipcMain.handle('vainah:plans',event=>authorizedSender(event)?plans:[]);
  ipcMain.handle('vainah:tunnel',event=>authorizedSender(event)?PREVIEW_STATUS:null);
  ipcMain.handle('vainah:open-official',async(event,name)=>{
    if(!authorizedSender(event))return {ok:false};
    const url=safePage(name);
    if(!url)return {ok:false};
    try{
      await shell.openExternal(url,{activate:true});
      return {ok:true};
    }catch{return {ok:false}}
  });
  createWindow();
  app.on('activate',()=>{if(BrowserWindow.getAllWindows().length===0)createWindow()});
}).catch(()=>{app.quit()});
app.on('window-all-closed',()=>{if(process.platform!=='darwin')app.quit()});
