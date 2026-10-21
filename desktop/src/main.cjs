'use strict';
const path = require('node:path');
const { app, BrowserWindow, ipcMain, session, shell, Menu, dialog, safeStorage } = require('electron');
const { safePage } = require('../shared/official.cjs');
const { plans } = require('../shared/catalog.cjs');
const { PUBLIC_CAPABILITIES } = require('../shared/h1-protocol.cjs');
const { EngineHost } = require('./engine-host.cjs');
const { SubscriptionStore } = require('./subscription-store.cjs');

let mainWindow;
const engine = new EngineHost();
let subscriptions;
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
  subscriptions = new SubscriptionStore(app.getPath('userData'), safeStorage);
  session.defaultSession.setPermissionRequestHandler((_wc,_permission,callback)=>callback(false));
  session.defaultSession.setPermissionCheckHandler(()=>false);
  ipcMain.handle('vainah:info',event=>authorizedSender(event)?{
    platform:process.platform,
    version:app.getVersion(),
    preview:true
  }:null);
  ipcMain.handle('vainah:plans',event=>authorizedSender(event)?plans:[]);
  ipcMain.handle('vainah:tunnel',event=>authorizedSender(event)?engine.status():null);
  ipcMain.handle('vainah:engine:choose',async event=>{
    if(!authorizedSender(event))return {ok:false};
    const result=await dialog.showOpenDialog(mainWindow,{
      title:'Выбери официальный sing-box 1.14',
      properties:['openFile'],filters:[{name:'sing-box',extensions:process.platform==='win32'?['exe']:['*']}]
    });
    if(result.canceled||result.filePaths.length!==1)return {ok:false,code:'CANCELLED'};
    return engine.setExecutable(result.filePaths[0]);
  });
  ipcMain.handle('vainah:subscription:status',event=>authorizedSender(event)?subscriptions.status():null);
  ipcMain.handle('vainah:subscription:save',(event,secret)=>authorizedSender(event)?subscriptions.save(secret):{ok:false});
  ipcMain.handle('vainah:subscription:clear',event=>{
    if(!authorizedSender(event))return {ok:false};
    engine.stop();
    return subscriptions.clear();
  });
  ipcMain.handle('vainah:engine:start',event=>{
    if(!authorizedSender(event))return {ok:false};
    const secret=subscriptions.load();
    return secret?engine.start(secret):{ok:false,code:'SUBSCRIPTION_REQUIRED'};
  });
  ipcMain.handle('vainah:engine:stop',event=>authorizedSender(event)?engine.stop():{ok:false});
  ipcMain.handle('vainah:capabilities',event=>authorizedSender(event)?PUBLIC_CAPABILITIES:null);
  ipcMain.handle('vainah:open-official',async(event,name)=>{
    if(!authorizedSender(event))return {ok:false};
    const url=safePage(name);
    if(!url)return {ok:false};
    try{
      await shell.openExternal(url,{activate:true});
      return {ok:true};
    }catch{return {ok:false}}
  });
  app.on('before-quit',()=>engine.stop());
  createWindow();
  app.on('activate',()=>{if(BrowserWindow.getAllWindows().length===0)createWindow()});
}).catch(()=>{app.quit()});
app.on('window-all-closed',()=>{if(process.platform!=='darwin')app.quit()});
