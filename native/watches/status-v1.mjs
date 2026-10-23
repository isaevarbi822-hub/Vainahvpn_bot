/**
 * Vainah VPN watch companion protocol v1.
 * Only credential-free status may cross to a paired watch.
 * This is NOT a VPN engine and does not enable VPN on either watch.
 */
const PHASES = new Set(["off", "starting", "tun_ready", "online", "failed"]);
const MAX_SERVER = 80;

function safeLabel(label) {
  if (typeof label !== "string") return "";
  const clean = label.replace(/[\u0000-\u001f\u007f]/g, "").trim();
  // An accidentally passed profile URI/URL must never reach a smartwatch.
  if (/[:][/][/]|[@?#]/.test(clean)) return "";
  return Array.from(clean).slice(0, MAX_SERVER).join("");
}

/**
 * Produce an allowlisted status payload. Unknown keys (URL, token, UUID,
 * subscriber data, IP, purchase history) are deliberately NOT transferred.
 * A self-probe alone does not establish user traffic protection.
 */
export function watchStatus(snapshot = {}) {
  const source = snapshot && typeof snapshot === "object" ? snapshot : {};
  const rawPhase = PHASES.has(source.phase) ? source.phase : "off";
  const proof = source.verified_browser_egress === true && rawPhase === "online";
  return Object.freeze({
    version: 1,
    phase: rawPhase === "online" && !proof ? "tun_ready" : rawPhase,
    server: safeLabel(source.server),
    tcp_latency_ms: Number.isInteger(source.tcp_latency_ms) &&
      source.tcp_latency_ms >= 0 && source.tcp_latency_ms <= 60000
      ? source.tcp_latency_ms : -1,
    verified_browser_egress: proof,
  });
}

/** Commands must be authorized and fulfilled by the *paired phone*.
 * Watches must never receive private VPN profiles or pretend to own a TUN.
 */
export const WATCH_COMMANDS = Object.freeze(["status_request", "disconnect"]);
