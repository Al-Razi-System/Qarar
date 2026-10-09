import {test} from 'node:test';
import assert from 'node:assert/strict';
import {planRepair} from './repair-dev-migration-ledger.mjs';
const name='20261008020000_topic_type_authoring_requirements';
const hash='a'.repeat(64);
test('rename only proven alias with original timestamp and checksum',()=>{
 assert.deepEqual(planRepair(new Map([[name,hash]]),[{version:'20261008020000',checksum:hash,applied_at:'old'}]),[{from:'20261008020000',to:name,checksum:hash,applied_at:'old'}]);
});
test('canonical ledger is idempotent',()=>assert.deepEqual(planRepair(new Map([[name,hash]]),[{version:name,checksum:hash}]),[]));
test('never attest a differing or missing checksum',()=>{
 for(const checksum of ['', 'b'.repeat(64)])assert.throws(()=>planRepair(new Map([[name,hash]]),[{version:'20261008020000',checksum}]),/checksum/);
});
test('reject ambiguity and canonical collision',()=>{
 assert.throws(()=>planRepair(new Map([[name,hash],[name+'_other',hash]]),[{version:'20261008020000',checksum:hash}]),/ambiguous/);
 assert.throws(()=>planRepair(new Map([[name,hash]]),[{version:'20261008020000',checksum:hash},{version:name,checksum:hash}]),/collision/);
});
test('unrelated aliases are outside the repair scope',()=>assert.deepEqual(planRepair(new Map([['20261009000000_other',hash]]),[{version:'20261009000000',checksum:hash}]),[]));
