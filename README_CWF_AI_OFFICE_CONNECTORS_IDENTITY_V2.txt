CWF AI Office Connectors + LINE Customer Identity v2

This pack adds production read-only connector layer and LINE customer identity resolver.

Install:
  bash cwf-ai-office-connectors-identity-v2/tools/apply-ai-office-connectors-identity-v2.sh .
  psql "$DATABASE_URL" -f migrations/20260607_ai_office_identity_and_connectors_v2.sql

Then set Render env and deploy.

User/admin setup checklist is in:
  docs/CWF_AI_OFFICE_CONNECTORS_IDENTITY_SETUP_TH.md

Read-only guarantees:
- No LINE send API route
- No job create/edit/delete route
- No status mutation route
- No Google Ads mutate route
- No GitHub write route
- No Render deploy route
