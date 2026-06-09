#!/usr/bin/env bash
# Apply the localhost Google/SMTP demo settings to the running Keycloak realm.
# This does not wipe volumes. It intentionally disables LDAP federation so Google
# broker login does not block on an offline local AD/DC during the localhost demo.
set -euo pipefail

cd "$(dirname "$0")/.."

KC_ADMIN_URL="${KC_ADMIN_URL:-http://localhost:8080}"
REALM="${REALM:-ecommerce-realm}"

set -a
source .env
set +a

KC_ADMIN_URL="$KC_ADMIN_URL" \
REALM="$REALM" \
node <<'NODE'
const base = process.env.KC_ADMIN_URL.replace(/\/$/, "");
const realm = process.env.REALM;

async function request(path, options = {}) {
  const res = await fetch(`${base}${path}`, {
    ...options,
    headers: {
      ...(options.headers || {}),
      ...(options.body ? { "content-type": "application/json" } : {}),
      ...(globalThis.token ? { authorization: `Bearer ${globalThis.token}` } : {}),
    },
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`${options.method || "GET"} ${path} -> ${res.status}: ${text}`);
  }
  return text ? JSON.parse(text) : null;
}

async function setExecutionRequirement(flowAlias, providerId, requirement) {
  const executions = await request(
    `/admin/realms/${realm}/authentication/flows/${encodeURIComponent(flowAlias)}/executions`
  );
  const execution = executions.find((item) => item.providerId === providerId);
  if (!execution) throw new Error(`Execution ${providerId} not found in ${flowAlias}`);
  if (execution.requirement !== requirement) {
    await request(`/admin/realms/${realm}/authentication/flows/${encodeURIComponent(flowAlias)}/executions`, {
      method: "PUT",
      body: JSON.stringify({ id: execution.id, requirement }),
    });
  }
  console.log(`set ${flowAlias}/${providerId}=${requirement}`);
}

async function setRequiredAction(alias, values) {
  const actions = await request(`/admin/realms/${realm}/authentication/required-actions`);
  const action = actions.find((item) => item.alias === alias || item.providerId === alias);
  if (!action) throw new Error(`Required action ${alias} not found`);
  const updated = { ...action, ...values };
  await request(`/admin/realms/${realm}/authentication/required-actions/${encodeURIComponent(action.alias)}`, {
    method: "PUT",
    body: JSON.stringify(updated),
  });
  console.log(`set required action ${action.alias}: enabled=${updated.enabled}, defaultAction=${updated.defaultAction}`);
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
realmConfig.verifyEmail = true;
realmConfig.registrationAllowed = true;
realmConfig.resetPasswordAllowed = true;
realmConfig.loginWithEmailAllowed = true;
realmConfig.emailTheme = "ecommerce";
await request(`/admin/realms/${realm}`, { method: "PUT", body: JSON.stringify(realmConfig) });
console.log("updated realm login/email flags");

await setRequiredAction("VERIFY_EMAIL", { enabled: true, defaultAction: false });

const google = await request(`/admin/realms/${realm}/identity-provider/instances/google`);
google.enabled = true;
google.trustEmail = true;
google.config = google.config || {};
google.config.clientId = process.env.GOOGLE_IDP_CLIENT_ID;
google.config.clientSecret = process.env.GOOGLE_IDP_CLIENT_SECRET;
google.config.syncMode = "IMPORT";
await request(`/admin/realms/${realm}/identity-provider/instances/google`, {
  method: "PUT",
  body: JSON.stringify(google),
});
console.log("updated google IdP");

await setExecutionRequirement("browser", "auth-spnego", "DISABLED");
await setExecutionRequirement("shoppay-alternatives", "auth-spnego", "DISABLED");

const providers = await request(`/admin/realms/${realm}/components?type=org.keycloak.storage.UserStorageProvider`);
for (const provider of providers.filter((item) => item.providerId === "ldap")) {
  provider.config = provider.config || {};
  if (provider.config.enabled?.[0] !== "false") {
    provider.config.enabled = ["false"];
    await request(`/admin/realms/${realm}/components/${provider.id}`, {
      method: "PUT",
      body: JSON.stringify(provider),
    });
    console.log(`disabled LDAP provider ${provider.name}`);
  } else {
    console.log(`LDAP provider ${provider.name} already disabled`);
  }
}
NODE

echo
echo "Done. Also run: bash scripts/use-local-domain.sh localhost"
