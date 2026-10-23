const entries = [
  {id:'30',days:30,title:'1 месяц',kopeks:9900,deviceLimit:3},
  {id:'60',days:60,title:'2 месяца',kopeks:16000,deviceLimit:3},
  {id:'90',days:90,title:'3 месяца',kopeks:21900,deviceLimit:3},
  {id:'180',days:180,title:'6 месяцев',kopeks:33900,deviceLimit:3},
  {id:'365',days:365,title:'1 год',kopeks:70000,deviceLimit:3},
  {id:'365-family',days:365,title:'Семейный тариф на год',kopeks:100000,deviceLimit:6}
];
export function parseRubPrice(input) {
  if (typeof input !== 'string' || !/^[1-9][0-9]{0,5}(?:\.[0-9]{1,2})?$/.test(input)) return null;
  const [a,b='']=input.split('.');
  const kopeks=Number(a)*100+Number(b.padEnd(2,'0'));
  return Number.isSafeInteger(kopeks) ? kopeks : null;
}
export function planCatalog(env=process.env) {
  return entries.map(plan=>({...plan,priceRub:(plan.kopeks/100).toFixed(2)}));
}
export function planById(id,env=process.env) {return planCatalog(env).find(plan=>plan.id===String(id));}
export function checkoutReady(env=process.env) {
  // Deliberate kill-switch: never charge before the DB, merchant and delivery bridge work.
  const required=['DATABASE_URL','ROLLYPAY_API_KEY','ROLLYPAY_SIGNING_SECRET',
    'TELEGRAM_BOT_TOKEN','SESSION_SIGNING_KEY','PANEL_BASE_URL','PANEL_API_TOKEN','PUBLIC_SITE_ORIGIN'];
  // Live checkout stays OFF unless an operator explicitly approves each
  // gate in the server environment after end-to-end tests and merchant review.
  if(env.VAINAH_LIVE_CHECKOUT!=='enabled-after-review' ||
     env.VAINAH_PAYMENT_INTEGRATION_VERIFIED!=='verified-on-production')return false;
  if(!required.every(name=>typeof env[name]==='string'&&env[name].trim()))return false;
  if(env.SESSION_SIGNING_KEY.length<32 || env.ROLLYPAY_SIGNING_SECRET.length<16)return false;
  try{
    const site=new URL(env.PUBLIC_SITE_ORIGIN),panel=new URL(env.PANEL_BASE_URL);
    if(site.protocol!=='https:'||site.origin!==env.PUBLIC_SITE_ORIGIN ||
       site.search||site.hash||site.username||site.password)return false;
    if(panel.protocol!=='https:'||panel.search||panel.hash||
       panel.username||panel.password || !['/','/api','/api/'].includes(panel.pathname))return false;
  }catch{return false}
  return true;
}
