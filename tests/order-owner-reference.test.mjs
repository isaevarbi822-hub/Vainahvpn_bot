import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const sql=readFileSync(new URL('../database/migrations/003-order-owner-reference.sql',import.meta.url),'utf8');

test('order owner migration is additive and nullable for legacy orders',()=>{
 assert.match(sql,/ADD COLUMN IF NOT EXISTS owner_id uuid NULL/i);
 assert.match(sql,/FOREIGN KEY \(owner_id\) REFERENCES vpn_account_owners\(id\)/i);
 assert.match(sql,/CREATE INDEX IF NOT EXISTS vpn_orders_owner_history_idx/i);
});
test('order owner migration never rewrites payments or customer ownership',()=>{
 assert.doesNotMatch(sql,/\bUPDATE\s+vpn_orders\b|\bDELETE\s+FROM\s+vpn_orders\b|\bDROP\s+(TABLE|COLUMN)\b/i);
 assert.doesNotMatch(sql,/\bSET\s+owner_id\b|payment_id\s*=/i);
});
