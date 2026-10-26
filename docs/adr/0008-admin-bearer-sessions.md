# ADR 0008 — Staff console uses bearer sessions on a separate origin

**Status:** accepted

**Context.** If staff and customers share a parent cookie domain, a staff login could leak into the customer app (and vice versa).

**Decision.** The admin app runs on its own origin, authenticates with bearer tokens held in `sessionStorage` (cleared when the tab closes), and requires TOTP for every staff session. It ships no third-party scripts, a strict CSP (`connect-src` = API only, `frame-ancestors 'none'`), `no-store` caching and `noindex`. Production: IP allowlist / VPN in front of the admin origin.

**Consequences.** XSS in the admin app could read the session for that tab — mitigated by CSP, no third-party code, short access-token TTL and server-side revocation.
