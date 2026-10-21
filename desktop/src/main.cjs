'use strict';
const path = require('node:path');
const fs = require('node:fs/promises');
const { parseXrayProfiles } = require('../shared/xray-profiles.cjs');
const { validateWithSingBox } = require('../shared/singbox-runtime.cjs');
const { app, BrowserWindow, ipcMain, session, shell, Menu, dialog } = require('electron');
const { safePage } = require('../shared/official.cjs');
const { plans } = require('../shared/catalog.cjs');

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
  ipcMain.handle('vainah:inspect-xray-file',async event=>{
    if(!authorizedSender(event))return {ok:false,message:'Доступ запрещён'};
    const selection=await dialog.showOpenDialog(mainWindow,{
      title:'Проверить локальный Xray JSON (без сохранения)',
      properties:['openFile'],
      filters:[{name:'JSON',extensions:['json']}]
    });
    if(selection.canceled || !selection.filePaths?.length)return {ok:false,cancelled:true};
    try {
      const file=selection.filePaths[0];
      // Refuse symlinks and bound the read on a single opened descriptor.
      const before=await fs.lstat(file);
      if(!before.isFile() || before.size>1024*1024)
        return {ok:false,message:'Нужен обычный JSON-файл не больше 1 МБ'};
      const flags=require('node:fs').constants;
      const handle=await fs.open(file,flags.O_RDONLY | (flags.O_NOFOLLOW || 0));
      let json;
      try {
        const info=await handle.stat();
        if(!info.isFile() || info.size>1024*1024)
          return {ok:false,message:'JSON слишком большой'};
        const buffer=Buffer.allocUnsafe(info.size+1);
        let offset=0;
        while(offset<buffer.length){
          const {bytesRead}=await handle.read(buffer,offset,buffer.length-offset,offset);
          if(bytesRead===0)break;
          offset+=bytesRead;
        }
        if(offset>1024*1024)return {ok:false,message:'JSON слишком большой'};
        json=buffer.toString('utf8',0,offset);
        buffer.fill(0);
      } finally {await handle.close()}
      const profiles=parseXrayProfiles(json);
      // Check the bundled engine, but never run a tunnel or claim protection.
      // A validator failure does not disclose any part of the subscription.
      const enginePath = app.isPackaged
        ? path.join(process.resourcesPath,'engines','sing-box','sing-box.exe')
        : path.join(__dirname,'..','vendor','sing-box','windows-x64','sing-box.exe');
      const engineCheck = process.platform==='win32'
        ? await validateWithSingBox(enginePath,json)
        : {ok:false,reason:'Windows check only'};
      json=null;
      return {ok:true,profiles,engineCheck};
    } catch {
      // Never expose file paths, secrets, or raw parser/OS errors.
      return {ok:false,message:'Не удалось прочитать Xray JSON. Проверь формат файла.'};
    }
  });
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
