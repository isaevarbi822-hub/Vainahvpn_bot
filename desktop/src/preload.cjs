'use strict';
const {contextBridge,ipcRenderer}=require('electron');
/** Safe API: no generic command invocation, token access, filesystem or arbitrary URLs. */
contextBridge.exposeInMainWorld('vainah',{
  getInfo:()=>ipcRenderer.invoke('vainah:info'),
  getPlans:()=>ipcRenderer.invoke('vainah:plans'),
  getBillingStatus:()=>ipcRenderer.invoke('vainah:billing:status'),
  openBillingPlan:id=>ipcRenderer.invoke('vainah:billing:open',id),
  getTunnelStatus:()=>ipcRenderer.invoke('vainah:tunnel'),
  getH1Capabilities:()=>ipcRenderer.invoke('vainah:capabilities'),
  chooseLocalEngine:()=>ipcRenderer.invoke('vainah:engine:choose'),
  getSubscriptionStatus:()=>ipcRenderer.invoke('vainah:subscription:status'),
  saveSubscription:secret=>ipcRenderer.invoke('vainah:subscription:save',secret),
  deleteSubscription:()=>ipcRenderer.invoke('vainah:subscription:clear'),
  startLocalEngine:()=>ipcRenderer.invoke('vainah:engine:start'),
  stopLocalEngine:()=>ipcRenderer.invoke('vainah:engine:stop'),
  testNetworkFamilies:()=>ipcRenderer.invoke('vainah:diagnostics:probe'),
  openOfficialPage:name=>ipcRenderer.invoke('vainah:open-official',name)
});
