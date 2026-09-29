'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { registerPartnerApplicationRoutes } = require('../server/routes/partner/applications');

function harness({ failInsert=false }={}) {
  let handler; const queries=[]; let released=false; let notified=false;
  const app={post:(path,fn)=>{assert.equal(path,'/partner/apply');handler=fn;}};
  const client={query:async(sql,args=[])=>{
    queries.push({sql:String(sql),args});
    if (failInsert && String(sql).includes('INSERT INTO public.partner_applications')) throw new Error('db fail');
    if (String(sql).includes('INSERT INTO public.partner_applications')) return {rows:[{id:7,application_code:'CWF-P-1',full_name:'Tester',phone:'0812345678',status:'submitted'}]};
    return {rows:[]};
  },release:()=>{released=true;}};
  const deps={
    pool:{connect:async()=>client}, normalizePartnerPhone:v=>String(v||'').trim(),
    normalizeJsonArrayInput:v=>Array.isArray(v)?v:[], normalizePartnerInt:v=>v==null?null:Number(v),
    normalizePartnerBool:v=>v===true, normalizePartnerNumber:(v,d=null)=>v==null||v===''?d:Number(v),
    ensurePartnerTechnicianAccount:async()=>({username:'0812345678',created:true}),
    generateUniquePartnerApplicationCode:async()=> 'CWF-P-1', logPartnerOnboardingEvent:async()=>{},
    notifyPartnerAdmins:async()=>{notified=true;}, partnerNotifyTextNewApplication:()=> 'new',
    partnerApplicationPublicShape:r=>({id:r.id,application_code:r.application_code,full_name:r.full_name,status:r.status}),
    equipmentChoices:['บันได'], workIntents:new Set(['part_time_extra_income']), travelMethods:new Set(['car'])
  };
  registerPartnerApplicationRoutes(app,deps);
  const call=async(body)=>{
    let statusCode=200,payload; const req={body,ip:'127.0.0.1',headers:{'user-agent':'test'}};
    const res={status(n){statusCode=n;return this;},json(v){payload=v;return this;}};
    await handler(req,res); return {statusCode,payload};
  };
  return {call,queries,get released(){return released;},get notified(){return notified;}};
}
const valid=()=>({full_name:'Tester',phone:'0812345678',password:'secret1',confirm_password:'secret1',consent_pdpa:true,consent_terms:true,consent_contract_rate:true,consent_deposit:true,bank_account_number:'123-456-7890',tax_id:'1234567890123',tax_address:'Bangkok',wht_default_rate:3});

test('valid partner application commits bank/tax and does not leak full bank number', async()=>{
  const h=harness(); const r=await h.call(valid());
  assert.equal(r.statusCode,200); assert.equal(r.payload.ok,true);
  assert.equal(JSON.stringify(r.payload).includes('1234567890'),false);
  const ins=h.queries.find(x=>x.sql.includes('INSERT INTO public.partner_applications'));
  assert.ok(ins); assert.equal(ins.args[16],'1234567890'); assert.equal(ins.args[17],'7890');
  const tax=h.queries.find(x=>x.sql.includes('SET tax_id=$2')); assert.deepEqual(tax.args.slice(1),['1234567890123','Bangkok',null,'ค่าบริการ/ค่าจ้างทำของ ตามมาตรา 40(8)',3]);
  assert.ok(h.queries.some(x=>x.sql==='COMMIT')); assert.equal(h.released,true);
});

test('validation rejects before opening transaction', async()=>{
  const h=harness(); const r=await h.call({...valid(),full_name:''});
  assert.equal(r.statusCode,400); assert.equal(h.queries.length,0);
});

test('DB failure rolls transaction back and releases client', async()=>{
  const h=harness({failInsert:true}); const old=console.error; console.error=()=>{};
  try { const r=await h.call(valid()); assert.equal(r.statusCode,500); assert.ok(h.queries.some(x=>x.sql==='ROLLBACK')); assert.equal(h.released,true); }
  finally { console.error=old; }
});
