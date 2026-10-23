'use strict';
// Native UI may show a human-readable tag, never a VLESS URL/UUID/node IP.
function safeServerLabel(profile,index){
  const raw=profile?.outbounds?.find(x=>x?.protocol==='vless')?.tag;
  const value=typeof raw==='string'?raw.trim():'';
  if(value.length>0&&value.length<=80&&!/[\x00-\x1f\x7f@?#]/.test(value)&&
    !value.includes('://')&&!/^[0-9a-f:.\[\]]+$/i.test(value)&&
    !/^[0-9a-f]{8}-[0-9a-f-]{27,}$/i.test(value))
    return value;
  return 'Сервер '+(index+1)+' · VLESS REALITY';
}
module.exports={safeServerLabel};
