#!/usr/bin/env bash
# Apply LAN-hostname redirect URIs and SPNEGO flow settings to the currently
# running Keycloak realm without wiping the Keycloak volume.
set -euo pipefail

cd "$(dirname "$0")/.."

HOSTNAME="${1:-app.ecommerce.local}"
SCHEME="${SCHEME:-http}"
KC_ADMIN_URL="${KC_ADMIN_URL:-http://localhost:8080}"
REALM="${REALM:-ecommerce-realm}"
KERBEROS_SERVER_PRINCIPAL="${KERBEROS_SERVER_PRINCIPAL:-HTTP/$HOSTNAME@ECOMMERCE.LOCAL}"
KERBEROS_KEYTAB_PATH="${KERBEROS_KEYTAB_PATH:-/opt/keycloak/conf/keytabs/keycloak_app.keytab}"

set -a
source .env
set +a

HOSTNAME="$HOSTNAME" \
SCHEME="$SCHEME" \
KC_ADMIN_URL="$KC_ADMIN_URL" \
REALM="$REALM" \
KERBEROS_SERVER_PRINCIPAL="$KERBEROS_SERVER_PRINCIPAL" \
KERBEROS_KEYTAB_PATH="$KERBEROS_KEYTAB_PATH" \
node <<'NODE'
const host = process.env.HOSTNAME;
const scheme = process.env.SCHEME;
const base = process.env.KC_ADMIN_URL.replace(/\/$/, "");
const realm = process.env.REALM;
const principal = process.env.KERBEROS_SERVER_PRINCIPAL;
const keytabPath = process.env.KERBEROS_KEYTAB_PATH;

async function request(path, options = {}) {
  const res = await fetch(`${base}${path}`, {
    ...options,
    headers: {
      ...(options.headers || {}),
      ...(options.body ? { "content-type": "application/json" } : {}),
      ...(globalThis.token ? { authorization: `Bearer ${globalThis.token}` } : {}),
    },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`${options.method || "GET"} ${path} -> ${res.status}: ${text}`);
  }
  if (res.status === 204) return null;
  const text = await res.text();
  return text ? JSON.parse(text) : null;
}

function uniq(values) {
  return [...new Set(values.filter(Boolean))];
}

function logoutUris(current, additions) {
  return uniq(`${current || ""}`.split("##").concat(additions)).join("##");
}

const tokenRes = await fetch(`${base}/realms/master/protocol/openid-connect/token`, {
  method: "POST",
  headers: { "content-type": "application/x-www-form-urlencoded" },
  body: new URLSearchParams({
    grant_type: "password",
    client_id: "admin-cli",
    username: process.env.KEYCLOAK_ADMIN,
    password: process.env.KEYCLOAK_ADMIN_PASSWORD,
  }),
});
if (!tokenRes.ok) throw new Error(`Admin token failed: ${tokenRes.status} ${await tokenRes.text()}`);
globalThis.token = (await tokenRes.json()).access_token;

const realmConfig = await request(`/admin/realms/${realm}`);
if (realmConfig.verifyEmail !== false) {
  realmConfig.verifyEmail = false;
  await request(`/admin/realms/${realm}`, { method: "PUT", body: JSON.stringify(realmConfig) });
  console.log("set realm verifyEmail=false");
}

const clients = [
  { clientId: "nextjs-app", port: 3000, extraPorts: [8000] },
  { clientId: "seller-workspace", port: 3100 },
  { clientId: "shoppay-app", port: 3200 },
  { clientId: "shopfood-app", port: 3300 },
  { clientId: "admin-portal", port: 3400, wildcard: true },
];

for (const spec of clients) {
  const found = await request(`/admin/realms/${realm}/clients?clientId=${encodeURIComponent(spec.clientId)}`);
  if (!found?.[0]?.id) throw new Error(`Client not found: ${spec.clientId}`);
  const client = await request(`/admin/realms/${realm}/clients/${found[0].id}`);

  const origins = [`${scheme}://${host}:${spec.port}`];
  const redirects = [
    `${scheme}://${host}:${spec.port}`,
    `${scheme}://${host}:${spec.port}/`,
    `${scheme}://${host}:${spec.port}/api/auth/callback/keycloak`,
  ];
  if (spec.wildcard) redirects.push(`${scheme}://${host}:${spec.port}/*`);
  for (const p of spec.extraPorts || []) {
    origins.push(`${scheme}://${host}:${p}`);
    redirects.push(`${scheme}://${host}:${p}`, `${scheme}://${host}:${p}/`, `${scheme}://${host}:${p}/api/auth/callback/keycloak`);
  }

  client.redirectUris = uniq([...(client.redirectUris || []), ...redirects]);
  client.webOrigins = uniq([...(client.webOrigins || []), ...origins]);
  client.attributes = client.attributes || {};
  client.attributes["frontchannel.logout.url"] = `${scheme}://${host}:${spec.port}/api/auth/frontchannel-logout`;
  client.attributes["post.logout.redirect.uris"] = logoutUris(client.attributes["post.logout.redirect.uris"], origins.flatMap((o) => [o, `${o}/`]));

  await request(`/admin/realms/${realm}/clients/${client.id}`, { method: "PUT", body: JSON.stringify(client) });
  console.log(`updated client ${spec.clientId}`);
}

async function setExecutionRequirement(flowAlias, providerId, requirement) {
  let executions = await request(`/admin/realms/${realm}/authentication/flows/${encodeURIComponent(flowAlias)}/executions`);
  let execution = executions.find((item) => item.providerId === providerId);
  if (!execution) {
    await request(`/admin/realms/${realm}/authentication/flows/${encodeURIComponent(flowAlias)}/executions/execution`, {
      method: "POST",
      body: JSON.stringify({ provider: providerId }),
    });
    executions = await request(`/admin/realms/${realm}/authentication/flows/${encodeURIComponent(flowAlias)}/executions`);
    execution = executions.find((item) => item.providerId === providerId);
  }
  if (!execution) throw new Error(`Execution ${providerId} not found in ${flowAlias}`);
  if (execution.requirement !== requirement) {
    await request(`/admin/realms/${realm}/authentication/flows/${encodeURIComponent(flowAlias)}/executions`, {
      method: "PUT",
      body: JSON.stringify({ id: execution.id, requirement }),
    });
  }
  for (let i = 0; i < 5; i++) {
    executions = await request(`/admin/realms/${realm}/authentication/flows/${encodeURIComponent(flowAlias)}/executions`);
    execution = executions.find((item) => item.providerId === providerId);
    if (!execution || execution.index <= 1) break;
    await request(`/admin/realms/${realm}/authentication/executions/${execution.id}/raise-priority`, { method: "POST" });
  }
  for (let i = 0; i < 5; i++) {
    executions = await request(`/admin/realms/${realm}/authentication/flows/${encodeURIComponent(flowAlias)}/executions`);
    execution = executions.find((item) => item.providerId === providerId);
    if (!execution || execution.index >= 1) break;
    await request(`/admin/realms/${realm}/authentication/executions/${execution.id}/lower-priority`, { method: "POST" });
  }
  console.log(`set ${flowAlias}/${providerId}=${requirement}`);
}

await setExecutionRequirement("browser", "auth-spnego", "ALTERNATIVE");
await setExecutionRequirement("shoppay-alternatives", "auth-spnego", "ALTERNATIVE");

const providers = await request(`/admin/realms/${realm}/components?type=org.keycloak.storage.UserStorageProvider`);
for (const provider of providers.filter((item) => item.providerId === "ldap")) {
  provider.config = provider.config || {};
  if (provider.config.allowKerberosAuthentication?.[0] === "true") {
    provider.config.serverPrincipal = [principal];
    provider.config.keyTab = [keytabPath];
    await request(`/admin/realms/${realm}/components/${provider.id}`, { method: "PUT", body: JSON.stringify(provider) });
    console.log(`updated LDAP Kerberos keytab path for ${provider.name}`);
  }
}
NODE
