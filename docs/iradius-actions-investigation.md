# iRadius Actions Investigation

Server-side investigation of the iRadius ISP server (`185.170.131.27:2222`) to determine
what admin actions are already exposed via the HTTP API (port 88), what only exists in
the legacy Tomcat GWT back-end, and what DB writes / MikroTik side-effects each action
performs.

All findings below are derived by:
- Listing controllers in `/tmp/radiusapp_extract/BOOT-INF/classes/com/api/controller/`
- Disassembling relevant `.class` files with `javap -p -c`
- `DESCRIBE`-ing MySQL tables on the live `iradius` database (read-only)

## Summary Table

| # | Action | HTTP API endpoint? | Legacy UI code | DB tables touched | MikroTik side effects | Integration complexity |
|---|--------|--------------------|----------------|-------------------|-----------------------|------------------------|
| 1 | Reset MAC | NO | `me.iradius.server.dao.user.ResetMacAddress` | `UserNas.MacAddress = NULL` + `UserLog` insert | None. New MAC is learned on next RADIUS Accounting-Start. | Low — direct UPDATE via SSH-tunnelled MySQL is sufficient. |
| 2 | Change first / last name | NO | Generic `UserManagement` (reflective Table update) | `User.FirstName`, `User.LastName`, `User.UpdateDate`, `User.ModifiedUserId` | None. | Low — direct UPDATE. |
| 3 | Apply / change discount | NO | Generic `UserManagement` + `InvoiceDao` | Recurring: `User.Discount` (double). Per-invoice: `Invoice.Discount` (double), recomputes `Invoice.TTC/Tax/TVA` | None. | Low (recurring) / Medium (per-invoice, must reconcile TTC). |
| 4 | Set IPTV price | NO | Generic `UserManagement` on `UserNas` | `UserNas.IPTVPRICE` (float). Billing engine adds it on top of `AccountType.SellingPrice`. | None. | Low — direct UPDATE. |
| 5 | Change collector / dealer | NO | `UserManagement.assignUsersToCollectors(...)` for collector; ParentId move for dealer | Collector: `User.CollectorId`. Dealer: `User.ParentId` (+ `LFT/RGT` nested-set columns). | None. Past `UserBalance.CollectorId` rows are NOT rewritten (history preserved). | Low (collector). Medium (dealer — LFT/RGT tree maintenance). |
| 6 | Update phone / mobile | NO | Generic `UserManagement` | `User.Mobile` (char(25)), `User.Phone` (char(25)) | None. | Low — direct UPDATE. |

**Key finding:** the RadiusServerApp HTTP API (port 88) exposes only 8 endpoints (see
Raw Notes). None of the six actions above are available via HTTP. All six are performed
today by the Tomcat GWT admin UI via generic JDBC writes through the
`AbstractDaoMgmt` / `UserManagement` infrastructure, not by bespoke endpoints we can call.

The practical options for integrating from LibanCom are:
1. **Preferred:** perform the same SQL UPDATEs directly via our existing read-only
   SSH tunnel (`packages/database/lib/iradius.ts`) — promoted to read-write for these
   columns only. Matches exactly what the legacy UI does.
2. **Alternative:** patch RadiusServerApp.jar to add new Spring MVC endpoints (same
   technique used for the Mobile LIKE patch on 2026-03-23). More work, more risk.

Direct SQL is lower risk because the legacy UI mutations we observed are plain
single-row updates with no MikroTik callout or server-side cache invalidation.

---

## 1. Reset MAC address

### Endpoint
None in RadiusServerApp HTTP API. Legacy Tomcat UI invokes
`me.iradius.server.dao.user.ResetMacAddress.resetMacAddress(Integer, Integer, String)`.

### Handler logic (from `javap -c`)
```
public void resetMacAddress(Integer userId, Integer modifierId, String reason) {
    String sql = "UPDATE UserNas set MacAddress = null WHERE UserId = " + userId;
    new QueryEngine().updateData(sql);
    new TraceUserLog().traceUserLog(userId, modifierId, reason, "5", "Reset Mac Address");
}
```

Two operations only:
1. `UPDATE UserNas SET MacAddress = NULL WHERE UserId = ?`
2. Insert an audit row into `UserLog` via `TraceUserLog` (action code `"5"`, label `"Reset Mac Address"`).

There is **no call** to `MikrotikDisconnectUtils` or any MikroTik API. The class
`MikrotikDisconnectUtils` exists in the DAO jar but is not referenced from
`ResetMacAddress`.

### DB columns
- `UserNas.MacAddress` (varchar(255), nullable, indexed)
- `UserLog` (audit trail — we do not import this table)

### MikroTik side effects
None triggered directly by this action. The effective behaviour is that on the
subscriber's next PPPoE/hotspot login, the NAS sends an `Accounting-Start` packet and
`BaseAccountingServer.updateSessionIpAddress()` writes the new MAC into
`UserNas.MacAddress` via:

```sql
UPDATE UserNas SET Online = 1, MacAddress = ?, NasHost = ?, MikrotikUser = ?, IpAddress = ?
 WHERE UserId = ?
```

So "reset MAC" is effectively "clear the stored MAC and wait for the next session to
write a new one". No disconnect is forced — if the user is currently online they keep
their session; the MAC is simply re-learned when they next reconnect.

### What we need on our (LibanCom) side to integrate
- Add a server-function / oRPC mutation `customers.resetIRadiusMac` that:
  1. Looks up `user.id` in iRadius by `UserName` (we already store `externalId`).
  2. Runs `UPDATE UserNas SET MacAddress = NULL WHERE UserId = ?` on the tunnelled MySQL.
  3. Mirrors the change locally (`customer.macAddress = null`) so the UI reflects it.
  4. (Optional) If forcing immediate re-auth is desired, additionally call
     `MikrotikDisconnectUtils.disconnectMikrotikByRadiusClient(...)` — but the legacy UI
     does NOT do this, so we should not either unless the product team asks for it.
- Write an audit row in our own `auditLog` (we can skip `UserLog` in iRadius — TraceUserLog
  is purely for the legacy UI's history tab which we don't expose).

---

## 2. Change customer first / last name

### Endpoint
None. Legacy UI sends a generic table update through `AbstractDaoMgmt` /
`UserManagement(modifiedUserId)`. `UserManagement.executeBeforeUpdate()` and
`executeAfterUpdate(...)` fire generic before/after hooks — there is no dedicated
`changeName` method.

### DB columns
`User.FirstName` (varchar(255)), `User.LastName` (varchar(255)). Both nullable.

Also stamped by `AbstractDaoMgmt` on any update:
- `User.UpdateDate = NOW()`
- `User.ModifiedUserId = <session user id>`

### MikroTik side effects
None. Name is stored only in MySQL; RADIUS replies use `UserName`, not display name.

### Integration
Plain `UPDATE User SET FirstName=?, LastName=?, UpdateDate=NOW(), ModifiedUserId=?
WHERE Id=?`. Mirror to our `customer.firstName / lastName` on success.

---

## 3. Apply / change discount

iRadius supports discounts in **two distinct places**:

### A. Recurring discount on the user
- Column: `User.Discount` (double, nullable). 194 users currently have a non-zero value.
- Set via the generic UserManagement update (no dedicated endpoint).
- Billing engine (`InvoiceDao`, cron invoice generation) reads `User.Discount` when
  creating the next monthly `Invoice` row and uses it to compute `Invoice.Discount` +
  `Invoice.TTC`.

### B. One-off discount on a specific invoice
- Column: `Invoice.Discount` (double, nullable).
- Also impacts `Invoice.TVA`, `Invoice.Tax`, `Invoice.TTC` (these are denormalised
  totals stored on the row — the UI recomputes them when saving).
- Touched by `InvoiceDao` / `InvoicePaymentDao` in the legacy UI.

### MikroTik side effects
None. Discount is purely a billing-engine concept; RADIUS has no idea.

### Integration
- **Recurring**: `UPDATE User SET Discount = ? WHERE Id = ?` — safe, mirrors to our
  `customer.discount` column (we should add one if missing).
- **Per invoice**: `UPDATE Invoice SET Discount = ?, TTC = Total - ? + Tax WHERE Id = ?`
  — need to recompute `TTC` the same way the legacy UI does. Before wiring this up, do
  a `SELECT Total, Discount, Tax, TVA, TTC FROM Invoice WHERE Discount IS NOT NULL LIMIT
  10` to confirm the exact arithmetic. Safer to only support the recurring variant in
  v1 and add per-invoice later.

---

## 4. Set IPTV price

### Column
`UserNas.IPTVPRICE` (float, nullable). Also sibling column `UserNas.REALIPPRICE` for
static/real IP surcharges. 10 users currently have `IPTVPRICE > 0`.

IPTV is **not** a separate subscription or add-on table — it is a per-subscriber price
adder stored directly on the `UserNas` row. The billing engine adds it on top of
`AccountType.SellingPrice` when generating invoices.

### Endpoint
None. Set via generic `UserManagement` table update in the legacy UI.

### MikroTik side effects
None. It is a billing field only — IPTV delivery itself is handled outside iRadius.

### Integration
`UPDATE UserNas SET IPTVPRICE = ? WHERE UserId = ?`. We should import this column in
the next sync phase so we can display/edit it locally. Add `iptvPrice` (Decimal) to our
`Customer` model and include it in the customer sync phase.

---

## 5. Change collector / dealer for a customer

### Collector
- Column: `User.CollectorId` (int, FK to `User.Id` where that user has `ProfileId = 6`).
- Dedicated method in the legacy code:
  `UserManagement.assignUsersToCollectors(Integer collectorId, ArrayList<Integer> userIds)`.
  Disassembly shows it is a bulk `UPDATE User SET CollectorId = ? WHERE Id IN (...)`.
- **History is preserved**: past `UserBalance` rows (payment ledger) have their own
  `CollectorId` column that is stamped at the time of payment, and is NOT rewritten
  when the current collector changes. Commission reports use `UserBalance.CollectorId`,
  not `User.CollectorId`, so switching collectors does not retroactively move old
  commissions.

### Dealer
- Column: `User.ParentId` (int, FK to `User.Id` where that parent has `ProfileId = 2`).
- Dealers live in the same `User` table as subscribers but with `ProfileId = 2` and an
  entry in `Dealer`. Dealer hierarchy is a nested set — `User.LFT` / `User.RGT` columns
  must be recomputed when moving a node.
- There is **no dedicated "change dealer" method** in the decompiled DAOs; the legacy
  UI uses the generic tree-move on `User` which updates `ParentId`, `LFT`, `RGT` across
  the affected subtree. This is non-trivial to replicate safely.

### MikroTik side effects
None.

### Integration
- Collector change: safe and simple — `UPDATE User SET CollectorId = ? WHERE Id = ?`.
  Mirror to our `customer.collectorId` (Employee FK).
- Dealer change: **do not attempt via direct SQL** in v1. LFT/RGT maintenance is
  error-prone and we risk corrupting the dealer tree that the legacy UI still reads. If
  this action is required, the right path is to patch RadiusServerApp.jar to add a
  `changeDealer` endpoint that reuses iRadius' own tree-move logic.

---

## 6. Update customer phone / mobile

### Columns
- `User.Mobile` char(25), nullable — stores the primary mobile (sometimes a
  hyphen-separated pair like `79174574-76737176`).
- `User.Phone` char(25), nullable — landline / secondary number.

### Endpoint
None. Generic `UserManagement` update.

### MikroTik side effects
None.

### Integration
`UPDATE User SET Mobile = ?, Phone = ?, UpdateDate = NOW(), ModifiedUserId = ? WHERE Id = ?`.
Mirror to our `customer.mobile` / `customer.phone`.

Note: the `/api/user-info?mobile=X` endpoint now uses `LIKE CONCAT('%', ?, '%')` after
the 2026-03-23 patch, so we can still look customers up by partial mobile after
multi-number fields change.

---

## Raw Notes

### Server paths explored
- `/var/local/radiusserver/RadiusServerApp.jar` — Spring Boot HTTP API (port 88).
  Already extracted to `/tmp/radiusapp_extract`.
- `/var/local/radiusserver/RadiusServer.jar` — RADIUS protocol daemon. Extracted to
  `/tmp/tomcat_extract` contains `BusinessServiceImpl.class` stub only.
- `/var/lib/tomcat7/webapps/ROOT/WEB-INF/classes/me/iradius/server/dao/` — legacy GWT
  DAO classes. This is where the subscriber CRUD lives.

### RadiusServerApp HTTP API — complete controller list
From `/tmp/radiusapp_extract/BOOT-INF/classes/com/api/controller/`:

| Controller | Methods |
|------------|---------|
| `AuthenticationController` | `authenticate(AuthenticateInfo) → String`, `changePassword(ChangePassword) → Boolean` |
| `UserController` | `getUserInfo(String)`, `mikrotikUserList(String)`, `updateuserLocation(UserLocation) → Boolean`, `userPing(String)`, `userStat(String)`, `ping(String)` |
| `AccountTypeChangeController` | `changeAccountType(ChangeAccountTypeRequest) → Map`, `listAccountTypes(String)` |
| `UserActivationController` | `activateUser(UserActivationRequest) → Map` |

That is the full set. **None** of reset-MAC, change-name, discount, IPTV price,
change-collector/dealer, or update-phone is exposed.

### Legacy DAO classes seen in `me/iradius/server/dao/user/`
```
AddTimeQuotaMgmt.class        ConnectedUsersByIp.class      DeleteUserMgmt.class
GenerateUsers.class           RefillCode.class              RenewUser.class
ResetMacAddress.class         ResetUser.class               TraceUserLog.class
UserInf.class
```

And in `me/iradius/server/dao/`:
```
UserManagement.class (+ UserManagement$1.class)
AccountTypeManagement.class   BulkManagement.class          DealerManagement.class
ChartAccountTypeMgmt.class    ExcludeAdjustBandwidthManagement.class
PasswordManagement.class      QueueNasDao.class             RadiusServerDao.class
SystemDao.class               SessionDao.class              InterfaceDaoManagement.class
MikrotikApiDao.class          MikrotikDisconnectUtils.class UserBalanceDao.class
```

### `UserManagement` public methods (from `javap -p`)
```
getModifiedUserName(Integer)
executeBeforeUpdate()
executeAfterUpdate(Integer, Table, Integer)
assignUsersToCollectors(Integer, ArrayList<Integer>)           <-- collector change
assignUsersTouserGroups(Integer, ArrayList<Integer>)
archivedUsers(Session, ArrayList<Integer>)
ucp(Integer, String)
changeAccountTypeWithoutBitlling(Session, Integer, Integer, String, Integer, String)
resetMackAddressesForSelectedUsers(Session, ArrayList<Integer>) <-- bulk MAC reset wrapper
activeSelectedUsers(Session, ArrayList<Integer>, boolean)
getNewVsDeletedUsers(Integer, Date, Date)
readOnlyUsers(Session, ArrayList<Integer>, boolean)
updateAccountPriceToAllUsers(Session, Integer, Integer, Double)
resetUserStationAccessPoint(Session, Integer, Integer)
```
No dedicated name / phone / discount / IPTV / dealer-change methods — those go through
the reflective `AbstractDaoMgmt` path that writes any dirty columns on a `Table`.

### `ResetMacAddress` disassembly
Source SQL: `UPDATE UserNas set MacAddress = null WHERE UserId = <id>`, followed by
`TraceUserLog` insert with action code `"5"` / label `"Reset Mac Address"`. No
MikroTik API call.

### `MikrotikDisconnectUtils` (exists but NOT called by MAC reset)
```
private void disconnectLogTrace(String);
public void disconnectMikrotikByRadiusClient(String, String, String) throws Exception;
```
Used elsewhere (disconnect / CoA flows) but never wired into the MAC-reset path.

### Relevant MySQL schema (read-only `DESCRIBE`)

**User** (subset of 30+ columns):
```
Id                int PK AI
ParentId          int            -- dealer / hierarchy (nested set)
LFT, RGT          int            -- nested-set bounds (maintained by tree moves)
UserName          varchar(255) UNIQUE
ProfileId         int            -- 1 admin, 2 dealer, 4 subscriber, 6 collector, ...
FirstName         varchar(255)   -- action #2
LastName          varchar(255)   -- action #2
Mobile            char(25)       -- action #6
Phone             char(25)       -- action #6
CollectorId       int            -- action #5 (collector)
AccountPrice      double         -- per-user price override
Discount          double         -- action #3 (recurring discount)
UpdateDate        datetime       -- stamped by AbstractDaoMgmt
ModifiedUserId    int            -- stamped by AbstractDaoMgmt
Archived          bit(1)
ReadOnly          bit(1)
```

**UserNas** (subset):
```
Id                int PK
UserId            int FK → User.Id
AccountTypeId     int FK → AccountType.Id
MacAddress        varchar(255)   -- action #1
IPTVPRICE         float          -- action #4
REALIPPRICE       float          -- sibling surcharge for real IP
StaticIP          varchar(15)
NasHost           varchar(50)
Online            bit(1)         -- RADIUS accounting-driven
Active            bit(1)
Blocked           bit(1)
FupMode           bit(1)
ExpiryAccount     datetime
StationId, AccessPointId
```

Live counts from today:
```
SELECT COUNT(*) FROM UserNas WHERE IPTVPRICE > 0;  -- 10
SELECT COUNT(*) FROM User    WHERE Discount  > 0;  -- 194
```

**Invoice**:
```
Id, UserId, Year, Month, InvoiceNbr, InvoiceDate
Total       double
Discount    double     -- action #3 (per-invoice discount)
TVA         double
Tax         double
TTC         double     -- denormalised total, recomputed by the UI on save
Paid        bit(1)
AutoGenerated bit(1)
VatValue    float
ExpiryDate  datetime
```

**AccountType** (service plan — subset):
```
SellingPrice    double
FupResetPrice   float
```
No IPTV column on `AccountType` — IPTV is per-subscriber on `UserNas`.

### Auth used during investigation
- SSH: `sshpass -p 'Mikrotik1' ssh -p 2222 root@185.170.131.27`
- MySQL: `mysql -u root -pImprovedata2015 iradius` (creds from
  `/var/local/radiusserver/app/application.properties`, already in memory)
- Read-only: only `DESCRIBE` and `SELECT` were run. No writes.

## Enable / disable audit log — sanctioned `UserLog` write (2026-06-30)

**Gap:** Our app toggles a customer's status through the `/activate-user` REST
endpoint (`UserActivationDao`), which only runs `UPDATE UserNas SET Active = ?`
plus the (buggy) disconnect — it does **not** write a `UserLog` row. The legacy
GWT UI's single-user edit path (`UserManagement.executeBeforeUpdate` →
`TraceUserLog`) *does*, so enable/disable done from our system was invisible in
iRadius's per-user history while the same action done in the iRadius UI showed up.

**Fix:** after a successful `/activate-user`, `iradiusSetActive`
(`packages/api/modules/customers/lib/iradius-api.ts`) writes the row itself via
`iradiusLogEnableDisable`, replicating `TraceUserLog` exactly:

```sql
INSERT INTO UserLog (UserId, DealerId, UserName, OperationTypeId, Description, Logdate)
SELECT Id, ParentId, UserName, 8, 'User Enable = true|false', NOW() FROM User WHERE Id = ?
```

- `OperationTypeId = 8` = `ENABLE_DISABLE_USER` (from the `OperationType` table).
- `Description` is `"User Enable = true"` / `"User Enable = false"` — byte-for-byte
  what `TraceUserLog.traceUserLog(...Boolean)` produces.
- `DealerId = User.ParentId` (the owning dealer) — pulled via the `SELECT` so the
  row matches what the iRadius UI logs regardless of local sync state. (The legacy
  single-edit path uses `Session.getDealerId()`; for a dealer toggling their own
  customer that equals `ParentId`, which is every sampled row.)
- **Best-effort:** the remote `Active` flag is already flipped before this runs, so
  a log-insert failure is logged and swallowed — it must never abort the local DB
  write. Note `activeSelectedUsers` (the legacy *bulk* path) does NOT write a log
  either; only the single-edit path does.

This adds `UserLog` (insert-only) to the sanctioned-write carve-out for
`executeIRadius`, alongside the single-row `User` / `UserNas` updates above.
