# Signing in with Keycloak (e.g. ICR accounts)

Cinder can offer **Sign in with <label>** next to **Sign in with Google**. The
button signs people in with a Keycloak realm through OpenID Connect
(authorization code flow with PKCE). Google sign-in keeps working.

When the four `KEYCLOAK_*` variables are set, the server adds the provider and
the sign-in page shows the button. Without them, nothing changes.

| Variable                 | Example                                         |
| ------------------------ | ----------------------------------------------- |
| `KEYCLOAK_ISSUER`        | `https://auth.healthcampaigns.org/realms/icr` |
| `KEYCLOAK_CLIENT_ID`     | `cinder`                                        |
| `KEYCLOAK_CLIENT_SECRET` | the client's secret                             |
| `KEYCLOAK_LABEL`         | `ICR` (button text: "Sign in with ICR")         |

The issuer must be https, except on localhost.

## Rules

- **The email must be verified in Keycloak.** Cinder refuses a Keycloak sign-in
  whose email isn't marked as verified, and shows a message asking the person to
  get it verified. Cinder links accounts, accepts invitations, and adds members
  by email, so an unverified email must not count. When you create users, turn on
  **Email verified**.
- **Same email, one Cinder user.** If someone already signs in with Google (or
  any other method) and their verified Keycloak email is the same, both sign-ins
  reach the same Cinder user and the same orgs.
- **Google-token Healthcare API projects** (orgs set to use the user's own
  Google token) only work for people who signed in with Google. Service-account
  orgs and FHIR server projects work with either sign-in.
- **Signing out of Cinder doesn't sign you out of Keycloak.** While the
  Keycloak session lasts, "Sign in with ICR" logs straight back in without a
  password. Tell people on shared computers to sign out of Keycloak too, or
  close the browser.

## Which realm

The demo uses realm `icr`, the realm that also holds the gateway's API keys.
The ICR FHIR Info Gateway accepts any valid token from that realm
(`TOKEN_ISSUER` in the ICR compose file). So anyone with a user account in
`icr` can also get a token for themselves, for example through Keycloak's
account console, and read or write the FHIR API directly, outside Cinder. Only
give accounts to people who may have that access.

For a production setup, put Cinder users in a separate realm. Cinder gets its
access to the ICR data from the project's API key, not from the person's login,
so a separate realm takes nothing away in Cinder.

## Setting up the ICR Keycloak

On the ICR VM, from `/opt/icr-hapi/gcp` (the same way `gateway/api-key.sh`
runs), create the `cinder` client in realm `icr` and print its secret. The
realm is only created if it doesn't exist.

```bash
sudo docker compose exec -T keycloak bash -s <<'EOF'
set -euo pipefail
K=/opt/keycloak/bin/kcadm.sh
REALM=icr
CINDER=https://cinder.recodelabs.org
$K config credentials --server http://localhost:8080 --realm master \
  --user "$KC_BOOTSTRAP_ADMIN_USERNAME" --password "$KC_BOOTSTRAP_ADMIN_PASSWORD" >/dev/null
$K get "realms/$REALM" >/dev/null 2>&1 || \
  $K create realms -s realm=$REALM -s enabled=true -s displayName="ICR" \
    -s sslRequired=external -s registrationAllowed=false
id=$($K create clients -r $REALM -i -s clientId=cinder -s name=Cinder -s enabled=true \
  -s publicClient=false -s standardFlowEnabled=true -s directAccessGrantsEnabled=false \
  -s serviceAccountsEnabled=false -s implicitFlowEnabled=false \
  -s "redirectUris=[\"$CINDER/api/auth/oauth2/callback/keycloak\"]" -s "webOrigins=[\"$CINDER\"]" \
  -s 'attributes."pkce.code.challenge.method"=S256')
$K get "clients/$id/client-secret" -r $REALM
EOF
```

Add a person (they choose their own password at first sign-in):

```bash
sudo docker compose exec -T keycloak bash -s <<'EOF'
set -euo pipefail
K=/opt/keycloak/bin/kcadm.sh
REALM=icr
$K config credentials --server http://localhost:8080 --realm master \
  --user "$KC_BOOTSTRAP_ADMIN_USERNAME" --password "$KC_BOOTSTRAP_ADMIN_PASSWORD" >/dev/null
$K create users -r $REALM -s username=amina -s email=amina@example.org -s emailVerified=true \
  -s enabled=true -s firstName=Amina -s lastName=Bello
$K set-password -r $REALM --username amina --new-password 'a-temporary-password' --temporary
EOF
```

You can do the same in the admin console (https://auth.healthcampaigns.org/admin):
**Clients → Create client**, or **Users → Add user** with **Email verified** on,
then **Credentials → Set password** with **Temporary** on.

Then set the variables on the Cinder service in Railway and redeploy:

```bash
railway variable set KEYCLOAK_ISSUER=https://auth.healthcampaigns.org/realms/icr \
  KEYCLOAK_CLIENT_ID=cinder KEYCLOAK_LABEL=ICR KEYCLOAK_CLIENT_SECRET=<secret> --service cinder
```

A new user starts with no orgs. Add them to an org from its Members page, or
invite their email before they first sign in.

## Local testing

Run a throwaway Keycloak with a realm that has a `cinder` client whose redirect
URI is `http://localhost:3000/api/auth/oauth2/callback/keycloak` (or your
`BETTER_AUTH_URL`), then start the server with
`KEYCLOAK_ISSUER=http://localhost:8180/realms/<realm>` and the client's ID and
secret:

```bash
docker run -d --name cinder-test-keycloak -p 8180:8080 \
  -e KC_BOOTSTRAP_ADMIN_USERNAME=admin -e KC_BOOTSTRAP_ADMIN_PASSWORD=admin \
  quay.io/keycloak/keycloak:26.0.7 start-dev
```
