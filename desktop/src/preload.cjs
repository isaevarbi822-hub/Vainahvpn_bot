'use strict';
const {contextBridge,ipcRenderer}=require('electron');
/** Safe API: no generic command invocation, token access, filesystem or arbitrary URLs. */
contextBridge.exposeInMainWorld('vainah',{
  getInfo:()=>ipcRenderer.invoke('vainah:info'),
  getPlans:()=>ipcRenderer.invoke('vainah:plans'),
  getTunnelStatus:()=>ipcRenderer.invoke('vainah:tunnel'),
  getH1Capabilities:()=>ipcRenderer.invoke('vainah:capabilities'),
  chooseLocalEngine:()=>ipcRenderer.invoke('vainah:engine:choose'),
  startLocalEngine:secret=>ipcRenderer.invoke('vainah:engine:start',secret),
  stopLocalEngine:()=>ipcRenderer.invoke('vainah:engine:stop'),
  openOfficialPage:name=>ipcRenderer.invoke('vainah:open-official',name)
});
