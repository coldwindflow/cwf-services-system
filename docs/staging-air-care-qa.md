# CWF AIR CARE staging QA identity

This repository provides a designated identity and acceptance runner for the
AIR CARE write path on staging. It is an operator tool, not a public login
endpoint, and it uses the existing `customer_profiles`, `customer_identities`,
`users`, `auth_sessions`, JWT, order, entitlement, and booking models.

The runner has three independent fail-closed checks:

- its only accepted environment argument is `staging`;
- its only accepted application container is `cwf-staging-app`;
- it requires the staging Actions secret `CWF_STAGING_QA_SECRET` (at least 32
  characters). The secret is never committed or printed.

The secret must be configured as a GitHub Actions repository secret before the
staging setup gate runs. Production workflows do not reference this secret and
the runner rejects `production`, unknown environments, and the production
container name.

The deterministic QA customer, admin, and isolated technician are clearly
marked `CWF STAGING QA`. Provisioning is idempotent and refuses to overwrite a
conflicting identity. The isolated technician prevents acceptance from sending
a staged job to a normal technician.

The workflow `CWF AIR CARE Staging QA` supports `provision`, `accept`, and
`cleanup`. Acceptance creates only staging transactions, records redacted
evidence, cancels/deletes its QA jobs through the existing Admin lifecycle, and
then deletes only prepaid entitlements/orders owned by the designated QA
customer. It never operates on production data.

Staging does not expose the normal customer OAuth/JWT secret. For `accept`, the
operator starts the exact deployed application in the staging container on an
unpublished loopback-only port and supplies `CWF_STAGING_QA_SECRET` as the
application's existing `CWF_JWT_SECRET`. The acceptance requests therefore use
the normal JWT middleware and live staging database without adding a public QA
login route or a parallel authentication implementation. The temporary process
is always stopped by a shell trap.
