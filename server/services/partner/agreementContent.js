'use strict';

const PERMANENT_CONTRACT_PDF = '/docs/CWF_partner_contract_single_rate_2026.pdf';

function signedContractFromRow(signature) {
  if (!signature || !String(signature.signature_snapshot_html || '').trim()) return null;
  return {
    content_html: String(signature.signature_snapshot_html),
    title: String(signature.signature_template_title || 'สัญญาพาร์ทเนอร์ช่าง CWF'),
    source_note: String(signature.signature_template_source_note || ''),
    template_version: signature.template_version == null ? null : Number(signature.template_version),
    signed_at: signature.signed_at || null,
    immutable_snapshot: true,
  };
}

function buildSigningSnapshot({ template, dynamicRateHtml }) {
  const base = String(template?.content_html || template?.body_text || '').trim();
  const rate = String(dynamicRateHtml || '').trim();
  if (Number(template?.version || 0) < 4) return base;
  // v4's dynamic renderer is a rate schedule, not the full legal contract.
  // Bind the signature to the permanent canonical PDF plus the exact rate
  // schedule shown at signing time; never replace the contract with rates only.
  return `<section class="cwf-contract-permanent-reference">
    <h2>สัญญาพาร์ทเนอร์ช่างแอร์ Coldwindflow Air Services</h2>
    <p><strong>เอกสารสัญญาฉบับเต็มถาวร:</strong> <a href="${PERMANENT_CONTRACT_PDF}" target="_blank" rel="noopener">${PERMANENT_CONTRACT_PDF}</a></p>
    <p>การลงนามนี้ผูกกับสัญญาฉบับเต็มข้างต้น และตารางเรทที่แสดงด้านล่าง ณ เวลาลงนาม</p>
  </section>${rate || base}`;
}

function displayTemplate({ template, dynamicRateHtml, signature }) {
  const signed = signedContractFromRow(signature);
  if (signed) return {
    ...(template || {}),
    title: signed.title,
    content_html: signed.content_html,
    source_note: signed.source_note,
    version: signed.template_version ?? template?.version,
    immutable_snapshot: true,
  };
  if (!template) return null;
  if (Number(template.version || 0) < 4) return template;
  return {
    ...template,
    content_html: buildSigningSnapshot({ template, dynamicRateHtml }),
  };
}

module.exports = { PERMANENT_CONTRACT_PDF, signedContractFromRow, buildSigningSnapshot, displayTemplate };
