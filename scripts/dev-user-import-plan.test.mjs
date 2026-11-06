import {test} from 'node:test';
import assert from 'node:assert/strict';
import {planMemberships} from './dev-user-import-plan.mjs';
const member={id:'m',role_code:'council_member',membership_status:'active',unit_name:'مجلس الأمناء',end_date:null};
test('matches spelling normalization but never guesses renamed departments',()=>{
 assert.equal(planMemberships([member],[{id:'1',name_ar:'مجلس الامناء',status:'inactive'}]).planned[0].target_unit_id,'1');
 assert.equal(planMemberships([{...member,unit_name:'مجلس قسم الطب والجراحة العامة'}],[{id:'2',name_ar:'مجلس قسم طب وجراحة الفم والأسنان',status:'inactive'}]).unresolved.length,1);
});
test('rejects ambiguity and archived targets',()=>{
 assert.equal(planMemberships([member],[{id:'1',name_ar:'مجلس الأمناء',status:'archived'}]).unresolved.length,1);
 assert.equal(planMemberships([member],[{id:'1',name_ar:'مجلس الأمناء'},{id:'2',name_ar:'مجلس الامناء'}]).unresolved[0].reason,'ambiguous');
});
test('does not import ended memberships or global privileges',()=>{
 assert.equal(planMemberships([{...member,membership_status:'ended'},{...member,end_date:'2020-01-01'},{...member,role_code:'governance_admin'}],[]).unresolved.length,0);
});
test('only an explicitly approved alias may match a renamed council',()=>{
 const source=[{...member,unit_name:'مجلس قسم المختبرات الطبية'}],target=[{id:'1',name_ar:'مجلس قسم المختبرات',status:'inactive'}];
 assert.equal(planMemberships(source,target).unresolved.length,1);
 assert.equal(planMemberships(source,target,{'مجلس قسم المختبرات الطبية':'مجلس قسم المختبرات'}).planned.length,1);
 assert.equal(planMemberships([{...member,unit_name:'test'}],[]).unresolved.length,0);
});
