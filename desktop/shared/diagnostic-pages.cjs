'use strict';
/**
 * ONLY static public endpoints can be opened by a renderer IPC action.
 * External sites see the tester's public IP; the UI discloses this.
 */
const routes=Object.freeze({
  ip:'https://www.cloudflare.com/cdn-cgi/trace',
  dns:'https://www.dnsleaktest.com/',
  ipv6:'https://test-ipv6.com/'
});
function diagnosticPage(name){
  return typeof name==='string'&&Object.prototype.hasOwnProperty.call(routes,name)
    ? routes[name] : null;
}
module.exports={diagnosticPage};
