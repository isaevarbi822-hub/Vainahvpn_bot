'use strict';
const {contextBridge,ipcRenderer}=require('electron');
/** Safe API: no generic command invocation, token access, filesystem or arbitrary URLs. */
contextBridge.exposeInMainWorld('vainah',{
  getInfo:()=>ipcRenderer.invoke('vainah:info'),
  getPlans:()=>ipcRenderer.invoke('vainah:plans'),
  getCheckoutReadiness:()=>ipcRenderer.invoke('vainah:checkout-readiness'),
  openNetworkTest:name=>ipcRenderer.invoke('vainah:open-network-test',name),
  getTunnelStatus:()=>ipcRenderer.invoke('vainah:tunnel'),
  startEngine:()=>ipcRenderer.invoke('vainah:start-engine'),
  stopEngine:()=>ipcRenderer.invoke('vainah:stop-engine'),
  inspectXrayFile:()=>ipcRenderer.invoke('vainah:inspect-xray-file'),
  importVlessLink:link=>ipcRenderer.invoke('vainah:import-vless-link',link),
  importHttpsSubscription:link=>ipcRenderer.invoke('vainah:import-https-subscription',link),
  selectSubscriptionServer:index=>ipcRenderer.invoke('vainah:select-subscription-server',index),
  getSubscriptionServers:()=>ipcRenderer.invoke('vainah:subscription-servers'),
  openOfficialPage:name=>ipcRenderer.invoke('vainah:open-official',name)
});
