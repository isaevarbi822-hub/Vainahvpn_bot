import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const sql=readFileSync(new URL('../database/migrations/005-owner-entitlements.sql',import.meta.url),'utf8');
test('Clerk owner entitlements are owner-scoped and keep H1 mapping unique',()=>{
 assert.match(sql,/CREATE TABLE IF NOT EXISTS vpn_owner_entitlements/);
 assert.match(sql,/owner_id uuid PRIMARY KEY REFERENCES vpn_account_owners\(id\)/);
 assert.match(sql,/CREATE TABLE IF NOT EXISTS vpn_owner_h1_clients/);
 assert.match(sql,/client_name text NOT NULL UNIQUE/);
 assert.match(sql,/CHECK \(device_limit IN \(3,6\)\)/);
});
test('owner ledger migration never touches existing Telegram purchases or enables billing',()=>{
 assert.doesNotMatch(sql,/\b(ALTER|UPDATE|DELETE|DROP)\s+(TABLE\s+)?vpn_(orders|customers|entitlements)\b/i);
 assert.doesNotMatch(sql,/\bINSERT\s+INTO\s+vpn_orders\b|\bVAINAH_LIVE_CHECKOUT\s*=/i);
});
