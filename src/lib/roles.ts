/** Portal role constants — keep API middleware and admin routes in sync. */

export const SUPER_ADMIN_ROLE = 'super_admin' as const;

/** Full CMS write + organisation management (except Team). */
export const STAFF_EDITOR_ROLES = ['staff', 'super_admin'] as const;

/** CMS read including reviewers. */
export const ADMIN_READ_ROLES = ['staff', 'super_admin', 'reviewer'] as const;

/** CMS mutations — not reviewers. */
export const ADMIN_WRITE_ROLES = ['staff', 'super_admin'] as const;

/** Approve or reject modules in review. */
export const ADMIN_REVIEW_ROLES = ['reviewer'] as const;

/** Reporting dashboard access. */
export const DASHBOARD_ROLES = ['staff', 'super_admin', 'partner', 'school_admin'] as const;

/** Roles listed/managed on the Team page (super_admin shown, never created via API). */
export const PORTAL_DIRECTORY_ROLES = [
  'super_admin',
  'staff',
  'partner',
  'school_admin',
  'reviewer',
] as const;

/** Roles staff may invite via POST /admin/users. */
export const INVITE_PORTAL_ROLES = ['staff', 'partner', 'school_admin', 'reviewer'] as const;

export type InvitePortalRole = (typeof INVITE_PORTAL_ROLES)[number];

export function isSuperAdmin(role: string) {
  return role === SUPER_ADMIN_ROLE;
}

export function isStaffEditor(role: string) {
  return (STAFF_EDITOR_ROLES as readonly string[]).includes(role);
}

export function isDashboardRole(role: string) {
  return (DASHBOARD_ROLES as readonly string[]).includes(role);
}

export function isAdminReadRole(role: string) {
  return (ADMIN_READ_ROLES as readonly string[]).includes(role);
}

export function isAdminWriteRole(role: string) {
  return (ADMIN_WRITE_ROLES as readonly string[]).includes(role);
}
