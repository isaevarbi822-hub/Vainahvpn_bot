import {json} from './lib/security.mjs';
import {readH1ClientStatus,H1StatusError} from './lib/h1-readonly.mjs';

// Deliberately not a real subscriber. The probe only checks HTTPS connectivity
// and that the H1 panel accepts our configured bearer token.
// No client data or private panel fields are returned to callers.
const PROBE_ID='999999999999999999';

export async function inspectH1Panel(options={}) {
  try{
    const result=await readH1ClientStatus(PROBE_ID,options);
    if(result.panelReady===true)return {ok:true,panel:'reachable',authentication:'accepted'};
    return {ok:false,panel:'not_configured'};
  }catch(error){
    if(error instanceof H1StatusError && error.code==='PANEL_UNAUTHORIZED')
      return {ok:false,panel:'reachable',authentication:'rejected'};
    if(error instanceof H1StatusError && /^(PANEL_URL_INVALID|PANEL_PREFIX_INVALID)$/.test(error.code))
      return {ok:false,panel:'invalid_configuration'};
    // Only return fixed diagnostic labels, never upstream responses or tokens.
    const reasons={
      PANEL_UNREACHABLE:'connection_failed',
      PANEL_SERVER_ERROR:'server_error',
      PANEL_RATE_LIMITED:'rate_limited',
      PANEL_INVALID_RESPONSE:'invalid_response',
      PANEL_API_ERROR:'api_error'
    };
    const reason=error instanceof H1StatusError?reasons[error.code]:null;
    return {ok:false,panel:'unavailable',reason:reason||'unknown_error'};
  }
}

export default async function handler(request){
  if(request.method!=='GET')return json({error:'Method not allowed'},405);
  const status=await inspectH1Panel();
  return json(status,status.ok?200:503);
}
