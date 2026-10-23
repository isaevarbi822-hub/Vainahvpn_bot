import test from "node:test";
import assert from "node:assert/strict";
import { watchStatus, WATCH_COMMANDS } from "../native/watches/status-v1.mjs";

test("watch status never transmits subscription URLs, tokens or unknown fields", () => {
  const result = watchStatus({
    phase: "online",
    server: "Oslo",
    verified_browser_egress: false,
    subscriptionUrl: "https://example.invalid/private?token=never-send",
    uuid: "hidden",
    token: "hidden",
    rawNode: "vless://private",
  });
  assert.deepEqual(Object.keys(result), [
    "version", "phase", "server", "tcp_latency_ms", "verified_browser_egress",
  ]);
  assert.equal(result.phase, "tun_ready");
  assert.equal(result.verified_browser_egress, false);
  assert.doesNotMatch(JSON.stringify(result), /never-send|hidden|vless:/);
});

test("invalid server label never leaks a profile URI", () => {
  assert.equal(watchStatus({ server: "vless://secret@node" }).server, "");
  assert.equal(watchStatus({ server: "https://host/?token=secret" }).server, "");
  assert.equal(watchStatus({ server: "  Norway\n" }).server, "Norway");
});

test("online requires independently verified browser egress", () => {
  assert.equal(watchStatus({ phase: "online" }).phase, "tun_ready");
  assert.equal(watchStatus({
    phase: "online", verified_browser_egress: true,
  }).phase, "online");
  assert.equal(watchStatus({
    phase: "starting", verified_browser_egress: true,
  }).verified_browser_egress, false);
});

test("bad phases, latency and payloads fail closed", () => {
  assert.equal(watchStatus(null).phase, "off");
  assert.equal(watchStatus({ phase: "connected" }).phase, "off");
  assert.equal(watchStatus({ tcp_latency_ms: -1 }).tcp_latency_ms, -1);
  assert.equal(watchStatus({ tcp_latency_ms: 61000 }).tcp_latency_ms, -1);
  assert.equal(watchStatus({ tcp_latency_ms: 25.3 }).tcp_latency_ms, -1);
  assert.equal(watchStatus({ tcp_latency_ms: 35 }).tcp_latency_ms, 35);
  assert.ok(Object.isFrozen(watchStatus()));
});

test("watch commands are restricted to phone status and disconnection", () => {
  assert.deepEqual(WATCH_COMMANDS, ["status_request", "disconnect"]);
  assert.ok(!WATCH_COMMANDS.includes("import_subscription"));
});
