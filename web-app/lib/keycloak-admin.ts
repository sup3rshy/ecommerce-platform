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
  const tokenEndpoint = `${config.serverUrl}/realms/${config.realm}/protocol/openid-connect/token`;
  const body = new URLSearchParams({
    grant_type: "client_credentials",
    client_id: config.adminClientId,
    client_secret: config.adminClientSecret,
  });

  const response = await fetch(tokenEndpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body,
    cache: "no-store",
  });

  const payload = (await response.json().catch(() => null)) as { access_token?: string } | null;

  if (!response.ok || !payload?.access_token) {
    throw new Error("Cannot obtain Keycloak admin access token.");
  }

  return payload.access_token;
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