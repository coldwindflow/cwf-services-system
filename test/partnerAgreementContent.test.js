'use strict';
const test=require('node:test'); const assert=require('node:assert/strict');
const {PERMANENT_CONTRACT_PDF,buildSigningSnapshot,displayTemplate}=require('../server/services/partner/agreementContent');

test('v4 signing snapshot binds permanent full contract reference and exact rate schedule',()=>{
 const html=buildSigningSnapshot({template:{version:4,content_html:'legacy'},dynamicRateHtml:'<section>RATE-AT-SIGNING</section>'});
 assert.ok(html.includes(PERMANENT_CONTRACT_PDF)); assert.match(html,/RATE-AT-SIGNING/); assert.doesNotMatch(html,/legacy/);
});

test('signed snapshot always wins over later live template changes',()=>{
 const view=displayTemplate({template:{version:9,title:'NEW',content_html:'NEW CONTRACT'},dynamicRateHtml:'NEW RATE',signature:{template_version:4,signature_snapshot_html:'SIGNED SNAPSHOT',signature_template_title:'SIGNED TITLE',signature_template_source_note:'SIGNED SOURCE',signed_at:'2026-09-27T00:00:00Z'}});
 assert.equal(view.content_html,'SIGNED SNAPSHOT'); assert.equal(view.title,'SIGNED TITLE'); assert.equal(view.version,4); assert.equal(view.immutable_snapshot,true);
});

test('unsigned v4 display uses permanent contract binding plus current rate schedule',()=>{
 const view=displayTemplate({template:{version:4,title:'V4',content_html:'legacy'},dynamicRateHtml:'CURRENT RATE',signature:null});
 assert.match(view.content_html,/CURRENT RATE/); assert.ok(view.content_html.includes('CWF_partner_contract_single_rate_2026.pdf'));
});
