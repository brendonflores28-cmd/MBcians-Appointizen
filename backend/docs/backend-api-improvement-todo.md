# Backend API Improvement TODO

## Goal

Move the current backend from a functional role-based application API to a professional, maintainable, and production-hardened service.

## Priority Model

- `P0`: fix now because it affects correctness, safety, or current usability
- `P1`: high-value hardening needed for professional standards
- `P2`: medium-term scalability and maintainability work
- `P3`: strategic improvements for long-term maturity

## P0: Correctness and Contract Fixes

- Fix the admin rejection flow so the frontend sends `rejectionReason` when `action=reject`, or split reject into a dedicated endpoint with a dedicated modal.
- Rename or refactor cashier payment review routes so the identifier is unambiguous:
  `PATCH /cashier/payments/:paymentId/approve`
  `PATCH /cashier/payments/:paymentId/reject`
- Decide whether `appointments.payment_status` is truly required. If yes, document it as a derived workflow field and enforce synchronized writes centrally. If no, remove the duplication.
- Add transition guards at the SQL level for critical mutations by using `SELECT ... FOR UPDATE` or conditional `UPDATE ... WHERE status = ?` patterns.
- Fix contract duplication in dashboard stats:
  remove or clearly differentiate `activeAppointments` vs `inProgressAppointments`
  remove or clearly differentiate `assignedToMe` vs `readyRequests`
- Align `README.md` demo credentials with the actual SQL seed data.
- Audit all status-transition responses and ensure each mutation returns the same canonical appointment projection shape.

## P1: API Professionalization

- Publish an OpenAPI 3 specification as the source of truth for routes, schemas, auth, and errors.
- Introduce versioning, for example `/api/v1`.
- Standardize route design:
  either fully action-oriented with a consistent transition pattern
  or resource-oriented with clearly modeled state transitions
- Add stable machine-readable error codes such as:
  `AUTH_INVALID_TOKEN`
  `APPOINTMENT_NOT_FOUND`
  `PAYMENT_ALREADY_PAID`
  `TIME_SLOT_FULL`
- Add field-level validation payloads for form errors.
- Add request correlation ids and include them in error responses and logs.
- Add structured logging for auth failures, important mutations, and unexpected errors.
- Strengthen socket authentication by reloading the user from MySQL and validating `account_status`.
- Decide how maintenance mode should affect sockets, and enforce that policy explicitly.
- Add endpoint-level authorization tests for every role boundary.

## P1: Security Hardening

- Add refresh tokens or session records for revocation and controlled logout.
- Add server-side token revocation for disabled users and sensitive admin actions.
- Add password reset and password change flows.
- Add account recovery messaging and audit logs for credential events.
- Add suspicious-auth detection and optional lockout/escalation rules for repeated login failures.
- Review whether localStorage-based auth is acceptable for the deployment context; if not, migrate to a safer session strategy.
- Add explicit file-signature validation for uploaded images, not only MIME-type filtering.

## P1: Data Integrity and Workflow Safety

- Centralize appointment transition logic in a dedicated service instead of spreading it across multiple controllers.
- Define a formal state-transition matrix for:
  appointments
  payments
  actor-role permissions
- Enforce transition rules in one place so head, staff, cashier, and admin actions cannot drift over time.
- Add idempotency protections for actions that may be retried by users or clients.
- Record who approved appointments and who reviewed payments in a consistent outward-facing response model.
- Decide the business policy for cancelling already-paid appointments and implement refund/reversal handling if needed.

## P1: Testing

- Add integration tests for:
  registration
  login
  auth middleware
  maintenance mode
  appointment creation
  slot-capacity enforcement
  payment submission
  payment approval/rejection
  appointment approval/rejection
  assignment
  processing completion
- Add race-condition tests for slot booking and concurrent review actions.
- Add serializer contract tests so frontend-critical response shapes do not drift silently.
- Add upload validation tests for file type and size rules.

## P2: Read Model and Performance Improvements

- Split dashboard endpoints into summary and collection endpoints.
- Add pagination for:
  appointments
  users
  notifications
  activity logs
- Add server-side filtering and sorting for admin, cashier, staff, and student appointment lists.
- Add indexes based on real query patterns after measuring production access.
- Stop returning entire collections by default once data volume grows.
- Consider lighter response projections for list views and a separate detail endpoint for full appointment data.

## P2: Media and Storage Improvements

- Move payment proof media out of inline MySQL storage into object storage or a dedicated file service.
- Store only a durable media URL plus metadata in the database.
- Add image size normalization or compression before persistence.
- Add retention and deletion rules for uploaded payment media.
- Add checksum or content hash fields for duplicate detection and integrity validation.

## P2: Database and Migration Discipline

- Introduce a real migration framework.
- Separate schema migrations from development seed data.
- Keep destructive bootstrap SQL only for local resets, not operational deployment.
- Add safe migration scripts for production upgrades.
- Add database constraints or transition-safe unique checks where business invariants depend on state.

## P2: Developer Experience

- Add a backend `.env.example` section to documentation that exactly matches required runtime keys.
- Add API examples for every route in a generated or validated format.
- Add a Postman collection or equivalent API test collection.
- Add local scripts for:
  test
  lint
  format
  seed
  reset-db
- Add backend code style and contribution guidance.

## P3: Architectural Refinement

- Consider moving role-specific route groups toward a more resource-centric API:
  `/appointments`
  `/payments`
  `/users`
  `/settings`
  `/notifications`
- Model transitions as explicit commands with a shared command schema if action endpoints remain preferred.
- Separate command and query models if dashboard complexity continues to grow.
- Consider extracting notification delivery and audit logging into dedicated modules with clearer event contracts.
- Introduce background jobs if payment proof processing, reporting, or notification fan-out becomes heavier.

## P3: Observability and Operations

- Add metrics for:
  request count
  latency
  error rate
  auth failures
  payment review throughput
  appointment status distribution
- Add health/readiness separation:
  liveness
  database readiness
  configuration readiness
- Add alerting for abnormal spikes in:
  failed logins
  5xx responses
  payment rejections
  slot-capacity conflicts
- Add audit review tooling for admins if governance requirements grow.

## Suggested Execution Order

1. Fix current contract mismatches and route semantics.
2. Centralize state transitions and add workflow tests.
3. Introduce OpenAPI, error codes, and request tracing.
4. Add pagination and split heavy dashboard reads.
5. Move payment proof media out of MySQL.
6. Add migration discipline and stronger operational tooling.

## Definition of "Professional Standard" for This API

The API will be much closer to professional standard when it has all of the following:

- clear and consistent route semantics
- accurate and versioned documentation
- formal schema definitions
- reliable transition rules
- meaningful automated tests
- pagination and scalable read patterns
- secure session and socket handling
- structured logs and request tracing
- non-destructive migration workflow
- durable, non-inline media storage
