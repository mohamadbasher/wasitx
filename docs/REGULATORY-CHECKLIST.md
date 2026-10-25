# Israeli legal & compliance decision checklist

**For:** an Israeli financial-services lawyer and the compliance lead.
**Status:** prepared by engineering on 2026-10-25 from public secondary sources. **Not legal advice.**
Every item marked ⚠ must be confirmed against the official text (Reshumot / Nevo) and the regulator's
current circulars. Nothing here assumes WASIT X holds any licence — it holds none today.

The platform runs in `TRADING_MODE=SANDBOX`. Switching to `PRODUCTION` requires a super-administrator
to record each gate in §9 in system configuration; the API refuses to boot in production while any
gate is unset or any sandbox adapter is still wired.

---

## 1. Licensing — is this activity a "financial asset service"?

Background: the Supervision of Financial Services (Regulated Financial Services) Law, 5776-2016 was
amended to require a licence for *financial asset* services (which include virtual currency), supervised
by the **Capital Market, Insurance and Savings Authority (CMISA)**. In 2026 CMISA published stricter
binding guidance for licensed VASPs and reported capital requirements of roughly **NIS 2 million (no
custody) / NIS 2.5 million (custody) plus 0.25% of client assets in custody** ⚠ (figures differ between
sources; confirm the final published rule and effective date).

Decisions for counsel:

- [ ] 1.1 Does operating a P2P marketplace where *users* trade with each other, with escrow at a third-party
      custodian, constitute providing a financial asset service (exchange, brokerage, custody, transfer,
      or "arranging" activities) requiring a CMISA licence? Which category exactly?
- [ ] 1.2 Is a basic or expanded licence required? Applicable equity, insurance, fit-and-proper,
      controlling-shareholder and officer approvals.
- [ ] 1.3 Does the escrow arrangement (third-party custodian, platform instructs release) make WASIT X a
      custody provider in its own right? Can that be avoided by contract structure?
- [ ] 1.4 Transitional/interim permit availability and timeline; can a closed pilot run before licensing?
- [ ] 1.5 Israel Securities Authority (ISA): confirm USDT is not treated as a security and that no ISA
      licence (e.g. trading platform) is triggered by the order book.
- [ ] 1.6 Stablecoin regime: the Finance Ministry / CMISA memorandum on a stablecoin law (published
      29 Jun 2026) and Bank of Israel positions on foreign stablecoin issuers — any restriction on
      facilitating trading in USDT specifically? ⚠
- [ ] 1.7 Required company form, Israeli registered office, local directors, required officers (CEO,
      compliance officer, AML officer, internal auditor, risk manager, DPO).

## 2. AML / CFT

The Prohibition on Money Laundering Law, 5760-2000 and the **AML Order for financial asset service
providers (5781-2021, main provisions in force from 14 Nov 2021)** impose identification, verification,
reporting and record-keeping duties, reportedly including an "occasional customer" concept tied to a
6-month NIS 50,000 activity level and virtual-asset activity of NIS 5,000 ⚠, and Travel Rule provisions
(s.7A) whose commencement and threshold must be verified ⚠.

- [ ] 2.1 Customer identification & verification standard (which documents, remote onboarding
      requirements, liveness, Teudat Zehut verification against the Population Registry if available).
- [ ] 2.2 Risk-based approach: written risk assessment, customer risk scoring, enhanced due diligence
      triggers (PEP, high volume, high-risk geographies — although customers are Israeli residents only).
- [ ] 2.3 Reporting to IMPA (Israel Money Laundering and Terror Financing Prohibition Authority):
      unusual-activity reports, threshold reports — thresholds, formats, deadlines, tipping-off rules.
- [ ] 2.4 Sanctions lists in scope: Israeli declared terror organisations & individuals (NBCTF lists),
      UN, plus OFAC/EU by policy. Screening frequency (onboarding + daily rescreen).
- [ ] 2.5 Travel Rule: applies to on-chain deposits/withdrawals (not internal P2P transfers?). Threshold,
      counterparty-VASP data, unhosted-wallet treatment, protocol (e.g. TRP, Notabene, Sumsub TR) ⚠.
- [ ] 2.6 Record retention period (engineering default: **7 years** after relationship end — confirm).
- [ ] 2.7 Source-of-funds / source-of-wealth thresholds and documentation.
- [ ] 2.8 Blockchain analytics obligations (wallet screening before deposit credit / withdrawal).
- [ ] 2.9 Per-user limits for launch (engineering defaults in config: daily ₪50,000, monthly ₪200,000,
      single trade ₪20,000 — business to confirm).

## 3. Fiat side — banks and payment services

- [ ] 3.1 Is the platform outside the Payment Services Law, 5779-2019 and the Payments and Payment
      Services Supervision Law (2023) given it never receives or transmits fiat? Confirm that providing
      payment *instructions* and *references* does not make it a payment service provider.
- [ ] 3.2 Banking relationship for the company (operating account) — Bank of Israel guidance on banks
      serving virtual-currency businesses; expected bank due-diligence package.
- [ ] 3.3 Users' banks may block transfers that relate to crypto purchases. Disclosure wording; can users
      be told to state a payment purpose? (Never instruct users to misdescribe transfers.)
- [ ] 3.4 Bank-data access for settlement verification: Open Banking (Bank of Israel Directive 368)
      via a licensed information-service provider — licence needed for us? Consent flows?
- [ ] 3.5 Use of Bit / PayBox / other wallets: their terms of use for crypto-related transfers.
      Adapters stay disabled until written confirmation.
- [ ] 3.6 Chargeback / recall risk of instant bank transfers (Zahav / instant payments) and allocation
      of loss between users vs. platform in the Terms.

## 4. Custody

- [ ] 4.1 Custodian selection: licensed in Israel (CMISA custody licence) or acceptable foreign
      regulated custodian? Data/asset location requirements.
- [ ] 4.2 Segregation of client assets; bankruptcy remoteness; insurance.
- [ ] 4.3 Contract terms for escrow holds, release instructions, dual control, SLAs, API security.
- [ ] 4.4 Who is the legal owner of USDT during escrow (seller until release)?
- [ ] 4.5 Network policy: which USDT networks (TRC-20 / ERC-20) the custodian supports; token contract
      addresses verified; Tether freeze/blacklist risk handling.

## 5. Consumer protection & terms

- [ ] 5.1 Terms of Service, Risk Disclosure (volatility, de-peg, issuer risk, irreversibility), Fee
      Schedule, Complaints procedure, Dispute policy — in Hebrew and Arabic (and English).
- [ ] 5.2 Consumer Protection Law, 5741-1981 obligations for distance transactions; cancellation rights.
- [ ] 5.3 Advertising restrictions for virtual-asset services (CMISA / ISA positions) ⚠.
- [ ] 5.4 Accessibility: Equal Rights for Persons with Disabilities (Service Accessibility) Regulations
      — Israeli Standard 5568 (WCAG-based) for the website and apps.
- [ ] 5.5 Minimum age 18; capacity rules.

## 6. Privacy & data protection

Protection of Privacy Law, 5741-1981 with **Amendment 13 in force since 14 Aug 2025** (broader
"personal data", "especially sensitive" data incl. biometrics and financial data, DPO duties —
enforcement of DPO obligation reported from 31 Oct 2025 —, stronger PPA enforcement). Protection of
Privacy (Data Security) Regulations, 5777-2017.

- [ ] 6.1 Database registration / notification obligations post-Amendment 13 ⚠.
- [ ] 6.2 DPO appointment (very likely required: financial + biometric data at scale).
- [ ] 6.3 Data-security level under the 2017 Regulations (likely "high"): implications for access
      control, logging, penetration tests, incident reporting to the PPA.
- [ ] 6.4 Biometric data from liveness checks: lawful basis, retention, KYC-vendor processing terms,
      cross-border transfer (Transfer of Data Abroad Regulations).
- [ ] 6.5 Retention vs. erasure: AML retention overrides deletion requests — wording of privacy notice.
- [ ] 6.6 Chat monitoring disclosure (messages are retained and reviewable by support/compliance).

## 7. Tax

- [ ] 7.1 VAT treatment of commission income (financial-institution status? VAT on fees?) ⚠.
- [ ] 7.2 Income tax on commission; withholding obligations, if any.
- [ ] 7.3 Reporting obligations about users' transactions to the Israel Tax Authority (CRS-style or
      local requirements for VASPs) ⚠.
- [ ] 7.4 Invoices / receipts format for fees (Israeli tax-invoice requirements, allocation numbers
      for invoices above the threshold under the 2024+ reform ⚠).

## 8. Operations

- [ ] 8.1 Outsourcing approvals (cloud hosting abroad? CMISA cloud-outsourcing guidance) ⚠.
- [ ] 8.2 Business continuity & incident reporting to regulator.
- [ ] 8.3 Employee screening, insider controls, segregation of duties (built: RBAC + dual approval).
- [ ] 8.4 App Store / Google Play: financial-services declarations; Apple requires the developer
      account to be the licensed entity for crypto exchange apps; Google Play crypto exchange policy
      requires applicable licences per country ⚠.

## 9. Production gates (system configuration keys)

| Key | Set when |
|---|---|
| `gate.licence.confirmed` | Licence (or written legal opinion that none is needed) on file |
| `gate.aml.program.approved` | AML policy, risk assessment, officer appointed |
| `gate.custody.contract.signed` | Custodian contract signed, production API credentials issued |
| `gate.kyc.provider.contracted` | KYC + sanctions provider contracted |
| `gate.banking.confirmed` | Company bank account and fiat-flow model confirmed |
| `gate.privacy.dpo.appointed` | DPO appointed, privacy notice approved |
| `gate.terms.published` | Terms, risk disclosure, fee schedule approved |
| `gate.pentest.passed` | Independent penetration test, criticals fixed |

Sources consulted (secondary — verify against official texts):
Shibolet & Co. on the 2026 digital-asset framework; Barnea Jaffa Lande on crypto custody;
Gornitzky on the amended AML Order (Nov 2022); CryptoSlate AML Order profile; Pearl Cohen and
Israel Desks on Privacy Amendment 13; S. Horowitz on the 2026 stablecoin draft bill; Chambers
Blockchain & Crypto-Assets 2026 (Israel).
