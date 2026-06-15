# Field Operations Guide

> A plain-language walkthrough of the **field-ops** feature set — the worker portal, stock, installations, expenses, new-customer setup, follow-ups, and the task hub.
>
> Shipped in commit `d240a6c` (*feat(field-ops): port worker portal, stock, installations, expenses, and follow-ups from legacy billing*). This is the LibanCom port of the field-technician workflows that used to live in the legacy PHP billing system.

---

## The big picture

There are two kinds of people in this story:

- **Field workers (technicians)** — out in the field, carrying equipment, visiting customers. They use a stripped-down, mobile-first **worker portal** at `/work/{org}`.
- **Admins / managers** — back in the office, reviewing and approving everything the workers submit, from the normal dashboard.

The core idea: **workers submit, admins approve.** Almost nothing a worker does takes effect immediately. They create *pending requests* (a new customer, an installation, an expense). An admin reviews each one, and the **approval** is the moment money moves and inventory changes — always with a full audit trail.

```
WORKER (mobile /work/{org})           ADMIN (dashboard)
──────────────────────────            ────────────────────────────────
New-customer wizard       ─pending──▶ New Customers queue → activate + first payment + use up stock
Install on customer/stn   ─pending──▶ Installations queue → edit price/qty → approve → stock out + cash
Expense + receipt photo   ─pending──▶ Expenses review     → approve → cash credit to worker
Complete task + photo     ─done─────▶ Tasks hub           → recovered gear auto-returns to stock
```

A running **cash balance** tracks how much each worker owes the company (money they collected in the field) versus what the company owes them (approved expenses).

---

## Feature 1 — The Worker Portal

**What it is:** A separate, mobile-first app that field technicians see instead of the normal dashboard. Light-mode, no sidebar, six big tabs: **Home, Tasks, Stock, Install, New, Expenses.**

**How a worker gets it:** An admin sets the employee's **`preferredLayout`** to `"worker"` on the employee detail page. From then on, when that person opens the org, they're automatically redirected from the normal dashboard into the worker portal.

- The layout options are `standard` (normal dashboard), `collector` (cash-collector portal), and `worker` (field-ops portal).

**The screens:**

| Tab | What it shows |
|-----|---------------|
| **Home** | Cash **wallet** (balance, pending/approved expense totals, recent ledger), quick stats (open tasks, stock value, pending installs), and the worker's assigned customers. |
| **Tasks** | Open jobs assigned to this worker. Complete a **maintenance** task (pick a resolution, optional photo) or an **uninstall** task (list recovered items, **photo required per item**). |
| **Stock** | The equipment this worker is currently holding, with quantities and total value. |
| **Install** | Record an installation on a **customer** or a **station** — pick items from the worker's own stock, or add-ons (IPTV / Real IP). |
| **New** | A 3-step wizard to onboard a brand-new customer in the field. |
| **Expenses** | Submit an expense with a receipt photo; see the status of past submissions. |

**Photo capture:** The `PhotoCaptureInput` opens the phone camera directly (`capture="environment"`) and uploads straight to cloud storage (Cloudflare R2) via a signed URL. Used for task evidence, recovered equipment, and expense receipts.

**Where it lives:**
- Routes: `apps/web/app/routes/_worker.tsx` and `apps/web/app/routes/_worker/work/$organizationSlug/*`
- Components: `apps/web/modules/saas/worker/components/` (`WorkerShell`, `WorkerHome`, `WorkerTasks`, `WorkerStockPage`, `WorkerInstall`, `WorkerNewCustomer`, `WorkerExpenses`, `PhotoCaptureInput`, `InstallItemRows`)
- Hooks: `apps/web/modules/saas/worker/hooks/use-worker.ts`
- Wallet API: `packages/api/modules/billing/procedures/worker-wallet.ts`
- The redirect that activates it: `apps/web/app/routes/_saas/app/_org/$organizationSlug.tsx`

---

## Feature 2 — Stock (Inventory)

**What it is:** Equipment inventory management — routers, cables, RJ45 connectors, etc. There's a central warehouse stock and per-worker stock (what each technician is carrying).

**How it works:**
- **Central inventory** lives on `StockItem`: `quantity`, `costPrice`, `sellPrice`, plus low-stock alert settings (`alertThreshold`, `alertEnabled`).
- **Worker stock** lives on `WorkerStock`: how much of each item a given worker holds, with the `unitPrice` frozen at the time of delivery.
- **Every quantity change writes a `StockLog` row** — an immutable audit trail. Each log records the action and the before/after quantities on both the admin and worker sides.

**The movements (`StockAction`):**
- `ADD` / `REMOVE` / `ADJUST` — admin changes central inventory.
- `TRANSFER_TO_WORKER` — admin **delivers** stock to a worker (central goes down, worker's allocation goes up).
- `TRANSFER_FROM_WORKER` — stock **returns** from a worker to central (e.g. recovered equipment, or a manual return).

**Low-stock alerts:** When a delivery drops central quantity to or below `alertThreshold` (and alerts are enabled), the org gets a "Low stock alert" notification linking to the Stock page.

**Important interaction with legacy sync:** The legacy billing system used to push stock numbers into the app. Once the app records its **first native stock operation** (any `StockLog` with no `externalBillingId`), the billing-sync worker **stops overwriting quantities** — the app becomes the source of truth for inventory. Prices and alert settings still sync.

**Where it lives:**
- API: `packages/api/modules/stock/procedures/*` (`create-item`, `add-quantity`, `update-item`, `delete-item`, `deliver-to-worker`, `return-from-worker`, `list-items`, `list-logs`, `worker-stock`, `stats`)
- Admin UI: `apps/web/modules/saas/stock/components/` (`StockList`, `StockItemDialog`, `AddQuantityDialog`, `DeliverToWorkerDialog`, `WorkerAllocationsDialog`, `StockLogList`)
- Sync guard: `packages/jobs/src/workers/billing-sync.worker.ts`
- Models: `StockItem`, `WorkerStock`, `StockLog` in `packages/database/prisma/schema.prisma`
- Permission: `inventory` (`create` / `read` / `update` / `delete`)

---

## Feature 3 — Installations

**What it is:** Recording equipment/services installed at a customer's premises or a station, then having an admin price-check and approve them.

**How it works:**
- A worker creates one or more **installation lines** on either a **customer** or a **station** (not both). Each line is either:
  - a **stock item** (consumes the worker's inventory), or
  - an **add-on** — `IPTV` or `Real IP` (max one of each per customer; stations can't have add-ons).
- **Smart default pricing:** the system suggests add-on prices by looking at the *most common* IPTV / Real IP price already used across existing customers.
- **Admin review queue:** admins can **edit price, quantity, and notes** before approving, and filter the full legacy way (type, dates, price/qty ranges).

**What approval does (`approveInstallationInTx`):**
1. Deducts the item from the worker's stock and logs it.
2. If it's an add-on, updates the customer's `iptvPrice` / `realIpPrice` to the approved price.
3. Writes a cash entry of type `INSTALLATION_COST` (the customer paid the worker for hardware → worker now owes the company).

**Denial:** new `InstallationStatus.DENIED` status; the reason is appended to the notes and no stock/cash moves.

**Where it lives:**
- API: `packages/api/modules/installations/procedures/*` (`create`, `list`, `review`, `stats`, `addon-defaults`), helper `lib/addons.ts`
- Admin UI: `apps/web/modules/saas/installations/components/InstallationsList.tsx`
- Worker UI: `WorkerInstall.tsx` + `InstallItemRows.tsx`
- Permission: `installations` (`create`, `read`, `read:own`, `update`, `approve`)

---

## Feature 4 — Expenses

**What it is:** Workers submit out-of-pocket costs (toolkit, transport, etc.) with a receipt photo; admins approve or reject; approval credits the worker's balance.

**How it works:**
- Worker enters an amount, a category, an optional note, and snaps a **receipt photo** (uploaded to R2 via a signed URL). The expense starts as `PENDING`.
- Admin reviews with a receipt viewer and a month filter.
- **Approval** writes a cash entry of type `EXPENSE_DEDUCTION` — a **positive** amount that *reduces* what the worker owes the company (the company is reimbursing them).
- **Rejection** records a reason and creates no cash entry.

**Where it lives:**
- API: `packages/api/modules/expenses/procedures/*` (`create`, `list`, `review`, `stats`, `create-receipt-upload-url`)
- Admin UI: `apps/web/modules/saas/expenses/components/ExpensesList.tsx`
- Worker UI: `WorkerExpenses.tsx`
- Permission: `expenses` (`create`, `read`, `read:own`, `approve`)

---

## Feature 5 — New Customer Setup (field onboarding)

**What it is:** A 3-step wizard for a technician to sign up a new customer on the spot, which an admin then reviews and activates.

**The wizard (worker side):**
1. **Customer details** — name, mobile, address, group/area, collector, plan.
2. **Plan & duration** — full month or a custom number of days; the system computes a prorated **first charge**.
3. **Items & add-ons** — equipment from the worker's stock plus any add-ons, with a confirmation summary (first charge, next billing date, totals).

This creates a `CustomerSetupRequest` (one per customer) in `PENDING` state, bundling any installations.

**Admin review (edit-before-approve):** the admin can adjust discount, prices, collector, expiry, and first charge before approving.

**What approval does (atomically):**
1. **Activates** the customer (`status = ACTIVE`, sets `activatedAt`).
2. **Approves the bundled installations** (consumes worker stock) — but *without* per-line cash entries.
3. **Records the first payment** in the **active billing month** (resolved via `resolveActiveBillingMonth`, never today's calendar date — this matches the billing-month rule used across the system), collected by the worker.
4. Writes one `NEW_USER_SETUP` cash entry for the hardware total.

**Rejection** sets the customer `INACTIVE` and denies the bundled installations.

**Where it lives:**
- API: `packages/api/modules/customers/procedures/setup-requests.ts`
- Admin UI: `apps/web/modules/saas/customers/components/PendingCustomersList.tsx`, `EditSetupRequestDialog.tsx`; route `.../customers/approvals.tsx`
- Worker UI: `WorkerNewCustomer.tsx`
- Model: `CustomerSetupRequest` in `schema.prisma`

---

## Feature 6 — Tasks (the field-work hub)

**What it is:** The Tasks area is reworked into the operational center for field jobs — assigning work, tracking who's busy, and reviewing completed jobs with photo proof.

**How it works:**
- **Multi-worker assignment:** a task can be assigned to several technicians at once. When creating a maintenance/repair task tied to a customer, the admin can optionally tick **"Send WhatsApp to the customer about the maintenance visit."**
- **Workload cards:** per-worker cards show open tasks, uninstall vs maintenance counts, the oldest open assignment, and how many tasks they completed this month.
- **Completing a task with evidence:**
  - **Maintenance** — pick a resolution code (8 canned options + custom-with-note); photo is **optional**. Records `resolutionCode`, `resolutionNote`, `completionPhotoUrl`, and `completedByEmployeeId`.
  - **Uninstall** (new `TaskCategory.UNINSTALL`) — list each recovered item; a **photo is required for every item**. Each becomes an `UninstalledItem` in `PENDING`.
- **Recovered-equipment review (auto-return to stock):** an admin reviews recovered items, can correct the name/quantity, then:
  - **Approve** → the matched stock item's quantity is **incremented** (logged as `TRANSFER_FROM_WORKER`) and the worker is notified.
  - **Deny** → status set to denied, worker notified. (If no matching stock item exists, the admin is told to create it first.)

**Where it lives:**
- API: `packages/api/modules/tasks/procedures/*` (`complete-with-evidence`, `uninstalled-items`, `workload`, `evidence-upload-url`, `create`), `lib/resolutions.ts`
- Admin UI: `apps/web/modules/saas/tasks/components/` (`TaskEvidenceCard`, `UninstalledItemsReview`, `WorkerWorkloadCards`, `CreateTaskDialog`)
- Worker UI: `WorkerTasks.tsx`
- Permission: `tasks`

---

## Feature 7 — Follow-ups

**What it is:** A lightweight, free-form way to track customer follow-ups (call-backs, promises to pay, etc.), shown as a tab under **Billing**.

**How it works:** A follow-up can be linked to a customer (auto-filling name/mobile/group) or entered manually. It has a `status`, a `note`, a `collectorNote`, and a done/not-done flag (with timestamp). Admins/managers list, filter (by status / done / search), create, update, and delete them.

**Where it lives:**
- API: `packages/api/modules/followups/procedures/{list,mutations}.ts`
- UI: `apps/web/modules/saas/billing/components/FollowupsList.tsx`, hook `use-followups.ts`, route `.../billing/followups.tsx`
- Permission: `followups` (`create`, `read`, `update`, `delete`)

---

## Feature 8 — Dealer Ledger (read-only)

**What it is:** A read-only transaction history shown inside a dealer's detail page — credits, debits, and running totals over a date range.

**Where it lives:**
- API: `packages/api/modules/dealers/procedures/ledger.ts` (admin-only)
- UI: `apps/web/modules/saas/dealers/components/DealerLedger.tsx` (rendered in `DealerDetail.tsx`)
- Source data: `ispDealerAccount` rows

---

## How money is tracked (the cash convention)

Everything above feeds one simple worker balance formula:

```
balance = Σ (payments the worker collected) − Σ (cashCollection.amount)
```

The sign of each `CashCollection.amount` is what makes it work (`packages/api/modules/billing/lib/cash-signs.ts`, with unit tests):

| Helper | Sign | Meaning |
|--------|------|---------|
| `installationCostAmount` | **negative** | Customer paid worker for hardware → worker owes more |
| `newUserSetupAmount` | **negative** | Customer paid worker for setup → worker owes more |
| `expenseDeductionAmount` | **positive** | Company reimburses the worker → worker owes less |
| `handoffAmount` | **positive** | Worker handed cash back to the office → worker owes less |

This mirrors the legacy import's convention (negative = cash received by the worker).

---

## Supporting infrastructure

**Permissions & roles** (`packages/auth/permissions/`)
- New resources: `expenses`, `installations`, `followups`.
- `:own` scoping so a technician only sees their own expenses/installations (resolved via `OWNERSHIP_FIELDS` on `submittedById` / `employeeId`).
- Role templates: `collector`, `field_tech`, `manager`, plus owner/admin full access.

**Notifications** (`packages/api/lib/notify-employee.ts`, `packages/jobs/.../telegram-notify.*`)
- `notifyFieldEmployee` sends an **in-app** notification and, if the employee has a Telegram chat linked, queues a **Telegram** message via a new generic `telegram-notify` BullMQ queue/worker.
- `packages/jobs/src/lib/wpbox.ts` adds templated **WhatsApp** sends (payment receipt, location request, and the maintenance-visit notice used by the task feature).

**Navigation** (`apps/web/modules/shared/components/AppSidebar.tsx`)
- New **Stock / Installations / Expenses** entries under Operations, each with a live **pending-count badge**.
- **Escalations** moved into the AI group.

**Database migration**
- `packages/database/prisma/migrations/20260610172012_worker_stock_field_ops/` adds: `SetupRequestStatus` enum; `InstallationStatus += DENIED`; `TaskCategory += UNINSTALL`; the `customer_setup_request` table; installation `stationId` / `setupRequestId` (+ nullable `customerId`); task completion/resolution fields; uninstalled-item review fields; and `expense.category`.

---

## Quick file map

| Area | API | Frontend |
|------|-----|----------|
| Worker portal | `billing/procedures/worker-wallet.ts` | `app/routes/_worker/**`, `modules/saas/worker/**` |
| Stock | `modules/stock/**` | `modules/saas/stock/**` |
| Installations | `modules/installations/**` | `modules/saas/installations/**` |
| Expenses | `modules/expenses/**` | `modules/saas/expenses/**` |
| New customers | `modules/customers/procedures/setup-requests.ts` | `modules/saas/customers/components/PendingCustomersList.tsx` |
| Tasks | `modules/tasks/procedures/**` | `modules/saas/tasks/components/**` |
| Follow-ups | `modules/followups/**` | `modules/saas/billing/components/FollowupsList.tsx` |
| Dealer ledger | `modules/dealers/procedures/ledger.ts` | `modules/saas/dealers/components/DealerLedger.tsx` |
| Cash logic | `modules/billing/lib/cash-signs.ts` | — |
| Notifications | `api/lib/notify-employee.ts`, `jobs/.../telegram-notify.*`, `jobs/src/lib/wpbox.ts` | — |
| Permissions | `auth/permissions/{access-control,roles}.ts` | — |
