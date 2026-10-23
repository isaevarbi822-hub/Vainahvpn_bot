import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const sql=readFileSync(new URL('../database/migrations/002-customer-identities.sql',import.meta.url),'utf8');

test('identity schema has a unique verified provider subject and stable owner',()=>{
 assert.match(sql,/CREATE TABLE IF NOT EXISTS vpn_account_owners/);
 assert.match(sql,/id uuid PRIMARY KEY/);
 assert.match(sql,/CREATE TABLE IF NOT EXISTS vpn_account_identities/);
 assert.match(sql,/PRIMARY KEY \(provider,subject\)/);
 assert.match(sql,/REFERENCES vpn_account_owners\(id\)/);
 assert.match(sql,/provider IN \('email','telegram'\)/);
});

test('identity migration cannot change legacy orders or enable charges',()=>{
 assert.doesNotMatch(sql,/ALTER TABLE\s+vpn_orders|UPDATE\s+vpn_orders|DELETE\s+FROM\s+vpn_orders|DROP TABLE/i);
 assert.doesNotMatch(sql,/rollypay|payment_url|VAINAH_LIVE_CHECKOUT/i);
});
