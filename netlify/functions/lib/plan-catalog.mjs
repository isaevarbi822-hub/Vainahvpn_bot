const entries = [
  {id:'30',days:30,title:'1 месяц',env:'VAINAH_PRICE_30_RUB'},
  {id:'90',days:90,title:'3 месяца',env:'VAINAH_PRICE_90_RUB'},
  {id:'365',days:365,title:'12 месяцев',env:'VAINAH_PRICE_365_RUB'}
];
export function parseRubPrice(input) {
  if (typeof input !== 'string' || !/^[1-9][0-9]{0,5}(?:\.[0-9]{1,2})?$/.test(input)) return null;
  const [a,b='']=input.split('.');
  const kopeks=Number(a)*100+Number(b.padEnd(2,'0'));
  return Number.isSafeInteger(kopeks) ? kopeks : null;
}
export function planCatalog(env=process.env) {
  return entries.map(({env:key,...plan})=>{
    const kopeks=parseRubPrice(env[key]);
    return {...plan,priceRub:kopeks===null?null:(kopeks/100).toFixed(2),kopeks};
  });
}
export function planById(id,env=process.env) {return planCatalog(env).find(plan=>plan.id===String(id));}
export function checkoutReady(env=process.env) {
  // Deliberate kill-switch: never charge before the DB, merchant and delivery bridge work.
  const required=['DATABASE_URL','ROLLYPAY_API_KEY','ROLLYPAY_SIGNING_SECRET',
    'TELEGRAM_BOT_TOKEN','SESSION_SIGNING_KEY','PANEL_BASE_URL','PANEL_API_TOKEN','PANEL_INBOUND_IDS','PUBLIC_SITE_ORIGIN'];
  return env.VAINAH_LIVE_CHECKOUT==='enabled-after-review' && env.PANEL_CLIENT_MAPPING_VERIFIED==='true' && required.every(key=>Boolean(env[key])) && planCatalog(env).every(p=>p.kopeks!==null);
}
