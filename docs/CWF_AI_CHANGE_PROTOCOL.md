# CWF AI Change Protocol

วิธีสั่ง AI/Codex ให้แก้ระบบ CWF โดยไม่ทำแอพเพี้ยน

## 1) Intake Rule

เมื่อผู้ใช้ส่งหลายเรื่อง ให้แยกก่อนเสมอ:

```text
Backlog:
P0:
P1:
P2:
Not doing this round:
```

ห้ามนำทุกเรื่องไป coding พร้อมกัน

## 2) Required Prompt Skeleton

```text
You are working on the production CWF app.

Pull latest main first:
https://github.com/coldwindflow/cwf-services-system.git

Task:
[one clear task only]

Hard constraints:
- Do NOT rewrite the system.
- Do NOT touch unrelated files.
- Do NOT change payout unless this task is payout.
- Do NOT change pricing unless this task is pricing.
- Do NOT change availability unless this task is availability.
- Preserve route names.
- Minimal targeted fix only.

Before coding:
1. Trace UI → payload → backend → DB → display.
2. Identify root cause.
3. Report root cause briefly.
4. Make the smallest safe fix.

Cache:
If frontend JS changes:
- bump HTML script query
- bump sw.js cache name
- update ASSETS
- add console version marker

Tests:
- node --check changed JS files
- manual checklist
- verify after save by fetching job if save flow

Deliver:
- commit hash
- changed-files-only ZIP
- Thai summary
```

## 3) Stop Conditions

AI/Codex ต้องหยุดถ้า:
- ต้องแก้เกิน scope
- ไม่เจอ root cause
- endpoint ไม่ชัด
- field ใน DB ไม่ชัด
- task กระทบ payout/pricing/availability โดยไม่ได้สั่ง
- cache path ไม่ชัด
- test ไม่สามารถยืนยัน flow หลักได้

## 4) Review Rule

ก่อน merge ต้องตอบคำถาม:
- แก้ไฟล์อะไร
- ทำไมต้องแก้ไฟล์นั้น
- flow ก่อนแก้คืออะไร
- flow หลังแก้คืออะไร
- มีอะไรที่ไม่แตะ
- rollback ยังไง
