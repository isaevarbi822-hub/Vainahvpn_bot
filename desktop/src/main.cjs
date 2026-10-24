'use strict';
const path = require('node:path');
const fs = require('node:fs/promises');
const { parseXrayProfiles } = require('../shared/xray-profiles.cjs');
const { vlessUriToXray } = require('../shared/vless-link.cjs');
const { fetchSubscription } = require('../shared/https-subscription.cjs');
const { normalizeVpnLink } = require('../shared/clipboard-link.cjs');
const { saveSubscription, loadSubscription, clearSubscription } = require('../shared/subscription-store.cjs');
const { reconcileSubscriptionSelection } = require('../shared/subscription-reconcile.cjs');
const { subscriptionErrorMessage, subscriptionDiagnosticCode } = require('../shared/subscription-error.cjs');
const { validateWithSingBox } = require('../shared/singbox-runtime.cjs');
const { SingBoxSession } = require('../shared/singbox-session.cjs');
const { app, BrowserWindow, ipcMain, session, shell, Menu, dialog, clipboard, safeStorage } = require('electron');
const { safePage } = require('../shared/official.cjs');
const { plans } = require('../shared/catalog.cjs');
const { safeServerLabel } = require('../shared/server-label.cjs');
const { diagnosticPage } = require('../shared/diagnostic-pages.cjs');
const { readCheckoutStatus } = require('../shared/checkout-status.cjs');
const { checkTunDependencies } = require('../shared/windows-tun-dependencies.cjs');
const { fetchTrace, compareEgress } = require('../shared/egress-check.cjs');
const crypto = require('node:crypto');

let mainWindow;
const engineSession = new SingBoxSession();
const probeSalt = crypto.randomBytes(24).toString('hex');
let physicalEgress = null;
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
    if(!trustedSiteNavigation(target)){event.preventDefault();return;}
    // Telegram OIDC authorisation leaves our origin. Do not try to complete it
    // inside an embedded Chromium window with the redirect blocked.
    if(new URL(target).pathname==='/account.html'){
      event.preventDefault();
      void shell.openExternal(safePage('account')).catch(()=>{});
    }
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
let subscriptionUrl = null;
let subscriptionGeneration = 0;
let subscriptionRefreshBusy = false;
let subscriptionRestoreBusy = false;
let subscriptionRestoreError = '';
// Serialize disk writes so deleting a subscription cannot race with a save.
let storeWrites = Promise.resolve();
function withStoreLock(action){
  const result=storeWrites.catch(()=>{}).then(action);
  storeWrites=result.catch(()=>{});
  return result;
}
async function rememberSubscription(type,uri){
  if(process.platform!=='win32')return false;
  return withStoreLock(()=>saveSubscription({type,uri},{
    root:app.getPath('userData'),safeStorage
  }));
}
async function forgetSubscription(){
  if(process.platform!=='win32')return true;
  return withStoreLock(()=>clearSubscription({
    root:app.getPath('userData')
  }));
}
async function restorePreviousSubscription(){
  if(process.platform!=='win32'||subscriptionRestoreBusy)return;
  const generation=subscriptionGeneration;
  subscriptionRestoreBusy=true;
  subscriptionRestoreError='';
  try{
    const saved=await loadSubscription({root:app.getPath('userData'),safeStorage});
    if(!saved||subscriptionGeneration!==generation||
       engineSession.status.state!=='stopped'||chosenFile||chosenDirectProfile)return;
    let profiles;
    if(saved.type==='vless')profiles=[vlessUriToXray(saved.uri)];
    else profiles=(await fetchSubscription(saved.uri)).profiles;
    if(subscriptionGeneration!==generation||
       engineSession.status.state!=='stopped'||chosenFile||chosenDirectProfile)return;
    if(!Array.isArray(profiles)||!profiles.length)return;
    subscriptionUrl=saved.type==='https'?saved.uri:null;
    subscriptionProfiles=profiles;
    chosenDirectProfile=profiles[0];
    subscriptionGeneration++;
  }catch{
    if(subscriptionGeneration===generation)
      subscriptionRestoreError='Подписка сохранена, но пока не удалось получить серверы. Проверь доступность H1Cloud и повторно добавь ссылку.';
  }finally{subscriptionRestoreBusy=false}
}
async function refreshSubscribedServers() {
  if(subscriptionRefreshBusy || !subscriptionUrl ||
     engineSession.status.state!=='stopped')return;
  subscriptionRefreshBusy=true;
  const url=subscriptionUrl, generation=subscriptionGeneration;
  try{
    const latest=await fetchSubscription(url);
    if(subscriptionGeneration!==generation || subscriptionUrl!==url ||
       engineSession.status.state!=='stopped')return;
    const previous=chosenDirectProfile;
    subscriptionProfiles=latest.profiles;
    // If a client UUID or REALITY key rotates for the same server, retain
    // the user's selected location. Never silently switch countries.
    chosenDirectProfile=reconcileSubscriptionSelection(previous,latest.profiles);
    chosenFile=null;
  }catch{
    // Preserve last-known-good servers on provider or network failures.
  }finally{subscriptionRefreshBusy=false}
}
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
  // Electron has no default text-field context menu in a custom window.
  // Show only native editing roles for actual editable controls.
  mainWindow.webContents.on('context-menu', (_event,params)=>{
    if(!params.isEditable||mainWindow.isDestroyed())return;
    const edit=Menu.buildFromTemplate([
      {role:'undo'}, {role:'redo'}, {type:'separator'},
      {role:'cut'}, {role:'copy'}, {role:'paste'},
      {type:'separator'}, {role:'selectAll'}
    ]);
    edit.popup({window:mainWindow});
  });
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
  // Keep native edit accelerators (Ctrl+V/C/X/A). Removing the whole menu
  // caused text-entry shortcuts to be unreliable in packaged Windows builds.
  // The top menu remains auto-hidden until Alt is pressed.
  Menu.setApplicationMenu(Menu.buildFromTemplate([
    {label:'Правка',submenu:[
      {role:'undo'}, {role:'redo'}, {type:'separator'},
      {role:'cut'}, {role:'copy'}, {role:'paste'},
      {type:'separator'}, {role:'selectAll'}
    ]}
  ]));
  session.defaultSession.setPermissionRequestHandler((_wc,_permission,callback)=>callback(false));
  session.defaultSession.setPermissionCheckHandler(()=>false);
  ipcMain.handle('vainah:info',event=>authorizedSender(event)?{
    platform:process.platform,
    version:app.getVersion(),
    preview:true
  }:null);
  ipcMain.handle('vainah:plans',event=>authorizedSender(event)?plans:[]);
  // Deliberate user action on the local "Paste from clipboard" button.
  // Only a bounded VPN URI is returned to its own sandboxed renderer; no
  // clipboard monitor, persistence, analytics, or unsafe generic IPC.
  ipcMain.handle('vainah:paste-vpn-link',event=>{
    if(!authorizedSender(event))return {ok:false,message:'Доступ запрещён'};
    try{
      const link=normalizeVpnLink(clipboard.readText());
      if(!link)return {ok:false,message:
        'В буфере нет полной HTTPS-подписки или vless:// ссылки. Скопируй её заново.'};
      return {ok:true,link};
    }catch{
      return {ok:false,message:'Windows не дал прочитать буфер обмена. Попробуй Ctrl+V.'};
    }
  });
  ipcMain.handle('vainah:open-network-test',async (event,name)=>{
    if(!authorizedSender(event))return {ok:false};
    const target=diagnosticPage(name);
    if(!target)return {ok:false};
    // The system browser performs this independent of Electron's own
    // network probes. The user explicitly chooses the diagnostic site.
    try { await shell.openExternal(target); return {ok:true}; }
    catch { return {ok:false}; }
  });
  ipcMain.handle('vainah:checkout-readiness',async event=>{
    if(!authorizedSender(event))return {ready:false,catalogMatches:false};
    // Read-only check. No invoice, no payment API, no secret merchant keys.
    return readCheckoutStatus();
  });
  ipcMain.handle('vainah:test-egress',async event=>{
    if(!authorizedSender(event))return {status:'unavailable',protected:false};
    if(engineSession.status.state!=='running-unverified')
      return {status:'engine_off',protected:false};
    // The OS should route this fresh request through TUN. A changed public
    // IP is useful evidence, not proof of leak-free packet forwarding.
    const viaTunnel=await fetchTrace({salt:probeSalt});
    if(engineSession.status.state!=='running-unverified')
      return {status:'engine_off',protected:false};
    return compareEgress(physicalEgress,viaTunnel);
  });
  ipcMain.handle('vainah:tunnel',event=>authorizedSender(event)?{
    ...PREVIEW_STATUS,
    state: engineSession.status.state,
    reason: engineSession.status.reason,
    explanation: engineSession.status.state==='running-unverified'
      ? 'Движок запущен, но защита трафика НЕ подтверждена. Это тестовый режим.'
      : PREVIEW_STATUS.explanation
  }:null);
  ipcMain.handle('vainah:import-vless-link',async(event,link)=>{
    if(!authorizedSender(event))return {ok:false,message:'Доступ запрещён'};
    if(engineSession.status.state!=='stopped')return {ok:false,message:'Сначала отключи VPN-движок перед заменой подписки'};
    const generation=++subscriptionGeneration;
    const normalized=normalizeVpnLink(link);
    let profile;
    try{
      profile=vlessUriToXray(normalized);
    }catch{
      return {ok:false,message:'Ссылка прочитана, но нужен действительный vless:// ключ с TCP/RAW + REALITY'};
    }
    // Parsing an offline key must not depend on sing-box being installed.
    // Starting a tunnel still requires a successful engine validation.
    const checked=process.platform==='win32'
      ?await validateWithSingBox(enginePath(),profile)
      :{ok:false,reason:'Windows engine only'};
    if(generation!==subscriptionGeneration||engineSession.status.state!=='stopped')
      return {ok:false,message:'Подписка изменилась. Повтори импорт.'};
    subscriptionUrl=null;
    subscriptionProfiles=[profile];
    chosenDirectProfile=profile;
    chosenFile=null;
    const saved=await rememberSubscription('vless',normalized);
    return {ok:true,validated:checked.ok===true,saved,
      message:(checked.ok
        ?'VLESS-ключ импортирован и прошёл проверку sing-box.'
        :'VLESS-ключ корректен и добавлен. Проверка движком пока недоступна; VPN ещё не подключён.')+
        (saved?' Подписка защищённо сохранена для следующего запуска.':
        ' Подписка работает до закрытия приложения; защищённое сохранение недоступно.')};
  });
  ipcMain.handle('vainah:import-https-subscription',async(event,link)=>{
    if(!authorizedSender(event))return {ok:false,message:'Доступ запрещён'};
    if(engineSession.status.state!=='stopped')return {ok:false,message:'Сначала отключи VPN-движок перед заменой подписки'};
    try{
      const generation=++subscriptionGeneration;
      const normalized=normalizeVpnLink(link);
      if(!normalized||!/^https:\/\//i.test(normalized))
        return {ok:false,message:'Вставь действительную HTTPS-ссылку подписки.'};
      const result=await fetchSubscription(normalized);
      if(generation!==subscriptionGeneration || engineSession.status.state!=='stopped')
        return {ok:false,message:'Подписка изменилась, повтори обновление'};
      subscriptionUrl=normalized;
      subscriptionProfiles=result.profiles;
      chosenDirectProfile=result.profiles[0];
      chosenFile=null;
      subscriptionRestoreError='';
      const saved=await rememberSubscription('https',normalized);
      return {ok:true,count:result.count,saved,
        message:'Подписка загружена. Поддерживаемых серверов: '+result.count+
          '. Для тестового запуска выбран первый.'+
          (saved?' Подписка защищённо сохранена для следующего запуска.':
          ' Подписка работает до закрытия приложения; защищённое сохранение недоступно.')};
    }catch(error){
      const message=subscriptionErrorMessage(error);
      const diagnostic=subscriptionDiagnosticCode(error);
      // A fixed allowlisted code only: never return raw URLs, hostnames,
      // stack traces or Node error messages to the renderer.
      return {ok:false,message,diagnostic};
    }
  });
  ipcMain.handle('vainah:subscription-servers',event=>{
    if(!authorizedSender(event))return {ok:false,servers:[]};
    return {ok:true,restoring:subscriptionRestoreBusy,
      restoreError:subscriptionRestoreError,
      servers:subscriptionProfiles.map((profile,index)=>({
      index,
      label:safeServerLabel(profile,index),
      selected:chosenDirectProfile===profile
    }))};
  });
  ipcMain.handle('vainah:forget-subscription',async event=>{
    if(!authorizedSender(event))return {ok:false,message:'Доступ запрещён'};
    if(engineSession.status.state!=='stopped')
      return {ok:false,message:'Останови VPN-движок перед удалением подписки.'};
    subscriptionGeneration++;
    const erased=await forgetSubscription();
    if(!erased)return {ok:false,message:'Не удалось удалить защищённые данные из Windows.'};
    subscriptionProfiles=[];
    subscriptionUrl=null;
    chosenDirectProfile=null;
    chosenFile=null;
    subscriptionRestoreError='';
    return {ok:true,message:'Подписка удалена с этого компьютера. VPN не подключён.'};
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
    // Capture the old public exit before TUN starts, for explicit on-demand
    // diagnostics only. Never store the public IP or send it to renderer.
    physicalEgress = await fetchTrace({salt:probeSalt});
    // Never attempt to modify system routes when the native TUN driver
    // is absent. No driver is downloaded at runtime.
    const prerequisites = await checkTunDependencies(enginePath());
    if(!prerequisites.ok)return {ok:false,protected:false,
      message:'Не найден проверенный Wintun в составе приложения. VPN не запускается.'};
    try{
      if(chosenDirectProfile){
        // Validate imported HTTPS/VLESS profiles before touching TUN or routes.
        const checked=await validateWithSingBox(enginePath(),chosenDirectProfile);
        if(!checked.ok)return {ok:false,protected:false,
          message:'Не удалось проверить конфигурацию sing-box. VPN не запущен.'};
        const result=await engineSession.start(enginePath(),chosenDirectProfile);
        return {ok:result.ok,state:engineSession.status.state,protected:false,
          message:result.ok?'Движок запущен, VPN ещё не подтверждён':(result.reason||'Запуск движка не удался')};
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
        message:result.ok?'Движок запущен, защита VPN ещё не подтверждена':(result.reason||'Не удалось запустить движок')};
    }catch{return {ok:false,message:'Ошибка проверки или запуска VPN-движка'}}
  });
  ipcMain.handle('vainah:stop-engine',async event=>{
    if(!authorizedSender(event))return {ok:false,message:'Доступ запрещён'};
    const result=await engineSession.stop();
    physicalEgress = null;
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
      if(chosenFile){
        subscriptionGeneration++;
        subscriptionUrl=null;
        chosenDirectProfile=null;
        // A locally selected JSON profile supersedes the older saved URL.
        // Do not unexpectedly resurrect an obsolete H1 profile next launch.
        await forgetSubscription();
      }
      return {ok:true,profiles,engineCheck};
    } catch {
      // Never expose file paths, secrets, or raw parser/OS errors.
      return {ok:false,message:'Не удалось прочитать Xray JSON. Проверь формат файла.'};
    }
  });
  ipcMain.handle('vainah:open-official',async(event,name)=>{
    if(!authorizedSender(event))return {ok:false};
    const url=safePage(name);
    if(!url || !trustedSiteNavigation(url))return {ok:false};
    try{
      // Only the pre-approved account URL may open externally, via a direct
      // user click. System browser handles Telegram OpenID Connect correctly.
      if(name==='account'){
        await shell.openExternal(url);
        return {ok:true};
      }
      return {ok:openWebsiteInsideApp(url)};
    }catch{return {ok:false}}
  });
  const subscriptionTimer=setInterval(()=>{void refreshSubscribedServers()},5*60*1000);
  subscriptionTimer.unref?.();
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
  void restorePreviousSubscription();
  app.on('activate',()=>{if(BrowserWindow.getAllWindows().length===0)createWindow()});
}).catch(()=>{app.quit()});
app.on('window-all-closed',()=>{if(process.platform!=='darwin')app.quit()});
