# CWF AI LINE Reply Workbench Phase 1

## Phase 1B Backend Send Safety

Phase 1B keeps LINE reply sending server-authoritative. The admin browser can request a send, but it cannot provide or overwrite the outbound reply text during that request.

### Send Eligibility

- Only approvals whose current database `status` is `approved` can be claimed for sending.
- The send route ignores client-provided `final_reply` data.
- The outbound LINE message is loaded from the stored approval row's `final_reply`.
- Empty stored `final_reply` values fail before LINE delivery and return the approval to `approved` for correction.

### Status Transition

Successful sends use this transition:

```text
approved -> sending -> sent
```

LINE provider failures use this retryable transition:

```text
approved -> sending -> approved
```

Provider errors are stored without bearer tokens or access tokens. The send safety change does not enable production sending flags. `no_line_send` and `admin_approved_line_send_enabled` continue to control production send availability.

### Atomic Claim

The backend claims an approval with one conditional database update:

```sql
UPDATE public.ai_auto_reply_approvals
   SET status = 'sending'
 WHERE id = $1
   AND status = 'approved'
 RETURNING *
```

If two admins click send at the same time, only one request can receive the claimed row. The other request receives a conflict and does not call LINE.

### Frontend Safety Rules

- `sendApproval()` posts only an admin send note and never posts `final_reply`.
- A local in-flight guard prevents duplicate clicks for the same approval while the request is pending.
- Existing queued approvals are reused only when both `conversation_id` and `source_draft_id` match.
- Unknown, empty, unsupported, `admin_only`, and `needs_teaching` guard states fail closed and do not show the queue action.

### Scope Boundary

Phase 1B does not change LINE webhook handling, customer messaging intake, production environment flags, booking, payment, admin identity, or technician flows.
