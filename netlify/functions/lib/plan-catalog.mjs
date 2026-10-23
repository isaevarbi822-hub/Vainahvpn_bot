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
export function checkoutPrerequisites(env=process.env) {
  // Public result intentionally contains only readiness booleans, never keys.
  const present = key => typeof env[key]==='string' && env[key].trim().length>0;
  return Object.freeze({
    database:present('DATABASE_URL'),
    rollypay:present('ROLLYPAY_API_KEY')&&present('ROLLYPAY_SIGNING_SECRET'),
    panel:present('PANEL_BASE_URL')&&present('PANEL_API_TOKEN'),
    site:present('PUBLIC_SITE_ORIGIN'),
    session:present('SESSION_SIGNING_KEY'),
    telegram:present('TELEGRAM_BOT_TOKEN'),
    // A Clerk secret alone does not establish a verified session integration.
    clerkIntegrated:false,
    migrationsVerified:false,
    deliveryVerified:false,
    liveReviewed:false
  });
}
export function checkoutReady(env=process.env) {
  // Live payments remain disabled until verified auth, migrations and delivery.
  return false;
}
