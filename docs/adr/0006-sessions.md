# ADR 0006 — Sessions: cookies for web, bearer for mobile, rotating refresh tokens

**Status:** accepted

**Decision.** Short-lived HMAC-signed access tokens (15 min) bound to a server-side session row (revocable). Refresh tokens are random, stored hashed, rotated on every use; presenting a rotated token revokes the whole session family and alerts the user. Web uses httpOnly `SameSite=Lax` cookies + double-submit CSRF token; mobile stores tokens in the OS keychain (expo-secure-store) and sends bearer headers. Staff sessions: 12 h refresh lifetime and MFA-verified flag required by `@Staff()` routes.

**Consequences.** Logout-all and suspension take effect on the next request; stolen refresh tokens are detected on reuse.
