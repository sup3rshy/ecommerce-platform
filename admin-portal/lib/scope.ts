// Phân quyền per-platform cho Admin Portal (PLAN Phase 3, bước 4).
//
// `admin` toàn quyền. Mỗi *_admin chỉ quản lý được nhóm role trong phạm vi nền tảng
// của mình. Đây là phân quyền ở tầng app (UI + server action enforce); Keycloak chỉ
// biết service account `backend-admin-client` có quyền, nên ràng buộc per-platform
// phải làm ở đây.

export const SUPER_ADMIN_ROLE = "admin";

// Các role admin nền tảng được phép vào Admin Portal.
export const PLATFORM_ADMIN_ROLES = [
  "admin",
  "ecommerce_admin",
  "food_admin",
  "pay_admin",
] as const;

// Role mà mỗi *_admin được phép gán/thu hồi. `admin` không nằm ở đây vì được xử lý
// riêng (toàn quyền). Cố ý KHÔNG cho *_admin tự gán role admin nền tảng khác để
// tránh leo thang đặc quyền.
const PLATFORM_MANAGEABLE_ROLES: Record<string, string[]> = {
  ecommerce_admin: ["buyer", "seller", "staff"],
  food_admin: ["buyer", "food-seller"],
  pay_admin: ["wallet-user", "kyc-verified"],
};

// Role được phép duyệt KYC (gán/thu hồi kyc-verified).
const KYC_REVIEWER_ROLES = ["admin", "pay_admin"];

export function isPlatformAdmin(roles: string[] = []): boolean {
  return roles.some((r) => (PLATFORM_ADMIN_ROLES as readonly string[]).includes(r));
}

export function isSuperAdmin(roles: string[] = []): boolean {
  return roles.includes(SUPER_ADMIN_ROLE);
}

export function canReviewKyc(roles: string[] = []): boolean {
  return roles.some((r) => KYC_REVIEWER_ROLES.includes(r));
}

// Gán/đổi shop (Keycloak group) cho staff/seller: ai quản lý được role seller/staff
// thì quản lý được shop binding (admin + ecommerce_admin).
export function canManageShop(roles: string[] = []): boolean {
  if (isSuperAdmin(roles)) return true;
  return roles.some((r) => (PLATFORM_MANAGEABLE_ROLES[r] ?? []).some((m) => m === "seller" || m === "staff"));
}

export function canManageEcommerce(roles: string[] = []): boolean {
  return isSuperAdmin(roles) || roles.includes("ecommerce_admin");
}

export function canManageFood(roles: string[] = []): boolean {
  return isSuperAdmin(roles) || roles.includes("food_admin");
}

/**
 * Tập role mà admin hiện tại được phép gán/thu hồi.
 * - `admin`: tất cả role trong `allRealmRoles`.
 * - per-platform admin: hợp các nhóm role trong phạm vi của họ (giao với role có thật).
 */
export function manageableRoles(adminRoles: string[], allRealmRoles: string[]): string[] {
  if (isSuperAdmin(adminRoles)) {
    return [...allRealmRoles].sort((a, b) => a.localeCompare(b));
  }
  const allowed = new Set<string>();
  for (const r of adminRoles) {
    for (const m of PLATFORM_MANAGEABLE_ROLES[r] ?? []) {
      if (allRealmRoles.includes(m)) allowed.add(m);
    }
  }
  return [...allowed].sort((a, b) => a.localeCompare(b));
}

/** Server-side enforce: admin này có được phép đụng tới role này không. */
export function canManageRole(adminRoles: string[], roleName: string, allRealmRoles: string[]): boolean {
  return manageableRoles(adminRoles, allRealmRoles).includes(roleName);
}
