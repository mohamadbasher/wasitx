import type { Role } from "./enums";

/**
 * Permission catalogue. The API's PermissionsGuard is the enforcement point; UIs use the same map
 * only to hide controls. Trading permissions additionally require the "verified trader" tier,
 * which is derived from KYC state, not stored as a role.
 */
export const PERMISSIONS = [
  // self-service
  "account:self",
  "trading:use",
  // staff
  "admin:access",
  "users:read",
  "users:manage_status",
  "roles:manage",
  "staff_roles:grant_super",
  "kyc:review",
  "compliance:read",
  "compliance:manage",
  "risk:manage",
  "trades:read_all",
  "trades:freeze",
  "trades:compliance_approve",
  "trades:chat_intervene",
  "offers:moderate",
  "disputes:read",
  "disputes:manage",
  "disputes:resolve",
  "approvals:decide",
  "support:manage",
  "revenue:read",
  "commission:manage",
  "payment_methods:manage",
  "networks:manage",
  "announcements:manage",
  "config:manage",
  "gates:manage",
  "audit:read",
  "reports:export",
  "reconciliation:read",
  "withdrawals:approve",
] as const;
export type Permission = (typeof PERMISSIONS)[number];

const USER: Permission[] = ["account:self", "trading:use"];
const SUPPORT: Permission[] = ["admin:access", "users:read", "trades:read_all", "trades:chat_intervene", "disputes:read", "support:manage"];
const COMPLIANCE: Permission[] = [
  ...SUPPORT,
  "kyc:review",
  "compliance:read",
  "compliance:manage",
  "risk:manage",
  "trades:freeze",
  "trades:compliance_approve",
  "users:manage_status",
  "offers:moderate",
  "approvals:decide",
  "audit:read",
  "reconciliation:read",
  "withdrawals:approve",
];
const DISPUTES: Permission[] = [...SUPPORT, "disputes:manage", "disputes:resolve", "approvals:decide", "compliance:read"];
const ADMIN: Permission[] = [
  ...new Set<Permission>([
    ...COMPLIANCE,
    ...DISPUTES,
    "roles:manage",
    "revenue:read",
    "commission:manage",
    "payment_methods:manage",
    "networks:manage",
    "announcements:manage",
    "config:manage",
    "reports:export",
  ]),
];
const SUPER: Permission[] = [...PERMISSIONS];

export const ROLE_PERMISSIONS: Record<Role, readonly Permission[]> = {
  USER,
  SUPPORT_AGENT: SUPPORT,
  COMPLIANCE_OFFICER: COMPLIANCE,
  DISPUTE_MANAGER: DISPUTES,
  ADMIN,
  SUPER_ADMIN: SUPER,
};

export function permissionsFor(roles: readonly Role[]): Set<Permission> {
  const s = new Set<Permission>();
  for (const r of roles) for (const p of ROLE_PERMISSIONS[r] ?? []) s.add(p);
  return s;
}

export const hasPermission = (roles: readonly Role[], p: Permission) => permissionsFor(roles).has(p);
export const isStaff = (roles: readonly Role[]) => roles.some((r) => r !== "USER");
