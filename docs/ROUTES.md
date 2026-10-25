# Route & screen inventory

Web routes are prefixed with the locale: `/ar`, `/he`, `/en`. Mobile uses Expo Router paths.
✅ = implemented, 🧪 = implemented against sandbox adapters, ⏳ = planned (see STATUS.md).

## Web (apps/web)

| Area | Route | Screen | Auth |
|---|---|---|---|
| Public | `/` | Home | – |
| | `/how-it-works` | How it works | – |
| | `/buy` | Buy USDT (marketplace filtered to SELL offers) | – |
| | `/sell` | Sell USDT (marketplace filtered to BUY offers) | – |
| | `/market` | Marketplace (tabs, filters, sort, pagination, live) | – |
| | `/fees` | Pricing & fees (reads live fee config) | – |
| | `/faq` | FAQ | – |
| | `/contact` | Contact | – |
| | `/legal/[doc]` | Terms, privacy, risk disclosure, AML policy | – |
| Auth | `/register`, `/login`, `/verify-email`, `/verify-phone`, `/reset-password`, `/mfa` | | – / partial |
| Account | `/dashboard` | User dashboard | user |
| | `/profile` | Personal profile & language | user |
| | `/kyc` | Identity verification | user |
| | `/bank-accounts` | Bank details | user |
| | `/security` | Password, MFA, sessions, devices, login history | user |
| | `/notifications` | Notification centre & preferences | user |
| | `/wallet` | Sandbox custody balance, deposit/withdraw (labelled simulated) | user |
| Trading | `/offers/[id]` | Offer details + take offer | – / trader |
| | `/offers/new`, `/offers/[id]/edit`, `/my-offers` | Create/edit/manage offers | trader |
| | `/trades/[id]` | Active trade: status timeline, instructions, chat, actions | party |
| | `/trades` | Trade history | user |
| | `/trades/[id]/receipt` | Receipt | party |
| Support | `/help` | Help centre | – |
| | `/support` | Tickets: list, new, thread | user |
| | `/trades/[id]/dispute` | Open dispute | party |
| | `/disputes/[id]` | Dispute tracking | party |

## Admin (apps/admin) — separate origin, staff + MFA

`/` overview · `/users` · `/users/[id]` · `/kyc` verification queue · `/offers` · `/trades` monitor ·
`/trades/[id]` · `/disputes` · `/disputes/[id]` · `/approvals` dual authorisation · `/compliance` alerts
& cases · `/risk` rules & limits · `/revenue` · `/commission` configuration · `/support` inbox ·
`/payment-methods` · `/networks` · `/announcements` · `/audit` · `/employees` · `/settings` (incl. gates).

## Mobile (apps/mobile)

`(auth)/login`, `(auth)/register`, `(auth)/verify-phone`, `(auth)/mfa` · `(tabs)/market`,
`(tabs)/trades`, `(tabs)/wallet`, `(tabs)/account` · `offer/[id]` · `offer/new` · `trade/[id]`
(timeline + chat + actions) · `kyc` · `security` · `notifications` · `bank-accounts` · `dispute/[id]`.

## REST API (apps/api) — `/api/v1`, OpenAPI at `/api/docs`

| Module | Endpoints |
|---|---|
| auth | `POST register, login, logout, logout-all, refresh, verify-email, resend-email, phone/start, phone/verify, password/forgot, password/reset, mfa/setup, mfa/enable, mfa/disable, mfa/verify` · `GET me, sessions, login-history` · `DELETE sessions/:id` |
| users | `GET/PATCH me/profile` · `POST me/delete-request` · `GET traders/:id` (public stats) · `POST/DELETE favorites/:traderId` |
| kyc | `GET status` · `POST start` · `POST sandbox/complete` (sandbox only) · `POST webhooks/:provider` |
| bank-accounts | `GET, POST, DELETE /:id` |
| offers | `GET /` (filters, sort, cursor) · `GET /:id` · `POST /` · `PATCH /:id` · `POST /:id/pause, /:id/resume, /:id/cancel` · `GET mine` |
| market | `GET stats` · `GET quote` (fee preview) |
| trades | `POST /` (take offer, idempotent) · `GET /`, `GET /:id` · `POST /:id/mark-paid, /:id/confirm-receipt, /:id/cancel, /:id/rate` · `GET /:id/receipt` · `GET /:id/events` |
| messages | `GET /trades/:id/messages` · `POST /trades/:id/messages` · `POST /trades/:id/attachments` · `POST /messages/:id/report` · `POST /trades/:id/read` |
| files | `GET /files/:id` (authorised, streamed, decrypted) |
| disputes | `POST /trades/:id/dispute` · `GET /disputes/:id` · `POST /disputes/:id/evidence, /:id/messages` |
| wallet | `GET balances` · `GET deposit-address` · `POST sandbox/deposit` · `POST withdrawals` · `GET ledger` |
| notifications | `GET /`, `POST /read`, `GET/PUT preferences`, `POST push-tokens` |
| support | `GET/POST tickets`, `GET /tickets/:id`, `POST /tickets/:id/messages` |
| config | `GET public` (brand, fees, payment methods, networks, limits) |
| admin/* | `overview, users, users/:id/status, users/:id/roles, kyc/queue, kyc/:id/decision, offers, offers/:id/suspend, trades, trades/:id, trades/:id/freeze, trades/:id/unfreeze, trades/:id/compliance-approve, disputes, disputes/:id/assign, disputes/:id/request-info, disputes/:id/resolve, approvals, approvals/:id/approve|reject, compliance/alerts, compliance/cases, risk/rules, revenue, commission, payment-methods, networks, announcements, audit, employees, settings, reconciliation, reports/export` |

WebSocket namespace `/ws` (Socket.IO): rooms `user:<id>`, `trade:<id>`, `market`. Events:
`trade.updated`, `message.created`, `message.read`, `offer.updated`, `notification.created`.
