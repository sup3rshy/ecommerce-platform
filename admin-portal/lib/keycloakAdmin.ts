// Wrapper Keycloak Admin REST API cho Admin Portal. Lấy token qua client_credentials
// của `backend-admin-client` (service account đã được cấp realm-management roles:
// view-users, manage-users, query-realms, view-realm). Có fallback master admin nếu
// service account chưa đủ quyền.
//
// Mở rộng so với bản shop-pay: thêm revoke role, list realm roles (cho dropdown UI),
// và bật/tắt user (deprovision tạm thời).

type KeycloakAdminConfig = {
  serverUrl: string;
  realm: string;
  adminClientId: string;
  adminClientSecret: string;
};

type KeycloakRoleRepresentation = {
  id: string;
  name: string;
  description?: string;
};

type KeycloakUserRepresentation = {
  id: string;
  username?: string;
  firstName?: string;
  lastName?: string;
  email?: string;
  enabled?: boolean;
};

export type KeycloakUserWithRoles = {
  id: string;
  username: string | null;
  fullName: string | null;
  email: string | null;
  enabled: boolean;
  // roles = gán trực tiếp (revoke được). effectiveRoles = toàn bộ quyền sau khi
  // resolve composite (vd seller -> staff -> buyer). Hiển thị effectiveRoles cho admin.
  roles: string[];
  effectiveRoles: string[];
};

export type AssignableRole = {
  name: string;
  description: string | null;
};

function getKeycloakAdminConfig(): KeycloakAdminConfig {
  const issuer = process.env.KEYCLOAK_ISSUER;
  const adminClientId =
    process.env.KEYCLOAK_ADMIN_CLIENT_ID ?? process.env.KEYCLOAK_SERVICE_CLIENT_ID ?? process.env.KEYCLOAK_CLIENT_ID;
  const adminClientSecret =
    process.env.KEYCLOAK_ADMIN_CLIENT_SECRET ??
    process.env.KEYCLOAK_SERVICE_CLIENT_SECRET ??
    process.env.KEYCLOAK_CLIENT_SECRET;

  if (!issuer || !adminClientId || !adminClientSecret) {
    throw new Error("Missing Keycloak admin environment variables.");
  }

  const realmsSeparator = "/realms/";
  const separatorIndex = issuer.indexOf(realmsSeparator);

  if (separatorIndex === -1) {
    throw new Error("Invalid KEYCLOAK_ISSUER format. Expected '/realms/{realm}'.");
  }

  const serverUrl = issuer.slice(0, separatorIndex);
  const realm = issuer.slice(separatorIndex + realmsSeparator.length).split("/")[0];

  if (!serverUrl || !realm) {
    throw new Error("Unable to resolve Keycloak realm information from KEYCLOAK_ISSUER.");
  }

  return { serverUrl, realm, adminClientId, adminClientSecret };
}

async function getAdminAccessToken(config: KeycloakAdminConfig): Promise<string> {
  // Try client_credentials first (requires Service Accounts on the client)
  const tokenEndpoint = `${config.serverUrl}/realms/${config.realm}/protocol/openid-connect/token`;
  const body = new URLSearchParams({
    grant_type: "client_credentials",
    client_id: config.adminClientId,
    client_secret: config.adminClientSecret,
  });

  const response = await fetch(tokenEndpoint, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
    cache: "no-store",
  });

  const payload = (await response.json().catch(() => null)) as { access_token?: string } | null;

  if (response.ok && payload?.access_token) {
    return payload.access_token;
  }

  // Fallback: use master realm admin credentials (KEYCLOAK_ADMIN / KEYCLOAK_ADMIN_PASSWORD)
  const adminUser = process.env.KEYCLOAK_ADMIN;
  const adminPassword = process.env.KEYCLOAK_ADMIN_PASSWORD;

  if (!adminUser || !adminPassword) {
    throw new Error(
      "Cannot obtain Keycloak admin access token. " +
        "Either enable Service Accounts on the client, or set KEYCLOAK_ADMIN and KEYCLOAK_ADMIN_PASSWORD."
    );
  }

  const masterTokenEndpoint = `${config.serverUrl}/realms/master/protocol/openid-connect/token`;
  const masterBody = new URLSearchParams({
    grant_type: "password",
    client_id: "admin-cli",
    username: adminUser,
    password: adminPassword,
  });

  const masterResponse = await fetch(masterTokenEndpoint, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: masterBody,
    cache: "no-store",
  });

  const masterPayload = (await masterResponse.json().catch(() => null)) as { access_token?: string } | null;

  if (!masterResponse.ok || !masterPayload?.access_token) {
    throw new Error("Cannot obtain Keycloak admin access token via master realm.");
  }

  return masterPayload.access_token;
}

async function getRealmUsers(
  config: KeycloakAdminConfig,
  accessToken: string,
  max: number
): Promise<KeycloakUserRepresentation[]> {
  const usersEndpoint = `${config.serverUrl}/admin/realms/${config.realm}/users?max=${max}`;
  const response = await fetch(usersEndpoint, {
    method: "GET",
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: "no-store",
  });

  const payload = (await response.json().catch(() => null)) as KeycloakUserRepresentation[] | null;

  if (!response.ok || !Array.isArray(payload)) {
    throw new Error("Cannot load users from Keycloak admin API.");
  }

  return payload;
}

async function getUserRealmRoles(
  config: KeycloakAdminConfig,
  accessToken: string,
  userId: string
): Promise<string[]> {
  const roleEndpoint = `${config.serverUrl}/admin/realms/${config.realm}/users/${encodeURIComponent(userId)}/role-mappings/realm`;
  const response = await fetch(roleEndpoint, {
    method: "GET",
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: "no-store",
  });

  const payload = (await response.json().catch(() => null)) as KeycloakRoleRepresentation[] | null;

  if (!response.ok || !Array.isArray(payload)) {
    return [];
  }

  return payload.map((role) => role.name).filter(Boolean);
}

// Effective realm roles (đã resolve composite). Endpoint .../composite trả cả role con.
async function getUserEffectiveRealmRoles(
  config: KeycloakAdminConfig,
  accessToken: string,
  userId: string
): Promise<string[]> {
  const endpoint = `${config.serverUrl}/admin/realms/${config.realm}/users/${encodeURIComponent(userId)}/role-mappings/realm/composite`;
  const response = await fetch(endpoint, {
    method: "GET",
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: "no-store",
  });

  const payload = (await response.json().catch(() => null)) as KeycloakRoleRepresentation[] | null;

  if (!response.ok || !Array.isArray(payload)) {
    return [];
  }

  return payload.map((role) => role.name).filter(Boolean);
}

async function getRealmRoleByName(
  config: KeycloakAdminConfig,
  accessToken: string,
  roleName: string
): Promise<KeycloakRoleRepresentation> {
  const roleEndpoint = `${config.serverUrl}/admin/realms/${config.realm}/roles/${encodeURIComponent(roleName)}`;
  const response = await fetch(roleEndpoint, {
    method: "GET",
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: "no-store",
  });

  const payload = (await response.json().catch(() => null)) as KeycloakRoleRepresentation | null;

  if (!response.ok || !payload?.id || !payload?.name) {
    throw new Error(`Cannot load Keycloak role '${roleName}'.`);
  }

  return payload;
}

export async function assignRealmRoleToUser(userId: string, roleName: string): Promise<void> {
  const config = getKeycloakAdminConfig();
  const accessToken = await getAdminAccessToken(config);
  const roleRepresentation = await getRealmRoleByName(config, accessToken, roleName);

  const assignEndpoint = `${config.serverUrl}/admin/realms/${config.realm}/users/${encodeURIComponent(userId)}/role-mappings/realm`;
  const response = await fetch(assignEndpoint, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify([roleRepresentation]),
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(`Cannot assign realm role '${roleName}' to user '${userId}'.`);
  }
}

export async function revokeRealmRoleFromUser(userId: string, roleName: string): Promise<void> {
  const config = getKeycloakAdminConfig();
  const accessToken = await getAdminAccessToken(config);
  const roleRepresentation = await getRealmRoleByName(config, accessToken, roleName);

  const revokeEndpoint = `${config.serverUrl}/admin/realms/${config.realm}/users/${encodeURIComponent(userId)}/role-mappings/realm`;
  const response = await fetch(revokeEndpoint, {
    method: "DELETE",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify([roleRepresentation]),
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(`Cannot revoke realm role '${roleName}' from user '${userId}'.`);
  }
}

// Bật/tắt user (deprovision tạm). Token hiện tại của user vẫn sống tới khi hết hạn;
// refresh sẽ fail vì user disabled => app coi như logged-out (nền cho deprovisioning AD).
export async function setUserEnabled(userId: string, enabled: boolean): Promise<void> {
  const config = getKeycloakAdminConfig();
  const accessToken = await getAdminAccessToken(config);

  const endpoint = `${config.serverUrl}/admin/realms/${config.realm}/users/${encodeURIComponent(userId)}`;
  const response = await fetch(endpoint, {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ enabled }),
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(`Cannot set enabled=${enabled} for user '${userId}'.`);
  }
}

export async function userHasRealmRole(userId: string, roleName: string): Promise<boolean> {
  try {
    const config = getKeycloakAdminConfig();
    const accessToken = await getAdminAccessToken(config);
    const roles = await getUserRealmRoles(config, accessToken, userId);
    return roles.includes(roleName);
  } catch (error) {
    console.warn(`Cannot verify Keycloak role '${roleName}' for user '${userId}'.`, error);
    return false;
  }
}

export async function getKeycloakUserCount(): Promise<number | null> {
  try {
    const config = getKeycloakAdminConfig();
    const accessToken = await getAdminAccessToken(config);
    const usersEndpoint = `${config.serverUrl}/admin/realms/${config.realm}/users/count`;

    const response = await fetch(usersEndpoint, {
      method: "GET",
      headers: { Authorization: `Bearer ${accessToken}` },
      cache: "no-store",
    });

    const payload = (await response.json().catch(() => null)) as number | null;

    if (!response.ok || typeof payload !== "number") {
      return null;
    }

    return payload;
  } catch {
    return null;
  }
}

export async function getKeycloakUsersWithRoles(limit = 100): Promise<KeycloakUserWithRoles[]> {
  const config = getKeycloakAdminConfig();
  const accessToken = await getAdminAccessToken(config);
  const users = await getRealmUsers(config, accessToken, limit);

  const usersWithRoles = await Promise.all(
    users.map(async (user) => {
      const [roles, effectiveRaw] = await Promise.all([
        getUserRealmRoles(config, accessToken, user.id),
        getUserEffectiveRealmRoles(config, accessToken, user.id),
      ]);
      const effectiveRoles = effectiveRaw.filter((r) => !NOISE_ROLES.has(r) && !r.startsWith("default-roles-"));
      const firstName = user.firstName?.trim() ?? "";
      const lastName = user.lastName?.trim() ?? "";
      const fullName = `${firstName} ${lastName}`.trim();

      return {
        id: user.id,
        username: user.username ?? null,
        fullName: fullName || null,
        email: user.email ?? null,
        enabled: user.enabled ?? true,
        roles,
        effectiveRoles,
      };
    })
  );

  return usersWithRoles;
}

// Role hệ thống ẩn khỏi hiển thị "toàn bộ quyền" (không có ý nghĩa nghiệp vụ).
const NOISE_ROLES = new Set(["offline_access", "uma_authorization"]);

// Bỏ các role hệ thống/composite không nên gán tay qua UI.
const HIDDEN_ROLES = new Set(["offline_access", "uma_authorization"]);

export async function getAssignableRealmRoles(): Promise<AssignableRole[]> {
  const config = getKeycloakAdminConfig();
  const accessToken = await getAdminAccessToken(config);
  const endpoint = `${config.serverUrl}/admin/realms/${config.realm}/roles`;

  const response = await fetch(endpoint, {
    method: "GET",
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: "no-store",
  });

  const payload = (await response.json().catch(() => null)) as KeycloakRoleRepresentation[] | null;

  if (!response.ok || !Array.isArray(payload)) {
    throw new Error("Cannot load realm roles from Keycloak admin API.");
  }

  return payload
    .filter((r) => r.name && !r.name.startsWith("default-roles-") && !HIDDEN_ROLES.has(r.name))
    .map((r) => ({ name: r.name, description: r.description ?? null }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

// === Group (shop binding) ===
// Shop = Keycloak group tên bắt đầu "store-" (vd store-demo-1), mang attribute storeId.
// Một staff/seller thuộc đúng 1 shop -> các hàm dưới enforce "single store group".

type KeycloakGroupRepresentation = {
  id: string;
  name: string;
  path: string;
  attributes?: Record<string, string[]>;
};

export type StoreGroup = {
  id: string;
  name: string;
  path: string;
  storeId: string | null;
};

export type StoreMembership = { groupId: string; path: string; name: string };

function isStoreGroup(name: string): boolean {
  return name.startsWith("store-");
}

export async function getStoreGroups(): Promise<StoreGroup[]> {
  const config = getKeycloakAdminConfig();
  const accessToken = await getAdminAccessToken(config);
  const endpoint = `${config.serverUrl}/admin/realms/${config.realm}/groups?briefRepresentation=false`;
  const response = await fetch(endpoint, {
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: "no-store",
  });
  const payload = (await response.json().catch(() => null)) as KeycloakGroupRepresentation[] | null;
  if (!response.ok || !Array.isArray(payload)) {
    throw new Error("Cannot load groups from Keycloak admin API.");
  }
  return payload
    .filter((g) => isStoreGroup(g.name))
    .map((g) => ({ id: g.id, name: g.name, path: g.path, storeId: g.attributes?.storeId?.[0] ?? null }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

async function getUserGroupReps(
  config: KeycloakAdminConfig,
  accessToken: string,
  userId: string
): Promise<KeycloakGroupRepresentation[]> {
  const endpoint = `${config.serverUrl}/admin/realms/${config.realm}/users/${encodeURIComponent(userId)}/groups`;
  const response = await fetch(endpoint, {
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: "no-store",
  });
  const payload = (await response.json().catch(() => null)) as KeycloakGroupRepresentation[] | null;
  return response.ok && Array.isArray(payload) ? payload : [];
}

// Map userId -> store group đang thuộc (cho list view ở /users). Query members của
// từng store group (ít group nên rẻ hơn N lần gọi /users/{id}/groups).
export async function getStoreMembershipByUser(): Promise<Record<string, StoreMembership>> {
  const config = getKeycloakAdminConfig();
  const accessToken = await getAdminAccessToken(config);
  const groups = await getStoreGroups();
  const result: Record<string, StoreMembership> = {};
  for (const g of groups) {
    const endpoint = `${config.serverUrl}/admin/realms/${config.realm}/groups/${g.id}/members?max=500`;
    const response = await fetch(endpoint, {
      headers: { Authorization: `Bearer ${accessToken}` },
      cache: "no-store",
    });
    const members = (await response.json().catch(() => null)) as { id: string }[] | null;
    if (response.ok && Array.isArray(members)) {
      for (const m of members) result[m.id] = { groupId: g.id, path: g.path, name: g.name };
    }
  }
  return result;
}

// Gán user vào đúng 1 store group: gỡ khỏi mọi store group khác trước (enforce 1 shop),
// rồi add vào group mới. groupId rỗng => chỉ gỡ (về "không thuộc shop nào").
export async function setUserStoreGroup(userId: string, groupId: string | null): Promise<void> {
  const config = getKeycloakAdminConfig();
  const accessToken = await getAdminAccessToken(config);
  const current = await getUserGroupReps(config, accessToken, userId);
  for (const g of current) {
    if (isStoreGroup(g.name) && g.id !== groupId) {
      await fetch(
        `${config.serverUrl}/admin/realms/${config.realm}/users/${encodeURIComponent(userId)}/groups/${g.id}`,
        { method: "DELETE", headers: { Authorization: `Bearer ${accessToken}` }, cache: "no-store" }
      );
    }
  }
  if (groupId) {
    const res = await fetch(
      `${config.serverUrl}/admin/realms/${config.realm}/users/${encodeURIComponent(userId)}/groups/${groupId}`,
      { method: "PUT", headers: { Authorization: `Bearer ${accessToken}` }, cache: "no-store" }
    );
    if (!res.ok) {
      throw new Error(`Cannot add user '${userId}' to group '${groupId}'.`);
    }
  }
}
