'use strict';
const test=require('node:test'); const assert=require('node:assert/strict'); const fs=require('node:fs'); const path=require('node:path');
test('partner agreement permanently exposes full contract PDF independent of dynamic template',()=>{
 const html=fs.readFileSync(path.join(__dirname,'..','partner-agreement.html'),'utf8');
 assert.match(html,/id="permanentContractPanel"/);
 assert.match(html,/\/docs\/CWF_partner_contract_single_rate_2026\.pdf/);
 const permanent=html.indexOf('id="permanentContractPanel"'), dynamic=html.indexOf('id="agreementPanel"');
 assert.ok(permanent>=0 && dynamic>permanent);
});
