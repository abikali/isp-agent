---
name: billing-system
description: Access and manage the LibanCom billing system (billing.libancomlb.com). Use when the user asks about the billing system, billing database, billing queries, customer payment data, invoices, collectors, installations, expenses, worker tasks, stock, or anything related to the PHP billing app hosted on the Windows RDP server. Triggers include "billing", "billing system", "billing database", "billing server", "john table", "payment data", "billing query", "Windows server", "RDP server", or any reference to billing.libancomlb.com.
allowed-tools: Bash(*), Read, Write, Edit, Glob, Grep
---

# LibanCom Billing System (billing.libancomlb.com)

> **Living Document:** This skill is continuously updated. Whenever you discover new findings about the billing system — such as new tables, schema changes, PHP code patterns, workarounds, or infrastructure changes — update this file immediately so future invocations benefit from the latest knowledge.

## Infrastructure

| Resource | Value |
|----------|-------|
| Host | `171.22.108.231` |
| OS | Windows Server |
| Hostname | `WINDOWS-MT6GOID` |
| Access | SSH (OpenSSH manually installed) |
| User | `administrator` |
| Password | `UGL3GJ@y` |
| Web Stack | WAMP (Apache + MySQL 8.3.0 + PHP) |
| Database | MySQL 8.3.0 (root, no password) |
| DB Name | `bts` |
| Web Root | `C:\wamp64\www` |
| Public Site | `C:\wamp64\libancomlb.com` (marketing/login page) |
| Billing URL | `https://billing.libancomlb.com/` |

## SSH Connection

```bash
# Run a command on the billing server
sshpass -p 'UGL3GJ@y' ssh -o StrictHostKeyChecking=no administrator@171.22.108.231 '<COMMAND>'

# Run a MySQL query
sshpass -p 'UGL3GJ@y' ssh -o StrictHostKeyChecking=no administrator@171.22.108.231 '"C:\wamp64\bin\mysql\mysql8.3.0\bin\mysql.exe" -u root -e "<SQL>" bts'

# Read a PHP file
sshpass -p 'UGL3GJ@y' ssh -o StrictHostKeyChecking=no administrator@171.22.108.231 'type C:\wamp64\www\<filename>.php'

# List a directory
sshpass -p 'UGL3GJ@y' ssh -o StrictHostKeyChecking=no administrator@171.22.108.231 'dir C:\wamp64\www\<path>'
```

**Important:** Use single quotes for the outer SSH command wrapper to avoid shell escaping issues. For paths with backslashes, use single quotes around the remote command.

## Application Overview

The billing system is a PHP application (Bootstrap 4 + jQuery) with role-based access:

### Roles (from `isplogin` table)
| Role | Landing Page | Description |
|------|-------------|-------------|
| `admin` | `admin.php` | Full access to all features |
| `collector` | `col_unpaid.php` | Payment collection |
| `worker` | `worker.php` | Field technician tasks |
| `followup` | `followup/` | Customer follow-up |
| `accounting` | `accounting/dashboard.php` | Financial reports |

### Main Features (from sidebar)
- **Home** (`admin.php`) — Dashboard with stats
- **Search** (`search.php`) — Customer search
- **Follow-up** (`followup/adm_followup.php`) — Customer follow-up tracking
- **Unpaid Bills** (`adm_unpaid.php`) — Customers with outstanding payments
- **Paid Bills** (`adm_paid.php`) — Processed payments
- **Stopped Users** (`adm_stopped.php`) — Disconnected accounts
- **Employees** (`manage_users.php`) — Staff management
- **New Users** (`adm_new.php`) — New customer registrations
- **Installations** (`adm_installations.php`) — Equipment installation tracking
- **Tasks** (`admin_task.php`) — Maintenance/uninstall tasks
- **IPTV Users** (`iptv_users.php`) — IPTV subscriber management
- **Real IP Users** (`realip_users.php`) — Static IP subscribers
- **Offers** (`bulk_whatsapp.php`) — WhatsApp bulk messaging
- **Plans** (`plans.php`) — Internet plan management
- **Stations** (`stations.php`) — Network station management
- **Stock** — `items.php` (view), `stock_log.php` (log)
- **Collection** (`collection.php`) — Cash collection tracking
- **Expenses** (`expenses.php`) — Expense management
- **Bulk Import** (`new_data.php`) — CSV data import
- **Mobiles** (`mobiles.php`) — Customer mobile numbers
- **WhatsApp** — Dashboard, message log, quota tracking

## Database Schema (MySQL 8.3.0, database: `bts`)

### Core Tables

#### `john` — Active Customers (~1,958 rows)
| Column | Type | Notes |
|--------|------|-------|
| id | int PK | Auto-increment |
| username | varchar(40) | iRadius username (indexed) |
| name | varchar(55) | Customer full name |
| group | varchar(60) | Customer group/area |
| address | varchar(300) | Address |
| mobile | varchar(30) | Phone number |
| expiry_account | date | Account expiry date |
| description | varchar(300) | Notes |
| account_type | varchar(30) | Service plan name |
| iptv_price | decimal(20,2) | IPTV add-on price |
| realip_price | decimal(20,2) | Real IP add-on price |
| collector | varchar(20) | Assigned collector |
| account_price | decimal(20,2) | Monthly fee |
| discount | decimal(20,2) | Discount amount |
| paid_account | tinyint | 0=unpaid, 1=paid |
| worker | varchar(60) | Assigned field worker (indexed) |
| is_new | tinyint | 0=existing, 1=new customer |
| create_date | timestamp | Registration date |

#### `john_payment` — Payment Records (~1,933 rows)
| Column | Type | Notes |
|--------|------|-------|
| invoice_number | int PK | Auto-increment |
| username | varchar(50) | Customer username |
| name | varchar(255) | Customer name |
| group | varchar(255) | Group/area |
| mobile | varchar(255) | Phone |
| mobile_updated | int | 0=not updated |
| expiry_account | date | Expiry at time of payment |
| iptv_price | int | IPTV price |
| realip_price | int | Real IP price |
| collector | varchar(20) | Collector who received payment |
| account_price | decimal(20,2) | Account price |
| paid_amount | decimal(20,2) | Amount actually paid |
| discount | decimal(20,2) | Discount given |
| worker | varchar(50) | Worker name |
| free_account | tinyint | 1=free account |
| stopped_account | tinyint | 1=stopped/disconnected |
| timestamp | timestamp | Payment timestamp |
| note | text | Payment notes |
| wts | tinyint | WhatsApp sent flag |
| processed | tinyint | 0=pending, 1=processed |

#### `john_full` — Full Customer Snapshot (with extra fields)
| Column | Type | Notes |
|--------|------|-------|
| id | int | Customer ID |
| username | varchar(40) | iRadius username (indexed) |
| dealer | varchar(50) | Dealer name |
| name | varchar(55) | Customer name |
| group | varchar(60) | Group/area |
| address | varchar(300) | Address |
| mobile | varchar(30) | Phone |
| expiry_account | date | Expiry date |
| description | varchar(300) | Notes |
| account_type | varchar(30) | Plan name |
| iptv_price | decimal(20,2) | IPTV price |
| realip_price | decimal(20,2) | Real IP price |
| active | enum('true','false') | Active status |
| collector | varchar(20) | Collector |
| account_price | decimal(20,2) | Monthly fee |
| discount | decimal(20,2) | Discount |
| electrical | enum('true','false') | Has electrical work |
| lat | double | GPS latitude |
| lng | double | GPS longitude |

#### `isplogin` — System Users/Employees
| Column | Type | Notes |
|--------|------|-------|
| id | int PK | Auto-increment |
| username | varchar(50) | Login username (indexed) |
| password | varchar(50) | Plain-text password |
| role | varchar(10) | Comma-separated roles |
| parent | varchar(50) | Parent user |
| page | varchar(10) | Which billing instance (e.g. 'john') |
| phone | varchar(50) | Phone number |
| telegram | varchar(50) | Telegram ID |

#### `installations` — Installation Records (~2,640 rows)
| Column | Type | Notes |
|--------|------|-------|
| id | int PK | Auto-increment |
| worker_username | varchar(255) | Technician |
| item_name | varchar(255) | Equipment installed |
| customer_name | varchar(255) | Customer name |
| customer_username | varchar(255) | Customer username |
| quantity | int | Number of items |
| price | decimal(10,2) | Installation cost |
| installation_date | timestamp | Date installed |
| state | int | 0=pending, 1=completed |
| isAddOn | int | 0=new install, 1=add-on |
| UserId | int | iRadius User ID |

#### `dealers` — Resellers
| Column | Type | Notes |
|--------|------|-------|
| id | int unsigned PK | Auto-increment |
| name | varchar(255) | Dealer name (indexed) |
| phone | varchar(50) | Phone |
| mobile | varchar(50) | Mobile |
| balance | decimal(12,2) | Current balance |

#### `internet_plans` — Service Plans
| Column | Type | Notes |
|--------|------|-------|
| id | int PK | Auto-increment |
| plan_name | varchar(255) | Plan name |
| price | decimal(10,2) | Monthly price |
| is_addon | tinyint | 0=main plan, 1=add-on |
| is_enabled | tinyint(1) | 1=active |

#### `stations` — Network Stations
| Column | Type | Notes |
|--------|------|-------|
| id | int PK | Auto-increment |
| station_name | varchar(255) | Station name (indexed) |

#### `expenses` — Expense Records (~992 rows)
| Column | Type | Notes |
|--------|------|-------|
| id | int PK | Auto-increment |
| amount | decimal(10,2) | Expense amount |
| worker_username | varchar(255) | Who submitted |
| image_name | varchar(255) | Receipt image |
| note | varchar(255) | Description |
| timestamp | timestamp | When submitted |
| approved | tinyint(1) | 0=pending, 1=approved |

#### `tasks` — Maintenance/Uninstall Tasks (~2,399 rows)
| Column | Type | Notes |
|--------|------|-------|
| id | int PK | Auto-increment |
| type | enum('uninstall','maintenance') | Task type |
| message | text | Task description |
| status | enum('assigned','completed','approved','denied') | Status |
| admin_id | int | Admin who created (FK) |
| customer_username | varchar(255) | Customer affected |
| task_date | timestamp | Scheduled date |
| wid | text | Worker ID(s) |

#### `john_collection` — Collector Cash Deposits
| Column | Type | Notes |
|--------|------|-------|
| id | int unsigned PK | Auto-increment |
| collector | varchar(30) | Collector name |
| collect_amount | decimal(20,2) | Amount deposited |
| date | timestamp | Deposit date |
| note | varchar(500) | Notes |

#### `followup` — Customer Follow-up Tracking
| Column | Type | Notes |
|--------|------|-------|
| id | int PK | Auto-increment |
| name | varchar(255) | Customer name |
| username | varchar(50) | Customer username |
| mobile | varchar(255) | Phone |
| is_done | enum('yes','no') | Completed? |
| note | text | Notes |
| status | varchar(255) | Follow-up status |
| collector_note | varchar(255) | Collector notes |
| date_time | timestamp | Created |
| is_done_date_time | timestamp | Completed at |
| group | varchar(255) | Group/area |

#### `transactions` — Financial Transactions
| Column | Type | Notes |
|--------|------|-------|
| id | int PK | Auto-increment |
| description | varchar(255) | Description |
| amount | decimal(10,2) | Amount |
| date | date | Transaction date |

#### `uninstalled_items` — Equipment Recovery Tracking
| Column | Type | Notes |
|--------|------|-------|
| id | int PK | Auto-increment |
| task_id | int FK | Related task |
| item_name | varchar(255) | Equipment name |
| quantity | int | Number of items |
| picture_url | varchar(255) | Photo evidence |
| worker_id | int FK | Worker who recovered |
| item_status | enum('approved','denied','pending') | Status |
| uninstall_time | timestamp | When recovered |

### Monthly Archive Tables

The system maintains monthly snapshots of key data:

- `john-MM-YYYY` — Customer snapshots (e.g. `john-03-2025`)
- `john_payment-MM-YYYY` — Payment archives
- `john_collection-MM-YYYY` — Collection archives
- `john_full-MM-YYYY` — Full customer snapshots

These go back to March 2024 and are used for historical reporting and data preservation.

### Other Tables

| Table | Purpose |
|-------|---------|
| `dealer_balances` | Dealer account balances |
| `dealer_payments` | Dealer payment history |
| `dealer_transactions` | Dealer financial transactions |
| `dealer_transfers` | Dealer balance transfers |
| `dealer_log` | Dealer activity log |
| `admin_stock` | Admin inventory |
| `worker_stock` | Worker equipment inventory |
| `stock_log` | Stock movement audit trail |
| `installations_stations` | Station-level installations |
| `installations_addons` | Add-on installations |
| `station_workers` | Worker-station assignments |
| `task_assignments` | Task-worker assignments |
| `maintenance_task` | Maintenance task details |
| `whatsapp_log` | WhatsApp message log |
| `whatsapp_queue` | Pending WhatsApp messages |
| `whatsapp_quota` | Daily WhatsApp sending limits |
| `wa_daily_counter` | Daily message counter |
| `wa_offer_log` | Offer message tracking |
| `wa_templates` | WhatsApp message templates |
| `tg_submissions` | Telegram bot submissions |
| `tg_users` | Telegram bot users |

## Key PHP Files

| File | Purpose |
|------|---------|
| `connect.php` | DB connection (localhost, root, no password, db: bts) |
| `index.php` | Login page (session: `john_session`) |
| `sidebar.php` | Navigation sidebar with badge counts |
| `admin.php` | Admin dashboard |
| `adm_new.php` | New customer management (~61KB, largest page) |
| `adm_unpaid.php` | Unpaid bills management |
| `adm_paid.php` | Paid bills management |
| `adm_stopped.php` | Stopped users management |
| `worker.php` | Worker dashboard (~112KB, most complex page) |
| `col_unpaid.php` | Collector payment interface |
| `search.php` / `search_user.php` | Customer search |
| `plans.php` | Plan CRUD |
| `stations.php` | Station CRUD |
| `items.php` | Stock management |
| `expenses.php` | Expense management |
| `collection.php` | Collection tracking |
| `manage_users.php` | Employee management |
| `process_payment.php` | Payment processing logic |
| `bulk_whatsapp.php` | Bulk WhatsApp messaging |

### PDF Invoice Generation

The system has multiple invoice generators per collector:
- `pdfjohny.php`, `pdfelie.php`, `pdfpatrick.php`, `pdfemile.php`
- Uses TCPDF library at `C:\wamp64\TCPDF`
- VBS scripts trigger PDF generation: `johny-pdf.vbs`, `elie-pdf.vbs`, etc.
- Generated invoices stored in `C:\wamp64\www\invoices\`

### Subdirectories

| Directory | Purpose |
|-----------|---------|
| `accounting/` | Accounting module |
| `bot/` | Bot integrations |
| `cron/` | Scheduled tasks |
| `followup/` | Follow-up module |
| `haydar/` | Custom user workspace |
| `elie/` | Collector workspace (Elie) |
| `emile/` | Collector workspace (Emile) |
| `patrick/` | Collector workspace (Patrick) |
| `invoices/` | Generated PDF invoices |
| `uploads/` | File uploads |
| `worker_images/` | Worker task photos |
| `js/` | JavaScript files |
| `offers/` | Offer pages |
| `spin/` | Spin wheel / promotion |

## Desktop Files (useful data)

| Path | Contents |
|------|----------|
| `Desktop\imports\full_j.csv` | Full customer import (944KB) |
| `Desktop\imports\john_FEB.csv` | February import (968KB) |
| `Desktop\elie-full.sql` | Elie's DB dump (14.8MB) |
| `Desktop\full.sql` | Full DB dump (38.8MB) |
| `Desktop\patrick-full.sql` | Patrick's DB dump (15.3MB) |
| `Desktop\queries\` | Saved SQL queries |

## Relationship to iRadius

The billing system (`bts` database) is **separate** from iRadius but they share the same customer base:

- `john.username` = iRadius `User.UserName`
- `john_full` includes `dealer` and `active` fields that map to iRadius data
- The billing system tracks **payments and billing** while iRadius handles **network access control**
- Customers exist in both systems; the billing system is the source of truth for financial data

## Gotchas

1. **No password on MySQL root** — `connect.php` uses root with empty password
2. **Plain-text passwords** — `isplogin` stores passwords in plain text
3. **Monthly table archives** — Data is duplicated into `john-MM-YYYY` style tables monthly
4. **`john` vs `john_full`** — `john` is the active table; `john_full` has extra fields (dealer, active, lat/lng, electrical)
5. **Session name** — Uses `john_session` (not default PHP session)
6. **Multiple billing instances** — The `page` field in `isplogin` supports multiple billing instances (e.g. 'john')
7. **Windows paths** — Use backslashes in commands, and be careful with shell escaping
8. **MySQL binary path** — `C:\wamp64\bin\mysql\mysql8.3.0\bin\mysql.exe`
