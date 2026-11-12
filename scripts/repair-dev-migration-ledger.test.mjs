import {test} from 'node:test';
import assert from 'node:assert/strict';
import {planRecord, planRepair} from './repair-dev-migration-ledger.mjs';
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
test('any timestamp-only alias is repaired, not one hard-coded range',()=>{
 const other='20261111010000_meeting_invitation_visibility_and_agenda_roles';
 assert.deepEqual(planRepair(new Map([[other,hash]]),[{version:'20261111010000',checksum:hash,applied_at:'t'}]),[{from:'20261111010000',to:other,checksum:hash,applied_at:'t'}]);
});
test('seed and canonical rows are never renamed',()=>assert.deepEqual(planRepair(new Map([[name,hash]]),[{version:'seed',checksum:null}]),[]));
test('records only explicitly verified, existing, unrecorded migrations with the file checksum',()=>{
 const source=new Map([[name,hash],['20261112010000_open',hash]]);
 assert.deepEqual(planRecord(source,[],['20261112010000_open']),[{version:'20261112010000_open',checksum:hash}]);
 assert.throws(()=>planRecord(source,[],['20261112090000_missing']),/no source/);
 assert.throws(()=>planRecord(source,[{version:name,checksum:hash}],[name]),/already recorded/);
 assert.throws(()=>planRecord(source,[{version:'20261112010000',checksum:hash}],['20261112010000_open']),/already recorded/);
 assert.throws(()=>planRecord(source,[],['20261112010000']),/canonical/);
});
