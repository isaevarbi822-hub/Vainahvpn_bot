'use strict';
/** Allowlist: renderer cannot cause arbitrary URLs, custom schemes or local files to open. */
const SITE = 'https://vainahvpnbot0.netlify.app';
const pages = Object.freeze({
  account: SITE+'/account.html',
  plans: SITE+'/plans.html',
  compare: SITE+'/compare.html',
  devices: SITE+'/device-center.html',
  help: SITE+'/help.html',
  diagnostics: SITE+'/diagnostics.html',
  security: SITE+'/security.html',
  status: SITE+'/status.html',
  home: SITE+'/index.html',
});
function safePage(name) {
  return typeof name==='string'&&Object.prototype.hasOwnProperty.call(pages,name)
    ? pages[name] : null;
}
module.exports = {SITE,pages,safePage};
