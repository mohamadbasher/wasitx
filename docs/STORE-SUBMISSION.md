# App Store & Google Play submission checklist

Crypto-exchange apps face specific store policies. Do not submit until the legal entity is licensed
(or holds a written legal opinion) — both stores require it for this category. ⚠ Re-read the current
policy text at submission time; summaries below are reminders, not policy.

## Prerequisites
- [ ] Developer accounts owned by the **licensed legal entity** (organisation accounts, D-U-N-S for Apple).
- [ ] Real bundle identifiers (`IOS_BUNDLE_ID`, `ANDROID_PACKAGE`) and EAS project (`EAS_PROJECT_ID`).
- [ ] Production API URL over HTTPS; `TRADING_MODE` decision documented for reviewers.
- [ ] Brand assets: 1024 px icon, adaptive icon layers, splash, screenshots in **Arabic, Hebrew and English** for phone + tablet.

## Apple App Store
- [ ] App Review Guideline 3.1.5 (cryptocurrency): exchange functionality only from a properly licensed developer in the regions it operates; restrict availability to **Israel** in App Store Connect.
- [ ] Guideline 5.1.1 data collection: privacy policy URL; account deletion available in-app (Security → Close account ✔).
- [ ] App Privacy "nutrition label": identity, financial info, contact info, identifiers; linked to user; not used for tracking.
- [ ] Privacy manifest (`app.config.ts` → `privacyManifests`) reviewed against the final SDK list.
- [ ] Encryption export compliance: uses standard HTTPS/TLS only (`usesNonExemptEncryption: false`) — confirm with counsel.
- [ ] Demo account for reviewers (sandbox staging) + notes explaining KYC flow.

## Google Play
- [ ] Financial features declaration; crypto exchange & software wallet policy: comply with local licensing; distribute to **Israel only**.
- [ ] Data safety form consistent with the privacy policy.
- [ ] Target API level per current Play requirements (Expo SDK 58 defaults).
- [ ] Account deletion URL + in-app path.
- [ ] Closed testing track with ≥ required testers before production (new personal-account rules may apply).

## Build & release
- [ ] `eas build --profile production --platform all`; `eas submit` (credentials managed by EAS or the entity's CI).
- [ ] Sentry/crash reporting with PII scrubbing.
- [ ] Certificate pinning and app attestation (App Attest / Play Integrity) — see SECURITY-CHECKLIST.
- [ ] Push: APNs key + FCM credentials uploaded to EAS; `PUSH_PROVIDER=expo` on the API.
- [ ] OTA updates channel policy (no changes to money logic via OTA without review).
