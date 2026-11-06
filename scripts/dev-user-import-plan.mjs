export function normalizeCouncilName(value) {
  return value.normalize('NFKC').replace(/[أإآ]/g,'ا').replace(/\s+/g,' ').trim();
}
export function planMemberships(source, targets, aliases={}) {
  const planned=[], unresolved=[];
  for(const m of source) {
    if(m.unit_name==='test' || !['council_chair','council_rapporteur','council_member'].includes(m.role_code) || m.membership_status!=='active') continue;
    if(m.end_date && m.end_date<new Date().toISOString().slice(0,10)) continue;
    const matches=targets.filter(t=>t.status!=='archived' && normalizeCouncilName(t.name_ar)===normalizeCouncilName(aliases[m.unit_name]??m.unit_name));
    if(matches.length!==1) unresolved.push({...m,reason:matches.length?'ambiguous':'missing'});
    else planned.push({...m,target_unit_id:matches[0].id});
  }
  return {planned,unresolved};
}
