# Client Tasks — Consolidated PRD

Source: 13 tasks sent by the client (ISP owner, non-technical). Investigation reports:
- `docs/iradius-actions-investigation.md` — SSH-verified iRadius server-side reality
- `docs/location-request-flow-investigation.md` — old billing + TG-ISP-Bot patterns

Status legend: ✅ done · 🔧 ready to build · ⏸ deferred

---

## Summary table

| # | Title | Status | Depends on | Complexity |
|---|-------|--------|------------|------------|
| 1 | Bot resumes after human takeover | ✅ done (49fec00) | — | — |
| 2 | Admin phone messages persisted | ✅ done (49fec00) | — | — |
| 3 | Search conversations by phone/name | ✅ done | — | — |
| 4 | Push stopped→inactive to iRadius on review | 🔧 | — | S |
| 5 | Escalate unknown contacts (bot keeps talking) | 🔧 | — | M |
| 6 | Phone number UI/UX, mobile-first | 🔧 | — | S |
| 7 | iRadius admin actions (MAC, name, discount, IPTV) | 🔧 | iRadius API endpoints | L |
| 8 | Change collector with "also on iRadius?" prompt | 🔧 | iRadius API endpoint | M |
| 9 | Row actions in Users-Need-Review | 🔧 | task 7 procedures | M |
| 10 | Phone sync to iRadius + 4 failed invoices | ⏸ skipped for now | task 7 endpoint | — |
| 11 | Collector list — compact one-line rows | 🔧 | — | S |
| 12 | Customer self-serve location request | 🔧 | — | M |
| 13 | Referral dropdown on free payments | 🔧 | — | S |

---

## Task 4 — Centralized customer status observer → iRadius sync

**Problem.** When admin reviews a stopped-payment in the "Users Need Review" queue, `review-payment.ts` flips `customer.status = "INACTIVE"` locally but never calls iRadius. `status` is a conflict-tracked field in the sync worker, so the iRadius value is preserved and the periodic sync only logs a `SyncConflict`. Result: our panel shows INACTIVE, iRadius still shows ACTIVE.

Review-payment is only *one* of the sites that writes `customer.status`. Patching each call site individually is fragile — future features (task 9 force-stop, task 7 discount-triggered reactivations, admin form, ad-hoc procedures) will forget the hook. We need a single observer.

**Design — Prisma client extension (Laravel-observer equivalent).**

Prisma supports `$extends({ query: ... })` which hooks into all top-level model operations at the client level. Every call site goes through it regardless of where it originates. This replaces the per-call-site approach.

### Implementation
1. **Create the extension** in `packages/database/src/extensions/customer-status-observer.ts`:
   - Wraps `customer.update`, `customer.updateMany`, `customer.upsert`.
   - For `update`/`upsert`: when `args.data.status` is set, load the current row first, run the query, compare, dispatch on transition.
   - For `updateMany`: if `args.data.status` is set, `findMany` the affected IDs before the update, then run the query, then dispatch per changed row.
   - All dispatching is `void onCustomerStatusChanged(...)` — fire-and-forget, never awaits the HTTP call, never extends transaction lifetime.
2. **Split the clients.** Export two from `packages/database`:
   - `db` — default client **with** the observer. Everything uses this.
   - `dbRaw` — same client **without** the observer. Only the iRadius sync worker uses this (when it writes back status pulled from iRadius, to avoid a feedback loop).
3. **`onCustomerStatusChanged(before, newStatus)`** lives in `packages/api/modules/customers/lib/customer-status-observer.ts`. It:
   - Calls `syncActiveStatusToIRadius(customer, newStatus === "ACTIVE")` with the existing 2x/2s retry.
   - Writes an audit entry (`customerAudit.statusChanged`) including before/after and the iRadius sync outcome.
4. **Migrate call sites.** Grep every `customer.update`/`updateMany`/`upsert` and `$executeRaw` / `$queryRaw` touching the customer table:
   - Confirm each top-level call uses `db` (auto-covered).
   - iRadius sync worker → switch to `dbRaw`.
   - Any raw SQL writing `status` → convert to Prisma or manually call `onCustomerStatusChanged`.
   - Flag nested writes (`parent.update({ customer: { update: { status } } })`) — extensions only fire on top-level ops, so flatten these.
5. **Review-payment gets no new code.** The observer handles it automatically.

### Caveats
- **Extensions run inside the transaction.** Dispatch must be `void`-ed and fire-and-forget. Never `await` the iRadius call inside the hook.
- **`updateMany` overhead.** A pre-query `findMany` runs when `data.status` is present. Acceptable for a rare op.
- **Raw SQL bypasses extensions.** Covered in step 4.
- **Nested writes bypass extensions.** Covered in step 4.
- **Sync-worker loop prevention.** Covered by the `dbRaw` split.

**Acceptance.**
- Reviewing a stopped payment disables the user in iRadius within ~5s (no code changes in `review-payment.ts`).
- Re-activating via new payment import re-enables in iRadius (same observer path).
- Any new procedure that writes `customer.status` via `db.customer.update(...)` automatically triggers the sync.
- The iRadius sync worker's own writebacks do NOT trigger the observer (they use `dbRaw`), so no feedback loop.
- Every status change is audited with the sync outcome.

**Files.**
- `packages/database/src/extensions/customer-status-observer.ts` (new)
- `packages/database/src/index.ts` (export `db` + `dbRaw`)
- `packages/api/modules/customers/lib/customer-status-observer.ts` (new — `onCustomerStatusChanged`)
- `packages/api/modules/customers/lib/iradius-api.ts` (unchanged — reused)
- iRadius sync worker (switch to `dbRaw`)
- Any raw SQL or nested-write sites found during the grep pass

**Why do this first.** It's the foundation for tasks 7, 8, 9, and any future feature that mutates `customer.status`. Getting the centralized hook right once means every downstream task just calls `db.customer.update(...)` and inherits correct behavior.

---

## Task 5 — Escalate unknown contacts to a human

**Problem.** When a WhatsApp number messages the bot and no matching `Customer` exists, the bot tries to chat normally. The client wants the bot to flag this to a human while continuing to talk.

**Design.**
- **Trigger:** After the bot has attempted to identify the contact (asked for username / invoice / name) and failed — i.e. after N turns without a successful customer link. Keep N=3 configurable.
- **State:** New field `conversation.needsHumanAttention: boolean` + `escalatedAt: DateTime?`. No new table; reuse the conversation row.
- **Notification channel:** Telegram message to the org owner (per Q-B answer: option b only, not a panel badge). Uses the same Telegram infra that `request-location.ts` already uses for collector notifications. Message: "⚠️ Unknown contact needs attention — [name/number] · [link to conversation]".
- **Bot behavior after escalation:** Keeps replying. On the turn it escalates, it sends the contact a single line: "I've let a team member know — they'll join shortly." Does NOT say it again on future turns. It only un-escalates when the admin resumes/handles the conversation (same resume button as human takeover).
- **De-duplication:** Only one Telegram notification per conversation until the flag is cleared.

**Acceptance.**
- After 3 failed identification attempts from an unknown contact, owner receives a Telegram message with a link.
- Bot continues responding.
- Contact receives the "I've notified a human" line exactly once.
- Re-messaging the same conversation does not re-notify.

**Files.** `packages/database/prisma/schema.prisma` (new fields + migration), AI chat worker in `packages/jobs/`, bot orchestration in `packages/ai/src/`, Telegram sender helper.

---

## Task 6 — Phone number UI/UX, mobile-first

**Problem.** In `ConversationDetailPanel.tsx:227` the phone number chip has `hidden sm:inline-block`, so on mobile the number disappears entirely. The conversations list also doesn't show the number prominently.

**Design.**
- **Detail header:** Phone number always visible. On mobile, collapse to a single-tap chip under the name (not inline) with tap-to-copy + overflow menu (Copy / Open WhatsApp / Call). On desktop, keep inline next to the name with the copy-on-click affordance.
- **Conversations list row:** Show phone number on its own line below the name when no customer is linked, or in parentheses next to the name when linked. Truncate gracefully.
- **Reusable piece:** Extract a `<ContactPhone>` component (number, copy, WhatsApp, call) so both list and detail share the same behavior.
- Mobile-first. Test at 360px width.

**Acceptance.** Phone number visible on 360px viewport in both the list and the detail. One-tap copy works. "Open in WhatsApp" opens `wa.me/<number>`.

**Files.** `ConversationDetailPanel.tsx`, conversations list component, new `ContactPhone.tsx` in `modules/saas/ai-agents/components/`.

---

## Task 7 — iRadius admin actions (MAC reset, name, discount, IPTV price)

**Problem.** Admin needs to perform these actions from our panel. The iRadius HTTP API does not expose them today. Per investigation: the legacy GWT UI performs them via generic row updates.

**Scope (two phases).**

### Phase A — iRadius API server (Java)
Approved by client. Add 4 new endpoints on the iRadius API server:

| Endpoint | Method | Payload | DB write | Side effect |
|----------|--------|---------|----------|-------------|
| `/reset-mac-address` | POST | `{userId}` | `UPDATE UserNas SET MacAddress=NULL WHERE UserId=?` | Insert UserLog audit. No MikroTik callout — re-learns on next accounting-start. |
| `/update-user-info` | POST | `{userId, firstName, lastName}` | `UPDATE User SET FirstName=?, LastName=? WHERE Id=?` | UserLog audit. |
| `/set-discount` | POST | `{userId, discount, mode}` where `mode ∈ {"recurring","invoice"}` | recurring: `UPDATE User SET Discount=?`; invoice: `UPDATE Invoice SET Discount=?, TTC=?, Tax=?, TVA=?` for current open invoice | UserLog audit. Recompute invoice totals server-side. |
| `/set-iptv-price` | POST | `{userId, iptvPrice}` | `UPDATE UserNas SET IPTVPRICE=? WHERE UserId=?` | UserLog audit. |

All endpoints: JWT-auth, return `{success, userLogId}`. Transactional. Validate ownership.

### Phase B — TanStack ISP integration
- 4 new procedures in `packages/api/modules/customers/procedures/`: `reset-mac-address.ts`, `update-user-name.ts`, `set-discount.ts`, `set-iptv-price.ts`. Each uses `verifyCustomerOwnership`, calls the new iRadius endpoint, mirrors the result locally (e.g. update `customer.firstName`, `customer.discount`, `customer.iptvPrice`, `customer.macAddress`), fires `customerAudit.updated`.
- Prisma migration: add `discount Decimal? @default(0)`, `iptvPrice Decimal? @default(0)`, `macAddress String?` to `Customer` if not already present (confirm first).
- UI: new "Actions" dropdown on the customer detail page with 4 items, each opening a confirm dialog explaining what will happen. Discount dialog has mode toggle (recurring vs this-invoice-only).
- Audit log entries visible in the customer's activity timeline.

**Acceptance.** Admin can perform each of the 4 actions from the panel; iRadius row updated; local row mirrored; audit logged; failures shown as toasts without partial writes.

**Dependencies.** Requires task 4 pattern for iRadius calls + retries.

---

## Task 8 — Change collector with "also update iRadius?" prompt

**Problem.** Changing a customer's collector today only writes locally. Client wants a prompt "Also change in iRadius?" defaulting to **No (local only)** because the typical case is a one-off swap.

**Design.**
- Phase A (iRadius): add `POST /change-collector` endpoint on iRadius API server. Payload `{userId, collectorUserId}`. Uses the internal bulk-change method (preserves `UserBalance.CollectorId` history, safe mid-cycle). Returns `{success}`.
- Phase B (panel): when admin changes collector in the update customer form, show a confirm dialog after save:
  - Default: **"Only on our panel"** (safe default).
  - Optional: **"Also update in iRadius"** (checkbox unchecked).
- If iRadius option is checked, call `/change-collector` after the local update; on failure, show toast and leave local state intact (it's already the source of truth for this feature).
- Audit both actions separately.

**Acceptance.** Admin changes collector; dialog appears; local-only is default; opting in also updates iRadius; history preserved on iRadius side.

**Files.** `packages/api/modules/customers/procedures/update.ts` (or a new `change-collector.ts` procedure), customer edit form, new iRadius endpoint.

---

## Task 9 — Row actions in Users Need Review

**Problem.** Today the review queue only has "mark reviewed" (which auto-deactivates for stopped payments). Client wants quick row-level actions.

**Design.**
- Row-level kebab menu with:
  1. **Upgrade plan** → opens the existing change-plan dialog pre-filled with this customer (safer option per Q-C).
  2. **Downgrade plan** → same dialog, same prefill.
  3. **Add discount** → opens the new discount dialog from task 7 (recurring or this-invoice).
  4. **Force stop** → confirm dialog → sets customer INACTIVE + iRadius sync (task 4 code path).
- Taking any of these actions **also marks the payment as reviewed** in the same transaction, so the row disappears from the unreviewed queue.
- Keep the existing explicit "Mark reviewed" button as a separate affordance for the amount-mismatch / free-account cases where no underlying action is needed.
- Mobile-friendly: on mobile the kebab becomes a bottom sheet.

**Acceptance.** Admin can pick any of the 4 actions from the review queue; the payment is auto-marked reviewed; the action is audited; UI updates optimistically.

**Dependencies.** Tasks 4 + 7.

---

## Task 11 — Collector list, compact one-line rows

**Problem.** `CollectorPickerPage` in `CashCollectionPage.tsx:110-230` is a card grid (`grid-cols-1 sm:grid-cols-2 xl:grid-cols-3`) where each card is ~120px tall with avatar, name, badges, in-hand, collected progress bar. Client wants a single-line dense list.

**Design.**
- Replace the card grid with a flat list of rows.
- Row layout (desktop): `[avatar 24px] [name + @username] [• N customers] [• N stopped (red)] [— spacer —] [in-hand amount] [collected % + mini bar]` all on one line, 40-48px row height.
- Row layout (mobile): two lines — line 1: avatar + name + customer count; line 2: in-hand + collected %. Still compact (~56px), not a card.
- Preserve the link to the collector detail page.
- Keep sticky header with the column labels on desktop.
- No data changes.

**Acceptance.** On 1440px, the full collector list is visible without horizontal scroll and rows are single-line. On 360px, rows are two-line compact. Click still navigates to the collector page.

**Files.** `apps/web/modules/saas/billing/components/CashCollectionPage.tsx`.

---

## Task 12 — Customer self-serve location request

**Problem.** Some customers have no lat/lng and their collector doesn't know where they are either. Client wants to send the customer a link where they drop a pin / share their phone's GPS, saving it to their record. Pattern exists in old billing + TG-ISP-Bot.

**Design (ported from TG-ISP-Bot + old billing).**

### Data model
```prisma
model LocationRequest {
  id          String   @id @default(cuid())
  organizationId String
  customerId  String
  token       String   @unique  // crypto-random, URL-safe, 32 chars
  expiresAt   DateTime             // default: now + 7 days
  completedAt DateTime?
  createdAt   DateTime @default(now())
  customer    Customer @relation(fields: [customerId], references: [id])
  @@index([token])
  @@index([customerId])
}
```

### Flow
1. **Trigger (manual v1).** Admin opens a customer with no location → button "Request location from customer". Later we add a cron that scans customers missing lat/lng and have no open request.
2. **Create request.** New procedure `createLocationRequest` generates a token, inserts row, returns the public URL `https://<app>/l/:token`.
3. **Send.** WhatsApp message via the existing AI bot channel (per Q-D: WhatsApp only, no SMS fallback). Message template: *"Hi [name], please share your location so we can serve you better: [link]. This link expires in 7 days."*
4. **Public page.** New public route `app/routes/l/$token.tsx` (no auth). Loads customer name (no PII beyond first name). Single big "Share my location" button. Uses HTML5 `navigator.geolocation.getCurrentPosition`. On success, POST to a public oRPC procedure that validates the token, writes `customer.latitude/longitude`, marks `completedAt`. Shows "Thanks!" state.
5. **Validation.** Token must exist, not expired, not already completed. Lat/lng within valid ranges.
6. **Audit.** `customerAudit.locationUpdated` with source = "customer-self-serve".

### Reusable pieces from TG-ISP-Bot
- Token generation helper
- LocationService validation (lat [-90,90], lon [-180,180])
- Public page UX patterns

**Acceptance.**
- Admin clicks "Request location" → customer gets WhatsApp message → customer opens link → grants GPS → location saved → admin sees updated lat/lng.
- Expired/completed tokens show friendly error pages.
- Cannot be reused.

**Files.** new Prisma model + migration, `packages/api/modules/customers/procedures/create-location-request.ts`, public procedure `submit-location.ts`, `apps/web/app/routes/l/$token.tsx`, WhatsApp send helper in AI chat module.

---

## Task 13 — Referral dropdown on free payments

**Problem.** When a collector marks a payment as free, it's usually because the customer referred someone. No field exists to record the referrer.

**Design.**
- **Prisma migration.** Add to `Payment`:
  ```prisma
  referredCustomerId String?
  referredCustomer   Customer? @relation("PaymentReferrer", fields: [referredCustomerId], references: [id])
  ```
  Add inverse `referredPayments Payment[] @relation("PaymentReferrer")` on `Customer`.
- **Reusable component.** New `modules/shared/components/CustomerCombobox.tsx` — shadcn Popover + Command + debounced server-side search using existing `customers.list` with a `search` input. Paginated (first 20), mobile-first (full-screen sheet on mobile).
- **Integration point.** In `PaymentSheet.tsx`, below the `freeAccount` Switch (after line 420): when `freeAccount === true`, render a **CustomerCombobox** labeled "Referred by (optional)". Stores `referredCustomerId` in form state. On submit, passes to `create-payment`.
- **Backend.** Extend `create-payment.ts` input schema with `referredCustomerId: z.string().optional()`. Persist on `Payment.create()`. Validate the referrer belongs to the same org.
- **No side effects.** Per Q-E: just record, no credits, no reports, no dashboard. Reports can come later.

**Acceptance.**
- Toggling free-account reveals an optional searchable customer dropdown.
- Admin can search by name or username, pick a customer, submit.
- Payment row has `referredCustomerId` populated.
- Not required — can be left empty.
- Works on 360px mobile (bottom sheet).

**Files.** Prisma schema + migration, `PaymentSheet.tsx`, `create-payment.ts`, new `CustomerCombobox.tsx`.

---

## Suggested execution order

1. **Task 4** (small, unblocks the review queue correctness) — do first.
2. **Task 6** (UI polish, small) — do alongside 4.
3. **Task 11** (pure frontend, small) — do alongside 4.
4. **Task 13** (migration + reusable combobox we'll need elsewhere) — do next.
5. **Task 7 Phase A** (iRadius Java endpoints) — biggest unknown, start early so it can test in parallel. Requires SSH work on iRadius server.
6. **Task 7 Phase B** (wire up panel).
7. **Task 8** (builds on task 7's pattern).
8. **Task 9** (depends on 7, 4).
9. **Task 12** (independent, medium — do any time after 6/13 land).
10. **Task 5** (escalation — do last because it touches the most nuanced bot behavior).
11. **Task 10** — deferred until client reopens.

---

## Open operational notes

- All new iRadius HTTP endpoints (tasks 7, 8) must be developed on the Java server at `185.170.131.27:2222`. Client approved.
- Every new iRadius-calling procedure follows the fire-and-forget + retry pattern of `syncActiveStatusToIRadius`, never blocking the local transaction.
- Audit logging is mandatory for every new action (tasks 4, 5, 7, 8, 9, 12, 13).
- Memory file `isp-api-server.md` already updated with the new endpoint plans — keep it in sync as each endpoint ships.
