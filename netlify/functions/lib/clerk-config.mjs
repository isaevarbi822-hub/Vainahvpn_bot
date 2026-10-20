/** Production-only configuration gate for third-party Clerk auth. */
export function clerkReady(env,requestUrl){
  try{
    const expected=new URL(env.PUBLIC_SITE_ORIGIN).origin;
    if(!expected.startsWith('https://')||new URL(requestUrl).origin!==expected)return false;
    const pk=env.CLERK_PUBLISHABLE_KEY||'',sk=env.CLERK_SECRET_KEY||'';
    return /^pk_live_[A-Za-z0-9_-]{25,}$/.test(pk)&&/^sk_live_[A-Za-z0-9_-]{25,}$/.test(sk);
  }catch{return false}
}
export function clerkPublicConfig(env,requestUrl){
  if(!clerkReady(env,requestUrl))return {enabled:false};
  return {enabled:true,publishableKey:env.CLERK_PUBLISHABLE_KEY};
}
