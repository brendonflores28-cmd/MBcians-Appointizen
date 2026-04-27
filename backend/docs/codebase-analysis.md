# Codebase Analysis

## Executive Summary

MBCIANS APPOINTIZEN is a role-driven registrar appointment platform implemented as a monorepo with:

- a Vite + vanilla JavaScript frontend in `frontend/`
- an Express + Socket.IO backend in `backend/`
- a MySQL bootstrap schema in `database/`

The codebase is organized clearly and already supports a meaningful end-to-end workflow:

1. student registration and login
2. appointment booking
3. payment submission
4. registrar-head approval and staff assignment
5. cashier verification
6. registrar-staff processing
7. admin catalog and system management

From an architecture standpoint, the project is beyond prototype level. It already has:

- role-based authorization
- centralized validation helpers
- transaction support
- audit logging
- notifications
- real-time updates through Socket.IO
- a reasonably normalized relational schema

The biggest maturity gap is not feature completeness. It is API rigor. The current backend is functional and internally coherent, but it still behaves like an application backend tightly coupled to its own frontend rather than a professionally hardened API platform.

## Repository Structure

Top-level structure:

- `backend/`: API server, business logic, sockets, middleware, helpers
- `frontend/`: multi-role portal UI with shared transport/auth helpers
- `database/`: full bootstrap SQL, seed data, and initial schema
- `README.md`: setup and deployment guidance

Operationally, the project is a monorepo but not a shared-package monorepo. The frontend and backend are separate apps coordinated from the root with npm scripts.

## Backend Architecture

### Entry Point and Runtime

`backend/server.js` is responsible for:

- environment validation
- CORS and Helmet configuration
- JSON and form-body parsing
- health endpoint exposure at `GET /api/health`
- maintenance middleware registration
- route mounting
- Socket.IO initialization
- graceful shutdown handling
- startup schema checks

The backend uses:

- Express 5
- MySQL via `mysql2/promise`
- JWT for stateless auth
- Socket.IO for real-time notifications
- Multer for in-memory file uploads

### Layering

The backend is divided into sensible layers:

- `routes/`: endpoint registration and middleware composition
- `controllers/`: request parsing, orchestration, state transitions
- `services/`: reusable domain queries and notification logic
- `middlewares/`: auth, error handling, uploads, maintenance, rate limiting
- `utils/`: validation, serialization, JWT, audit logging, runtime helpers
- `db.js`: connection pool and transaction wrapper

This is a healthy separation for a small-to-medium application. Controllers are still somewhat large, but the project has avoided the worst anti-pattern of placing everything in `server.js`.

### Database Access Pattern

Database access is handled through:

- `query(sql, params)`
- `queryOne(sql, params)`
- `withTransaction(handler)`

The transaction wrapper is one of the stronger parts of the codebase. It not only commits or rolls back, it also defers socket events until after commit through `__deferredSocketEvents`, which avoids broadcasting state that never actually persisted.

### Business Domain Model

The schema models the registrar domain well:

- `users`
- `settings`
- `document_types`
- `time_slots`
- `blocked_dates`
- `appointments`
- `payments`
- `payment_history`
- `notifications`
- `activity_logs`

The appointment workflow is the backbone of the system. Most other entities exist to support it.

## Frontend Architecture

### General Structure

The frontend is a multi-page Vite application with separate portals for:

- `student/`
- `admin/`
- `cashier/`
- `head/`
- `staff/`

Shared runtime behavior is concentrated in:

- `frontend/shared/api.js`
- `frontend/shared/auth.js`
- `frontend/shared/socket.js`
- `frontend/shared/portal.js`

This is a strong choice for a vanilla JavaScript app. The shared portal shell reduces repeated code and gives each role-specific page a common lifecycle:

1. require session
2. load `/me`
3. load notifications
4. load role dashboard
5. connect socket
6. silently refresh on real-time events

### API Coupling

The frontend is tightly coupled to backend response shapes. This is not inherently bad for an internal product, but it does mean:

- most endpoints are dashboard-oriented instead of resource-oriented
- API contracts are driven by screen needs
- changes to serializers affect multiple portals immediately

This pattern is efficient for shipping, but it raises long-term maintenance risk when the frontend grows or a second client is introduced.

## Core Workflow Analysis

### Authentication

Auth is token-based:

- `POST /api/register`
- `POST /api/login`
- `GET /api/me`
- `POST /api/logout`

Sessions are stored in browser `localStorage`. The backend does not persist sessions and does not revoke JWTs on logout.

### Appointment Creation

Students create appointments through `POST /api/student/appointments`.

The backend correctly enforces:

- valid document type
- valid time slot
- non-blocked date
- future-or-today date rule
- enabled payment method
- slot capacity

Booking is the most concurrency-aware flow in the codebase because it uses row locking to prevent oversubscription.

### Payment Handling

Every appointment has a payment record. The backend distinguishes:

- appointment-level `payment_status`
- payment-record `status`

That allows the UI to express business state, but it also creates duplication and drift risk.

GCash proof images are stored as base64 data URLs in MySQL. This works operationally, but it is not ideal for scale or long-term maintainability.

### Approval and Fulfillment

The workflow is role-separated:

- registrar head approves or rejects appointments
- registrar head assigns staff
- cashier approves or rejects submitted payments
- registrar staff marks cash paid, starts processing, and completes work
- admin can manage catalog/system data and also directly control appointment transitions

This role model is well aligned with the business domain.

## API Shape Analysis

The backend exposes a hybrid API style:

- some endpoints are resource-like
- many endpoints are action-style
- most role dashboards return denormalized aggregates

Examples:

- resource-like: `GET /api/common/notifications`
- action-style: `PATCH /api/head/appointments/:id/approve`
- dashboard-style: `GET /api/admin/dashboard`

This is practical for the current frontend, but it is not especially clean as a public or partner-facing API. A more professional API would reduce endpoint semantics like "approve", "reject", and "mark_paid" as bespoke routes and would formalize transitions more consistently.

## Real-Time Architecture

Socket.IO is used for:

- notifications
- appointment refresh triggers
- payment refresh triggers
- settings refresh triggers
- catalog refresh triggers

The room strategy is simple and effective:

- `user:{id}`
- `role:{role}`

This is a good fit for the current product. The backend wisely emits after transaction commit in flows that pass a DB executor through notification creation.

## Validation and Error Handling

Validation is centralized in `backend/utils/validation.js`, which improves consistency across controllers. Error handling is also centralized through `AppError` and `error.middleware.js`.

Strengths:

- validation is readable and easy to follow
- operational errors return a stable JSON shape
- Multer upload failures are normalized

Limitations:

- there is no machine-readable error code system
- validation errors are single-message oriented
- there is no request correlation id
- non-operational logging is plain console output

## Security Analysis

Positive aspects:

- role-based authorization exists
- JWT expiration is configurable
- rate limiting exists for login and registration
- CORS is explicitly constrained
- Helmet is enabled
- uploads are MIME-filtered and size-limited

Gaps:

- JWTs are stored in `localStorage`
- logout is not revocation
- sockets validate token signature but do not re-check active user status from the database
- no refresh-token rotation
- no password reset flow
- no account lockout / brute-force anomaly tracking beyond route rate limits

## Performance and Scalability Analysis

The codebase is fine for low-to-moderate traffic, but several design choices will become pressure points:

- dashboard endpoints load large denormalized datasets
- no pagination exists for appointments, users, or notifications
- payment proof images are stored inline in MySQL rows
- multiple endpoints re-fetch entire appointment objects after every mutation
- there is no query abstraction for projection-specific reads

For the current product size this is acceptable. For institutional growth it will need refactoring.

## Operational Maturity

What is already good:

- environment-based runtime configuration
- health endpoint
- graceful shutdown
- setup instructions in README
- seeded data for local verification

What is still immature:

- no automated tests
- no migrations framework
- bootstrap SQL is destructive by design
- no OpenAPI specification
- no versioned API namespace
- no structured logging or metrics
- no background job model

## Notable Cross-Codebase Findings

### 1. Documentation and Seed Data Are Out of Sync

`README.md` lists demo accounts and passwords that do not match `database/mbciansappointizen.sql`.

Current SQL seed values use:

- emails under `@mbciansappointizen.app`
- the comment `Welcome123!`

The README currently references:

- emails under `@mbciansappointizen.local`
- the password `ChangeMe123!`

This is a concrete operational risk because it creates false expectations during QA and deployment verification.

### 2. The Backend Is Frontend-First

This is visible in several ways:

- dashboard endpoints are the primary read model
- many mutations return only `{ message }` or `{ message, appointment }`
- routes are organized by role rather than bounded resources

That works well for a single in-house client. It is less suitable for broader integration.

### 3. Concurrency Hardening Is Uneven

Appointment creation is carefully locked.

Most later status transitions are not.

That means the most concurrency-sensitive write path is protected, but many administrative and workflow transitions are still vulnerable to conflicting updates under simultaneous actions.

### 4. The Notification and Audit Story Is Strong for This Project Size

The combination of:

- `activity_logs`
- `notifications`
- role/user socket rooms
- deferred post-commit emits

is a meaningful strength and gives the product a much more professional operational feel than many CRUD apps of similar size.

## Overall Assessment

This is a capable full-stack institutional workflow system with good feature coverage and a sensible code organization. Its strongest qualities are:

- domain fit
- role separation
- pragmatic transaction use
- auditability
- real-time coordination

Its main weaknesses are:

- API contract maturity
- inconsistent endpoint semantics
- missing tests and migrations
- scalability limits around dashboard reads and inline media storage
- some frontend/backend contract mismatches

In short:

- as an application backend, it is solid and useful
- as a professional-grade API platform, it still needs hardening, standardization, and operational discipline
