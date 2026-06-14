# CWF Core Brain Auto Training v36.3 Deploy Hotfix

Fixes Render deploy failure:

- `Error: Cannot find module '../aiTrainingAutoReplyV36'`

Root cause:

- `server/routes/adminAiOfficeTrainingCenterV35B.js` required `../aiTrainingAutoReplyV36`, but `server/aiTrainingAutoReplyV36.js` was missing from the deployed commit/package.
- Some v36.2 Core Brain wiring files were partially missing/rolled back, especially LINE webhook auto internal training hook and shared Core Brain context in LINE Draft / Auto Safe audit.

Included fixes:

1. Add missing `server/aiTrainingAutoReplyV36.js`.
2. Restore LINE webhook hook for internal auto training only. It runs async after message storage and does not block webhook response.
3. Restore shared Core Brain context usage in LINE Draft Reply and Auto Safe audit metadata.
4. Restore Auto Internal Training control settings in AI Reply Control Center.
5. Fix duplicate Core Brain lesson insert when saving a lesson from an auto answer.

Safety:

- Does not enable real LINE auto-send by default.
- Auto Internal Training default remains OFF until toggled on by admin.
- No payment/auth/job workflow changes.

Checks run:

- `node --check server/aiOfficeCoreBrain.js`
- `node --check server/aiTrainingAutoReplyV36.js`
- `node --check server/routes/adminAiOfficeReadOnly.js`
- `node --check server/routes/adminAiOfficeLineDraftV27.js`
- `node --check server/routes/adminAiOfficeTrainingCenterV35B.js`
- `node --check server/routes/adminAiOfficeControlCenter.js`
- `node --check server/routes/lineWebhook.js`
- `node --check admin-ai-control-center.js`
- `node --check index.js`
- local relative require resolution scan: 0 missing relative requires
