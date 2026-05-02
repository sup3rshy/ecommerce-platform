type KeycloakAdminConfig = {
  serverUrl: string;
  realm: string;
  adminClientId: string;
  adminClientSecret: string;
};

type KeycloakRoleRepresentation = {
  id: string;
  name: string;
};

type KeycloakUserRepresentation = {
  id: string;
  username?: string;
  firstName?: string;
  lastName?: string;
  email?: string;
};

export type KeycloakUserWithRoles = {
  id: string;
  username: string | null;
  fullName: string | null;
  email: string | null;
  roles: string[];
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

  return {
    serverUrl,
    realm,
    adminClientId,
    adminClientSecret,
  };
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
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
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
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
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
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
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

export async function getKeycloakUserCount(): Promise<number | null> {
  try {
    const config = getKeycloakAdminConfig();
    const accessToken = await getAdminAccessToken(config);
    const usersEndpoint = `${config.serverUrl}/admin/realms/${config.realm}/users/count`;

    const response = await fetch(usersEndpoint, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
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
      const roles = await getUserRealmRoles(config, accessToken, user.id);
      const firstName = user.firstName?.trim() ?? "";
      const lastName = user.lastName?.trim() ?? "";
      const fullName = `${firstName} ${lastName}`.trim();

      return {
        id: user.id,
        username: user.username ?? null,
        fullName: fullName || null,
        email: user.email ?? null,
        roles,
      };
    })
  );

  return usersWithRoles;
}