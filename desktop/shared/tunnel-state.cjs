'use strict';

/**
 * Pure state coordinator. This is NOT a VPN engine.
 * A real native transport must be independently audited and integrated.
 * Never infer packet protection from a button press, OS permission, or a profile.
 */
const STATES=Object.freeze(['unavailable','disconnected','connecting','connected','reconnecting','disconnecting','error']);
const MAX_REASON=120;
function cleanReason(reason){
  if(typeof reason!=='string')return 'Неизвестная ошибка подключения';
  const safe=reason.replace(/[\r\n\t\x00-\x1f\x7f]/g,' ').trim();
  // Do not allow URLs, tokens, private credentials or arbitrary engine messages into UI/logs.
  if(!safe||/https?:\/\/|vless:\/\/|token|secret|password|key=|bearer/i.test(safe))
    return 'Не удалось установить защищённое соединение';
  return safe.slice(0,MAX_REASON);
}
class TunnelState {
  #state='unavailable';
  #session=0;
  #reason='';
  constructor({engineAvailable=false}={}){
    if(engineAvailable===true)this.#state='disconnected';
  }
  get status(){
    const state=this.#state;
    return Object.freeze({
      state,
      protected:state==='connected',
      reason:this.#reason,
      session:this.#session
    });
  }
  begin(){
    if(this.#state!=='disconnected'&&this.#state!=='error')
      return null;
    this.#reason='';
    this.#state='connecting';
    return ++this.#session;
  }
  // Only call this after the NATIVE transport confirms packet forwarding,
  // working encrypted upstream, and validated routing/DNS/IPv6 policies.
  verifiedOnline(session,proof){
    if(this.#state!=='connecting'&&this.#state!=='reconnecting')return false;
    if(session!==this.#session||!proof||proof.upstreamEncrypted!==true||
       proof.packetsForwarded!==true||proof.routesVerified!==true||
       proof.dnsVerified!==true||proof.ipv6PolicyVerified!==true)return false;
    this.#state='connected';
    this.#reason='';
    return true;
  }
  linkLost(session){
    if(session!==this.#session||this.#state!=='connected')return false;
    this.#state='reconnecting';
    return true;
  }
  fail(session,reason){
    if(session!==this.#session||!['connecting','connected','reconnecting','disconnecting'].includes(this.#state))return false;
    this.#state='error';
    this.#reason=cleanReason(reason);
    return true;
  }
  disconnect(){
    if(this.#state==='unavailable'||this.#state==='disconnected')return null;
    this.#state='disconnecting';
    // Revokes stale asynchronous connection acknowledgements immediately.
    return ++this.#session;
  }
  stopped(session){
    if(session!==this.#session||this.#state!=='disconnecting')return false;
    this.#state='disconnected';
    this.#reason='';
    return true;
  }
}
module.exports={TunnelState,STATES,cleanReason};
