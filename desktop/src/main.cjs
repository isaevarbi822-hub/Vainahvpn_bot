'use strict';
const path = require('node:path');
const fs = require('node:fs/promises');
const { parseXrayProfiles } = require('../shared/xray-profiles.cjs');
const { vlessUriToXray } = require('../shared/vless-link.cjs');
const { fetchSubscription } = require('../shared/https-subscription.cjs');
const { validateWithSingBox } = require('../shared/singbox-runtime.cjs');
const { SingBoxSession } = require('../shared/singbox-session.cjs');
const { app, BrowserWindow, ipcMain, session, shell, Menu, dialog } = require('electron');
const { safePage } = require('../shared/official.cjs');
const { plans } = require('../shared/catalog.cjs');

let mainWindow;
const engineSession = new SingBoxSession();
let chosenFile = null;
let websiteWindow = null;
const siteOrigin = new URL(safePage('home')).origin;
function trustedSiteNavigation(value) {
  try {
    const target = new URL(value);
    return target.protocol==='https:' && target.origin===siteOrigin;
  } catch { return false; }
}
function openWebsiteInsideApp(url) {
  if(!trustedSiteNavigation(url))return false;
  if(websiteWindow&&!websiteWindow.isDestroyed()){
    void websiteWindow.loadURL(url);
    websiteWindow.show();
    websiteWindow.focus();
    return true;
  }
  const win=new BrowserWindow({
    parent:mainWindow,
    width:1100,height:800,minWidth:740,minHeight:560,
    title:'Vainah VPN — личный кабинет и покупка',
    autoHideMenuBar:true,
    webPreferences:{
      partition:'persist:vainah-official-site',
      nodeIntegration:false,contextIsolation:true,sandbox:true,
      webSecurity:true,webviewTag:false,spellcheck:false
    }
  });
  websiteWindow=win;
  win.on('closed',()=>{if(websiteWindow===win)websiteWindow=null;});
  win.webContents.setWindowOpenHandler(({url:target})=>({
    action:trustedSiteNavigation(target)?'allow':'deny'
  }));
  win.webContents.on('will-navigate',(event,target)=>{
    if(!trustedSiteNavigation(target))event.preventDefault();
  });
  win.webContents.on('will-redirect',(event,target)=>{
    if(!trustedSiteNavigation(target))event.preventDefault();
  });
  win.webContents.on('will-attach-webview',event=>event.preventDefault());
  void win.loadURL(url).catch(()=>{if(!win.isDestroyed())win.close();});
  return true;
}
let chosenDirectProfile = null;
let subscriptionProfiles = [];
function enginePath() {
  return app.isPackaged
    ? path.join(process.resourcesPath,'engines','sing-box','sing-box.exe')
    : path.join(__dirname,'..','vendor','sing-box','windows-x64','sing-box.exe');
}
const PREVIEW_STATUS = Object.freeze({
  state: 'unavailable',
  protected: false,
  label: 'VPN не подключён',
  explanation: 'VPN не активен. Тестовый запуск sing-box доступен после проверки Xray JSON, но защита трафика и TUN ещё не подтверждены.'
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
  let closing=false;
  let shutdownComplete=false;
  mainWindow.on('close',event=>{
    if(shutdownComplete||engineSession.status.state==='stopped')return;
    event.preventDefault();
    if(closing)return;
    closing=true;
    void engineSession.stop().then(result=>{
      closing=false;
      if(result.ok){
        shutdownComplete=true;
        if(mainWindow&&!mainWindow.isDestroyed())mainWindow.close();
      }else if(mainWindow&&!mainWindow.isDestroyed())mainWindow.show();
    }).catch(()=>{
      closing=false;
      if(mainWindow&&!mainWindow.isDestroyed())mainWindow.show();
    });
  });
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
  ipcMain.handle('vainah:tunnel',event=>authorizedSender(event)?{
    ...PREVIEW_STATUS,
    state: engineSession.status.state,
    explanation: engineSession.status.state==='running-unverified'
      ? 'Движок запущен, но защита трафика НЕ подтверждена. Это тестовый режим.'
      : PREVIEW_STATUS.explanation
  }:null);
  ipcMain.handle('vainah:import-vless-link',async(event,link)=>{
    if(!authorizedSender(event))return {ok:false,message:'Доступ запрещён'};
    try{
      const profile=vlessUriToXray(link);
      const checked=await validateWithSingBox(enginePath(),profile);
      if(!checked.ok)return {ok:false,message:'Ключ прочитан, но проверка sing-box не прошла'};
      subscriptionProfiles=[];
      chosenDirectProfile=profile;
      chosenFile=null;
      return {ok:true,message:'VLESS-ключ проверен. Можно тестировать запуск движка.'};
    }catch{return {ok:false,message:'Нужен действительный vless:// ключ с TCP + REALITY'};}
  });
  ipcMain.handle('vainah:import-https-subscription',async(event,link)=>{
    if(!authorizedSender(event))return {ok:false,message:'Доступ запрещён'};
    try{
      const result=await fetchSubscription(link);
      subscriptionProfiles=result.profiles;
      chosenDirectProfile=result.profiles[0];
      chosenFile=null;
      return {ok:true,count:result.count,message:'Подписка загружена. Поддерживаемых серверов: '+result.count+'. Для тестового запуска выбран первый.'};
    }catch(error){
      const cause=String(error?.message||'');
      const message=cause==='No supported VLESS REALITY TCP servers'
        ? 'Подписка загружена, но поддерживаемых VLESS TCP REALITY серверов не найдено.'
        : cause==='Subscription timeout'
          ? 'Сервер подписки не ответил вовремя.'
          : cause==='Subscription too large'
            ? 'Подписка слишком большая.'
            : cause==='Subscription server rejected request'
              ? 'Сервер подписки не принял запрос. Проверь срок и действительность ссылки.'
              : 'Не удалось прочитать HTTPS-подписку. Проверь ссылку и подключение к интернету.';
      return {ok:false,message};
    }
  });
  ipcMain.handle('vainah:select-subscription-server',async(event,index)=>{
    if(!authorizedSender(event)||!Number.isInteger(index)||index<0||index>=subscriptionProfiles.length)
      return {ok:false,message:'Неверный сервер'};
    if(engineSession.status.state!=='stopped')return {ok:false,message:'Сначала отключи движок'};
    chosenDirectProfile=subscriptionProfiles[index];
    return {ok:true,message:'Сервер выбран'};
  });
  ipcMain.handle('vainah:start-engine',async event=>{
    if(!authorizedSender(event))return {ok:false,message:'Доступ запрещён'};
    if(process.platform!=='win32'||(!chosenFile&&!chosenDirectProfile))return {ok:false,message:'Сначала добавь VLESS-ключ или Xray JSON'};
    try{
      if(chosenDirectProfile){
        const result=await engineSession.start(enginePath(),chosenDirectProfile);
        return {ok:result.ok,state:engineSession.status.state,protected:false,
          message:result.ok?'Движок запущен, VPN ещё не подтверждён':'Запуск движка не удался'};
      }
      // Re-open defensively: the selected file may have changed since inspection.
      const stat=await fs.lstat(chosenFile);
      if(!stat.isFile()||stat.size>1024*1024)return {ok:false,message:'Неверный файл'};
      const flags=require('node:fs').constants;
      const handle=await fs.open(chosenFile,flags.O_RDONLY | (flags.O_NOFOLLOW||0));
      let payload;
      try{
        const info=await handle.stat();
        if(!info.isFile()||info.size>1024*1024)return {ok:false,message:'JSON слишком большой'};
        const chunks=[];
        let size=0;
        const buffer=Buffer.alloc(64*1024);
        while(true){
          const {bytesRead}=await handle.read(buffer,0,buffer.length,null);
          if(!bytesRead)break;
          size+=bytesRead;
          if(size>1024*1024)return {ok:false,message:'JSON слишком большой'};
          chunks.push(Buffer.from(buffer.subarray(0,bytesRead)));
        }
        payload=Buffer.concat(chunks).toString('utf8');
        buffer.fill(0);
        for(const chunk of chunks)chunk.fill(0);
      }finally{await handle.close()}
      const checked=await validateWithSingBox(enginePath(),payload);
      if(!checked.ok)return {ok:false,message:'Проверка sing-box не прошла'};
      const result=await engineSession.start(enginePath(),payload);
      return {ok:result.ok,state:engineSession.status.state,protected:false,
        message:result.ok?'Движок запущен, защита VPN ещё не подтверждена':'Не удалось запустить движок'};
    }catch{return {ok:false,message:'Ошибка проверки или запуска VPN-движка'}}
  });
  ipcMain.handle('vainah:stop-engine',async event=>{
    if(!authorizedSender(event))return {ok:false,message:'Доступ запрещён'};
    const result=await engineSession.stop();
    return {ok:result.ok,state:engineSession.status.state,protected:false};
  });
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
      const engineCheck = process.platform==='win32'
        ? await validateWithSingBox(enginePath(),json)
        : {ok:false,reason:'Windows check only'};
      json=null;
      chosenFile=engineCheck.ok ? file : null;
      if(chosenFile)chosenDirectProfile=null;
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
    try{return {ok:openWebsiteInsideApp(url)};}
    catch{return {ok:false}}
  });
  // Electron must wait for the engine to stop before quitting; otherwise its
  // child process can survive with system routes still active.
  let quitCleanupPending=false;
  let quitCleanupDone=false;
  app.on('before-quit',event=>{
    if(quitCleanupDone)return;
    event.preventDefault();
    if(quitCleanupPending)return;
    quitCleanupPending=true;
    void engineSession.stop().then(result=>{
      quitCleanupPending=false;
      if(result.ok){
        quitCleanupDone=true;
        app.quit();
      }else{
        // Keep the UI open when we cannot safely stop the native engine.
        if(mainWindow&&!mainWindow.isDestroyed())mainWindow.show();
      }
    }).catch(()=>{
      quitCleanupPending=false;
      if(mainWindow&&!mainWindow.isDestroyed())mainWindow.show();
    });
  });
  createWindow();
  app.on('activate',()=>{if(BrowserWindow.getAllWindows().length===0)createWindow()});
}).catch(()=>{app.quit()});
app.on('window-all-closed',()=>{if(process.platform!=='darwin')app.quit()});
