export const PASSWORD_REQUIRED_ROLES = ["athlete", "coach", "comite", "admin"] as const;
export const APPROVAL_REQUIRED_ROLES = ["coach"] as const;

export type PasswordRequiredRole = (typeof PASSWORD_REQUIRED_ROLES)[number];
export type ApprovalRequiredRole = (typeof APPROVAL_REQUIRED_ROLES)[number];

export const requiresPasswordForRole = (role?: string | null) =>
  PASSWORD_REQUIRED_ROLES.includes(role as PasswordRequiredRole);

export const requiresApprovalForRole = (role?: string | null) =>
  APPROVAL_REQUIRED_ROLES.includes(role as ApprovalRequiredRole);
