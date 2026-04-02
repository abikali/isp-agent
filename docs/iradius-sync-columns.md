# iRadius Sync - Complete Column Audit

## Overview

- **11 iRadius tables** queried
- **250+ total columns** read
- **10 major SQL queries** across 6 core files
- **Sync engine:** `packages/jobs/src/workers/iradius-sync.worker.ts` (10-phase import)
- **Connection:** SSH tunnel → MySQL via `packages/database/lib/iradius.ts`

---

## Table 1: AccountType (48 columns → `servicePlan`)

| # | iRadius Column | Local Field |
|---|---------------|-------------|
| 1 | `Id` | `externalId` |
| 2 | `AccountTypeName` | `name` |
| 3 | `Rate` | `rate` |
| 4 | `Commision` | `commission` |
| 5 | `ParentCommision` | `parentCommission` |
| 6 | `DealerId` | dealer FK |
| 7 | `IpPoolName` | `ipPoolName` |
| 8 | `BasicSpeedUp` | `uploadSpeed` (kbps→Mbps) |
| 9 | `BasicSpeedDown` | `downloadSpeed` (kbps→Mbps) |
| 10 | `ValidityPeriod` | `validityPeriod` |
| 11 | `CombinedMaxMonthlyUpAndDown` | `combinedMaxMonthlyUpAndDown` |
| 12 | `SeperateMaxDailyUp` | `separateMaxDailyUp` |
| 13 | `SeperateMaxDailyDown` | `separateMaxDailyDown` |
| 14 | `SellingPrice` | `sellingPrice` / `monthlyPrice` |
| 15 | `MaxUsers` | `maxUsers` |
| 16 | `CanShowOnUserInterface` | `canShowOnUserInterface` |
| 17 | `AutoBindAccToMac` | `autoBindAccToMac` |
| 18 | `Refundable` | `refundable` |
| 19 | `RefundableByGB` | `refundableByGb` |
| 20 | `CanChangeMac` | `canChangeMac` |
| 21 | `CanChangeUserName` | `canChangeUserName` |
| 22 | `ImmediateRecharge` | `immediateRecharge` |
| 23 | `PreventBeforeRecharge` | `preventBeforeRecharge` |
| 24 | `TotalSession` | `totalSession` |
| 25 | `TotalSessionPeriodTypeId` | `totalSessionPeriodTypeId` |
| 26 | `ValidityPeriodTypeId` | `validityPeriodTypeId` |
| 27 | `SeperateMaxMonthlyUp` | `separateMaxMonthlyUp` |
| 28 | `SeperateMaxMonthlyDown` | `separateMaxMonthlyDown` |
| 29 | `MonthlyPoolAfterMax` | `monthlyPoolAfterMax` |
| 30 | `UlDlForAutoFallBack` | `ulDlForAutoFallBack` |
| 31 | `UnlimtedTimeTo` | `unlimitedTimeTo` |
| 32 | `UmlimitedTimeFrom` | `unlimitedTimeFrom` |
| 33 | `NewIpPoolAfterMax` | `newIpPoolAfterMax` |
| 34 | `CombinedMaxUpAndDown` | `combinedMaxUpAndDown` |
| 35 | `ResetCounterTime` | `resetCounterTime` |
| 36 | `ExpiryAccountPool` | `expiryAccountPool` |
| 37 | `UlDlMonthlyForAutoFallBack` | `ulDlMonthlyForAutoFallBack` |
| 38 | `DisablePoolName` | `disablePoolName` |
| 39 | `ProceraId` | `proceraId` |
| 40 | `ExpiryProceraId` | `expiryProceraId` |
| 41 | `AccountTypeCategory` | `accountTypeCategory` |
| 42 | `AdminId` | `adminId` |
| 43 | `CanExcludeQuotaByIpAddress` | `canExcludeQuotaByIpAddress` |
| 44 | `FupResetPrice` | `fupResetPrice` |
| 45 | `AddressListId` | `addressListId` |
| 46 | `DefaultAddressListIds` | `defaultAddressListIds` |
| 47 | `QueueTreeMode` | `queueTreeMode` |
| 48 | `NasId` | `iRadiusNasId` |

---

## Table 2: Station (20 columns → `station`)

| # | iRadius Column | Local Field |
|---|---------------|-------------|
| 1 | `Id` | `externalId` |
| 2 | `Name` | `name` |
| 3 | `Host` | `host` |
| 4 | `Port` | `port` |
| 5 | `SSHPort` | `sshPort` |
| 6 | `Ip` | `ip` |
| 7 | `Online` | `online` |
| 8 | `VlanId` | `vlanId` |
| 9 | `Version` | `version` |
| 10 | `UpTime` | `upTime` |
| 11 | `UserName` | `username` |
| 12 | `Password` | `password` |
| 13 | `APUserName` | `apUsername` |
| 14 | `APPassword` | `apPassword` |
| 15 | `APAPIPort` | `apApiPort` |
| 16 | `APSSHPort` | `apSshPort` |
| 17 | `BoardName` | `boardName` |
| 18 | `CpuLoad` | `cpuLoad` |
| 19 | `Voltage` | `voltage` |
| 20 | `ScanStatus` | `scanStatus` |

---

## Table 3: AccessPoint (15 columns → `accessPoint`)

| # | iRadius Column | Local Field |
|---|---------------|-------------|
| 1 | `Id` | `externalId` |
| 2 | `StationId` | FK → `station.externalId` |
| 3 | `Name` | `name` |
| 4 | `MacAddress` | `macAddress` |
| 5 | `Interface` | `interface` |
| 6 | `IP` | `ip` |
| 7 | `Online` | `online` |
| 8 | `Signal` | `signal` |
| 9 | `UpTime` | `upTime` |
| 10 | `BoardName` | `boardName` |
| 11 | `Version` | `version` |
| 12 | `IsUbnt` | `isUbnt` |
| 13 | `AutoNegotioation` | `autoNegotiation` |
| 14 | `FullDuplex` | `fullDuplex` |
| 15 | `ScanStatus` | `scanStatus` |

---

## Table 4: Nas (19 columns → `ispNas`)

| # | iRadius Column | Local Field |
|---|---------------|-------------|
| 1 | `Id` | `externalId` |
| 2 | `ShortName` | `shortName` |
| 3 | `Host` | `host` |
| 4 | `SharedSecret` | `sharedSecret` |
| 5 | `ApiPort` | `apiPort` |
| 6 | `Active` | `active` |
| 7 | `Description` | `description` |
| 8 | `ApiUserName` | `apiUserName` |
| 9 | `ApiPassword` | `apiPassword` |
| 10 | `OnlineUsers` | `onlineUsers` |
| 11 | `FaultSession` | `faultSession` |
| 12 | `CountFaultSession` | `countFaultSession` |
| 13 | `MinutesToRemoveNasFilter` | `minutesToRemoveNasFilter` |
| 14 | `NasTypeId` | `nasTypeId` |
| 15 | `AdminId` | `adminId` |
| 16 | `MikrotikNewVersion` | `mikrotikNewVersion` |
| 17 | `SSHPort` | `sshPort` |
| 18 | `SSHUserName` | `sshUserName` |
| 19 | `SSHPassword` | `sshPassword` |

---

## Table 5: Router (6 columns → `ispRouter`)

| # | iRadius Column | Local Field |
|---|---------------|-------------|
| 1 | `Id` | `externalId` |
| 2 | `StationId` | FK → `station.externalId` |
| 3 | `AccessPointId` | FK → `accessPoint.externalId` |
| 4 | `Name` | `name` |
| 5 | `Ip` | `ip` |
| 6 | `MacAddress` | `macAddress` |

---

## Table 6: User + Dealer (ProfileId=2) (38 columns → `ispDealer`)

### From `User u` (9 columns)

| # | iRadius Column | Local Field |
|---|---------------|-------------|
| 1 | `u.Id` | `externalId` |
| 2 | `u.UserName` | `username` |
| 3 | `u.FirstName` | `firstName` |
| 4 | `u.LastName` | `lastName` |
| 5 | `u.Mobile` | `phone` (primary) |
| 6 | `u.Phone` | `phone` (fallback) |
| 7 | `u.MailAddress` | `email` |
| 8 | `u.ParentId` | parent dealer FK |
| 9 | `u.Archived` | status calculation |

### From `Dealer d` (29 columns)

| # | iRadius Column | Local Field |
|---|---------------|-------------|
| 1 | `d.Credit` | `credit` |
| 2 | `d.Commision` | `commission` |
| 3 | `d.CompanyName` | `companyName` |
| 4 | `d.CompanyAddress` | `companyAddress` |
| 5 | `d.CompanyPhone` | `companyPhone` |
| 6 | `d.CompanyMobile` | `companyMobile` |
| 7 | `d.CompanyVatNumber` | `companyVatNumber` |
| 8 | `d.SmsSenderId` | `smsSenderId` |
| 9 | `d.NotificationAmount` | `notificationAmount` |
| 10 | `d.FupResetPrice` | `fupResetPrice` |
| 11 | `d.ExtraOneGPPrice` | `extraOneGPPrice` |
| 12 | `d.ExtraOneGPCommision` | `extraOneGPCommission` |
| 13 | `d.CanShowRate` | `canShowRate` |
| 14 | `d.CanShowSpeed` | `canShowSpeed` |
| 15 | `d.NoCharge` | `noCharge` |
| 16 | `d.CanSendMail` | `canSendMail` |
| 17 | `d.CanSendSMS` | `canSendSMS` |
| 18 | `d.CanExportToExcel` | `canExportToExcel` |
| 19 | `d.CanAddDealer` | `canAddDealer` |
| 20 | `d.CanDeleteUser` | `canDeleteUser` |
| 21 | `d.CanChangeAccountType` | `canChangeAccountType` |
| 22 | `d.NotifyBefore3Days` | `notifyBefore3Days` |
| 23 | `d.NotifyBefore2Days` | `notifyBefore2Days` |
| 24 | `d.NotifyBefore1Day` | `notifyBefore1Day` |
| 25 | `d.ExtraGB` | `extraGb` |
| 26 | `d.CanShowOnlineUsersSpeed` | `canShowOnlineUsersSpeed` |
| 27 | `d.UserNotification` | `userNotification` |
| 28 | `d.CanMonitorLog` | `canMonitorLog` |
| 29 | `d.ChargeIfNotExpiry` | `chargeIfNotExpiry` |

---

## Table 7: DealerAccount (7 columns → dealer transaction history)

| # | iRadius Column | Local Field |
|---|---------------|-------------|
| 1 | `Id` | `externalId` |
| 2 | `DealerId` | FK → `ispDealer.externalId` |
| 3 | `Credit` | `credit` |
| 4 | `Debit` | `debit` |
| 5 | `OperationDate` | `operationDate` |
| 6 | `Comment` | `comment` |
| 7 | `Balance` | `balance` |

---

## Table 8: User - Employees (ProfileId IN 1,3,6,7,8) (10 columns → `employee`)

| # | iRadius Column | Local Field |
|---|---------------|-------------|
| 1 | `u.Id` | `externalId` |
| 2 | `u.UserName` | `username` |
| 3 | `u.FirstName` | `firstName` |
| 4 | `u.LastName` | `lastName` |
| 5 | `u.Mobile` | `phone` |
| 6 | `u.Phone` | `phone` (fallback) |
| 7 | `u.MailAddress` | `email` |
| 8 | `u.ParentId` | dealer FK mapping |
| 9 | `u.ProfileId` | `iRadiusProfile` + `department` |
| 10 | `u.CreationDate` | `hireDate` |

### ProfileId → Department Mapping

| ProfileId | Role | Department |
|-----------|------|------------|
| 1 | Administrator | MANAGEMENT |
| 3 | Viewer | MANAGEMENT |
| 6 | Collector | BILLING |
| 7 | Help Desk | CUSTOMER_SERVICE |
| 8 | Read Only | MANAGEMENT |

---

## Table 9: User - Customers (ProfileId=4) + UserNas + Joins (88 columns → `customer`)

This is the largest query with 4 tables joined.

### From `User u` (25 columns)

| # | iRadius Column | Local Field |
|---|---------------|-------------|
| 1 | `u.Id` | `externalId` |
| 2 | `u.UserName` | `username` |
| 3 | `u.FirstName` | `firstName` |
| 4 | `u.LastName` | `lastName` |
| 5 | `u.Mobile` | `mobile` (normalized) |
| 6 | `u.Phone` | `phone` (normalized) |
| 7 | `u.MailAddress` | `email` |
| — | `u.Mobile` + `u.Phone` (derived) | `phones` (JSON array via `buildPhonesFromSync`) |
| 8 | `u.Address` | `address` |
| 9 | `u.Comment` | `notes` |
| 10 | `u.AccountPrice` | `monthlyRate` |
| 11 | `u.Discount` | `discount` |
| 12 | `u.Archived` | status |
| 13 | `u.CreationDate` | `originalCreatedAt` |
| 14 | `u.CollectorId` | collector FK |
| 15 | `u.ParentId` | dealer FK |
| 16 | `u.MOF` | `mof` |
| 17 | `u.LastLogin` | `lastLogin` |
| 18 | `u.LastLogOut` | `lastLogOut` |
| 19 | `u.AutoGenerateInvoice` | `autoGenerateInvoice` |
| 20 | `u.FinancialCategoryId` | `financialCategoryId` |
| 21 | `u.LinkId` | `linkId` |
| 22 | `u.CanResetAccount` | `canResetAccount` |
| 23 | `u.CollectorResetMacAddress` | `collectorResetMac` |
| 24 | `u.CollectorCanShowLinks` | `collectorCanShowLinks` |
| 25 | `u.ReadOnly` | `readOnly` |

### From `UserNas un` (63 columns)

| # | iRadius Column | Local Field |
|---|---------------|-------------|
| 1 | `un.Id` | `nasAccountId` |
| 2 | `un.AccountTypeId` | FK → `servicePlan.externalId` |
| 3 | `un.ActivatedAccount` | `activatedAt` |
| 4 | `un.ExpiryAccount` | `expiresAt` |
| 5 | `un.StaticIP` | `staticIp` |
| 6 | `un.IpAddress` | `ipAddress` |
| 7 | `un.MacAddress` | `macAddress` |
| 8 | `un.NasHost` | `nasHost` |
| 9 | `un.Online` | `online` (BIT→bool) |
| 10 | `un.Active` | status (BIT) |
| 11 | `un.Blocked` | status (BIT) |
| 12 | `un.FupMode` | `fupMode` |
| 13 | `un.DownloadBytes` | `downloadBytes` (BIGINT) |
| 14 | `un.UploadBytes` | `uploadBytes` (BIGINT) |
| 15 | `un.DailyDownloadBytes` | `dailyDownloadBytes` (BIGINT) |
| 16 | `un.DailyUploadBytes` | `dailyUploadBytes` (BIGINT) |
| 17 | `un.AutomaticRenew` | `automaticRenew` |
| 18 | `un.IPTVPRICE` | `iptvPrice` |
| 19 | `un.REALIPPRICE` | `realIpPrice` |
| 20 | `un.StationId` | FK → `station.externalId` |
| 21 | `un.AccessPointId` | FK → `accessPoint.externalId` |
| 22 | `un.GSMLat` | `latitude` |
| 23 | `un.GSMLng` | `longitude` |
| 24 | `un.MikrotikInterface` | `mikrotikInterface` |
| 25 | `un.MikrotikUser` | `mikrotikUser` |
| 26 | `un.FreeDownloadBytes` | `freeDownloadBytes` (BIGINT) |
| 27 | `un.FreeUploadBytes` | `freeUploadBytes` (BIGINT) |
| 28 | `un.ExtraDaysToAddWhenRefill` | `extraDaysToAddOnRefill` |
| 29 | `un.ExtraDaysToDeductWhenRefill` | `extraDaysToDeductOnRefill` |
| 30 | `un.AddedHours` | `addedHours` |
| 31 | `un.ExtraUploadGB` | `extraUploadGb` |
| 32 | `un.ExtraDownloadGB` | `extraDownloadGb` |
| 33 | `un.CanShowTraficDetails` | `canShowTrafficDetails` |
| 34 | `un.OldAccountTypeId` | `oldAccountTypeId` |
| 35 | `un.ForwardAccountTypeId` | `forwardAccountTypeId` |
| 36 | `un.ConditionAccountTypeId` | `conditionAccountTypeId` |
| 37 | `un.DeductMoney` | `deductMoney` |
| 38 | `un.ReachMaxQuota` | `reachMaxQuota` |
| 39 | `un.TempUser` | `tempUser` |
| 40 | `un.TempExpiryAccount` | `tempExpiryAccount` |
| 41 | `un.MikrotikQueue` | `mikrotikQueue` |
| 42 | `un.WirelessInterface` | `wirelessInterface` |
| 43 | `un.RouterBrandPrefix` | `routerBrandPrefix` |
| 44 | `un.OverrideExpiryAccount` | `overrideExpiryAccount` |
| 45 | `un.ForceExpiryAfterDays` | `forceExpiryAfterDays` |
| 46 | `un.ForceOverrideImmediatlyRecharge` | `forceOverrideImmediateRecharge` |
| 47 | `un.OverrideImmediatlyRecharge` | `overrideImmediateRecharge` |
| 48 | `un.ForceAutoBindAccToMac` | `forceAutoBindAccToMac` |
| 49 | `un.OverrideAutoBindAccToMac` | `overrideAutoBindAccToMac` |
| 50 | `un.Simultaneous` | `simultaneous` |
| 51 | `un.APElectrical` | `apElectrical` |
| 52 | `un.ExcludeDailyDownloadBytes` | `excludeDailyDownloadBytes` (BIGINT) |
| 53 | `un.ExcludeDailyUploadBytes` | `excludeDailyUploadBytes` (BIGINT) |
| 54 | `un.ExcludeMontlyDownloadBytes` | `excludeMonthlyDownloadBytes` (BIGINT) |
| 55 | `un.ExcludeMontlyUploadBytes` | `excludeMonthlyUploadBytes` (BIGINT) |
| 56 | `un.FreeDailyDownloadBytes` | `freeDailyDownloadBytes` (BIGINT) |
| 57 | `un.FreeDailyUploadBytes` | `freeDailyUploadBytes` (BIGINT) |
| 58 | `un.ExcludeFreeDailyDownloadBytes` | `excludeFreeDailyDownloadBytes` (BIGINT) |
| 59 | `un.ExcludeFreeMontlyDownloadBytes` | `excludeFreeMonthlyDownloadBytes` (BIGINT) |
| 60 | `un.ExcludeFreeDailyUploadBytes` | `excludeFreeDailyUploadBytes` (BIGINT) |
| 61 | `un.ExcludeFreeMontlyUploadBytes` | `excludeFreeMonthlyUploadBytes` (BIGINT) |
| 62 | `un.LastLogOut` | `nasLastLogOut` |
| 63 | `un.MikrotikInterface1` | `mikrotikInterface1` |

### From Joins (5 additional data points)

| # | Source | iRadius Column | Local Field |
|---|--------|---------------|-------------|
| 1 | `User c` (collector) | `c.FirstName` | `collectorFirstName` |
| 2 | `User c` (collector) | `c.LastName` | `collectorLastName` |
| 3 | `User c` (collector) | `c.Phone` | `collectorPhone` |
| 4 | `UserCategory uc` | `uc.Name` | `categoryName` |
| 5 | `UserGroup ug` | `ug.Name` | `groupName` |

---

## Table 10: UserBalance (8 columns → `customerTransaction`)

| # | iRadius Column | Local Field |
|---|---------------|-------------|
| 1 | `Id` | `externalId` |
| 2 | `UserId` | FK → `customer.externalId` |
| 3 | `InvoiceId` | FK → invoice |
| 4 | `CollectorId` | FK → `employee.externalId` |
| 5 | `Credit` | `credit` |
| 6 | `Debit` | `debit` |
| 7 | `OperationDate` | `operationDate` |
| 8 | `Notes` | `notes` |

---

## Table 11: Invoice (16 columns → `customerInvoice`)

| # | iRadius Column | Local Field |
|---|---------------|-------------|
| 1 | `Id` | `externalId` |
| 2 | `UserId` | FK → `customer.externalId` |
| 3 | `InvoiceNbr` | `invoiceNumber` |
| 4 | `Year` | `year` |
| 5 | `Month` | `month` |
| 6 | `InvoiceDate` | `invoiceDate` |
| 7 | `ExpiryDate` | `expiryDate` |
| 8 | `Total` | `total` |
| 9 | `Discount` | `discount` |
| 10 | `TVA` | `vat` |
| 11 | `TTC` | `ttc` (total with tax) |
| 12 | `Paid` | `paid` |
| 13 | `AutoGenerated` | `autoGenerated` |
| 14 | `GeneratedDate` | `generatedDate` |
| 15 | `Blocked` | `blocked` |
| 16 | `VatValue` | `vatValue` |

---

## Additional: Live Stats Dashboard (computed on-the-fly, not stored)

Queries `User` + `UserNas` tables to calculate real-time counts:

- Online (Online=1, Active=1, ProfileId=4)
- Offline (Online=0, Active=1)
- Active (Active=1, ProfileId=4)
- Inactive (Active=0)
- Expired (ExpiryAccount < NOW(), Active=1)
- FUP mode (FupMode=1, Active=1)
- Archived (Archived=1)
- Total subscribers

---

## Conflict Detection System

The sync has a 3-tier field classification in `iradius-sync-fields.ts`:

### Conflict-Tracked (43 fields) — require manual resolution

Personal info: fullName, firstName, lastName, email, mobile, phone, phones, address, username, notes

Relationships: planId, stationId, accessPointId, dealerId, collectorId, nasId

Status & classification: status, connectionType, categoryName, groupName, collectorName, collectorPhone, mof

Network: ipAddress, macAddress, staticIp, nasHost, mikrotikUser, mikrotikInterface, mikrotikInterface1, mikrotikQueue, wirelessInterface, routerBrandPrefix

Pricing: monthlyRate, discount, iptvPrice, realIpPrice

Dates: originalCreatedAt, activatedAt, expiresAt

Geo: latitude, longitude

Flags: automaticRenew

### Auto-Update (21 fields) — always overwrite silently (volatile telemetry)

online, downloadBytes, uploadBytes, dailyDownloadBytes, dailyUploadBytes, freeDownloadBytes, freeUploadBytes, lastLogin, lastLogOut, nasLastLogOut, fupMode, excludeDailyDownloadBytes, excludeDailyUploadBytes, excludeMonthlyDownloadBytes, excludeMonthlyUploadBytes, freeDailyDownloadBytes, freeDailyUploadBytes, excludeFreeDailyDownloadBytes, excludeFreeMonthlyDownloadBytes, excludeFreeDailyUploadBytes, excludeFreeMonthlyUploadBytes

### Silent Auto-Update (188+ fields) — iRadius-owned config, no conflict detection

All remaining fields not in the above two categories.

---

## Orphan User Detection

Separate query to find financial records not linked to any User:

```sql
SELECT DISTINCT sub.UserId AS Id FROM (
  SELECT UserId FROM UserBalance WHERE UserId NOT IN (SELECT Id FROM User)
  UNION
  SELECT UserId FROM Invoice WHERE UserId NOT IN (SELECT Id FROM User)
) sub
```

---

## Core Files

| File | Purpose |
|------|---------|
| `packages/database/lib/iradius.ts` | SSH tunnel connection + query execution |
| `packages/jobs/src/workers/iradius-sync.worker.ts` | Main 10-phase sync processor |
| `packages/jobs/src/workers/iradius-sync-helpers.ts` | Data transformation & field mapping |
| `packages/jobs/src/workers/iradius-sync-fields.ts` | Conflict tracking & field classification |
| `packages/api/modules/customers/procedures/sync-iradius-entities.ts` | Per-entity API sync |
| `packages/api/modules/customers/procedures/sync-iradius.ts` | Sync trigger & management |
