# Backend API Documentation

## Overview

This document describes the backend API implemented in `backend/` for MBCIANS APPOINTIZEN.

Base assumptions:

- API base path: `/api`
- auth model: Bearer JWT
- content type: `application/json` unless otherwise stated
- upload handling: `multipart/form-data` for payment-proof image submission
- default timezone behavior: `APP_TIMEZONE`, falling back to `Asia/Manila`

## Technology Stack

- Node.js
- Express 5
- MySQL 8
- Socket.IO 4
- JWT authentication
- Multer for payment-proof uploads

## Authentication Model

The backend uses stateless JWT authentication.

How it works:

1. client logs in or registers
2. backend returns `{ user, role, token }`
3. client stores token and sends `Authorization: Bearer <token>`
4. middleware validates the token and reloads the current user from MySQL

Important behavior:

- disabled accounts are rejected even if the JWT is still structurally valid
- logout does not revoke tokens server-side
- token expiration is controlled by `JWT_EXPIRES_IN`

## Roles

Supported roles:

- `student`
- `admin`
- `cashier`
- `registrar_staff`
- `registrar_head`

## Maintenance Mode

When `settings.maintenance_mode = 1`, the backend blocks almost all API traffic for non-admins.

Allowed during maintenance:

- `GET /api/health`
- `POST /api/login`
- `POST /api/register`
- any request from an authenticated active admin

Blocked during maintenance:

- all other API routes for non-admins

Typical response:

```json
{
  "message": "The system is currently under scheduled maintenance. We sincerely apologize for any inconvenience. Please try again shortly.",
  "details": null
}
```

Status code:

- `503 Service Unavailable`

## Rate Limiting

Rate-limited routes:

- `POST /api/login`: 20 requests per 15 minutes
- `POST /api/register`: 10 requests per 30 minutes

Rate-limit response:

```json
{
  "message": "Too many login attempts. Please try again later.",
  "details": "Login rate limit exceeded. Try again in a few minutes."
}
```

## Standard Error Format

Most API errors use this shape:

```json
{
  "message": "Human-readable error message.",
  "details": null
}
```

Common status codes:

- `400` bad request or validation failure
- `401` authentication required / invalid token
- `403` forbidden
- `404` not found
- `409` conflict
- `429` rate limited
- `500` unexpected server error
- `503` maintenance mode

## Data Contracts

### User

```json
{
  "id": 5,
  "firstname": "Juan",
  "lastname": "Dela Cruz",
  "fullName": "Juan Dela Cruz",
  "email": "student@mbciansappointizen.app",
  "phone": "09123456783",
  "studentId": "MBC2024-12345",
  "role": "student",
  "accountStatus": "active",
  "createdAt": "2026-04-24T04:48:00.000Z"
}
```

### Notification

```json
{
  "id": 1,
  "userId": 5,
  "title": "Appointment approved",
  "message": "APT-20260420-1001 is approved and awaiting payment verification.",
  "type": "success",
  "referenceType": "appointment",
  "referenceId": 1,
  "isRead": false,
  "createdAt": "2026-04-24T08:00:00.000Z"
}
```

### Settings

```json
{
  "orgName": "Mindoro State University - Bongabong Campus Registrar",
  "orgEmail": "registrar.bongabong@minsu.edu.ph",
  "orgPhone": "09537100668",
  "officeHours": "8:00 AM - 5:00 PM, Monday to Friday",
  "gcashEnabled": true,
  "gcashName": "Mindoro State University Registrar",
  "gcashNumber": "09537100668",
  "gcashQrImage": "/assets/qr-code.jpg",
  "cashEnabled": true,
  "maintenanceMode": false
}
```

### Document Type

```json
{
  "id": 1,
  "name": "Transcript of Records",
  "description": "Official academic record for transferring, employment, and scholarship requirements.",
  "baseFee": 150,
  "copyFee": 25,
  "rushFee": 100,
  "processingDays": 5,
  "isActive": true
}
```

### Time Slot

```json
{
  "id": 2,
  "startTime": "09:00:00",
  "endTime": "10:00:00",
  "maxAppointments": 8,
  "isActive": true
}
```

### Blocked Date

```json
{
  "id": 1,
  "blockedDate": "2026-05-01",
  "reason": "Labor Day holiday."
}
```

### Appointment

```json
{
  "id": 1,
  "referenceNo": "APT-20260420-1001",
  "studentId": 5,
  "studentName": "Juan Dela Cruz",
  "studentEmail": "student@mbciansappointizen.app",
  "studentPhone": "09123456783",
  "studentIdentifier": "MBC2024-12345",
  "documentTypeId": 1,
  "documentName": "Transcript of Records",
  "appointmentDate": "2026-04-24",
  "timeSlotId": 2,
  "startTime": "09:00:00",
  "endTime": "10:00:00",
  "maxAppointments": 8,
  "copies": 2,
  "isRush": true,
  "purpose": "Requirement for scholarship renewal",
  "remarks": "Please prepare two copies.",
  "rejectionReason": null,
  "status": "approved",
  "paymentStatus": "for_verification",
  "assignedStaffId": 4,
  "assignedStaffName": "Registrar Staff",
  "createdAt": "2026-04-24T03:00:00.000Z",
  "updatedAt": "2026-04-24T05:00:00.000Z",
  "payment": {
    "id": 1,
    "amount": 300,
    "method": "gcash",
    "proofImage": "data:image/jpeg;base64,...",
    "referenceNumber": "GCASH-APR-1001",
    "status": "for_verification",
    "rejectionReason": null,
    "reviewedAt": null,
    "createdAt": "2026-04-24T03:00:00.000Z",
    "updatedAt": "2026-04-24T03:00:00.000Z"
  }
}
```

Notes:

- `proofImage` may be intentionally nulled in student dashboard responses
- `paymentStatus` belongs to the appointment record
- `payment.status` belongs to the payment record

## State Machines

### Appointment Statuses

- `pending`
- `approved`
- `assigned`
- `processing`
- `completed`
- `rejected`
- `cancelled`

### Payment Statuses

Payment record statuses:

- `pending`
- `for_verification`
- `paid`
- `rejected`

Appointment payment statuses:

- `unpaid`
- `for_verification`
- `paid`
- `rejected`

### Typical Workflow

Cash booking:

1. appointment created as `pending`
2. payment record created as `pending`
3. appointment payment status set to `unpaid`
4. head approves appointment
5. cashier, staff, or admin marks payment as `paid`
6. staff or admin moves appointment to `processing`
7. staff or admin completes appointment

GCash booking at submission time:

1. appointment created as `pending`
2. payment record created as `for_verification`
3. appointment payment status set to `for_verification`
4. head approves appointment
5. cashier approves or rejects payment
6. once paid, staff or admin may process and complete

## Endpoint Reference

### Health

#### `GET /api/health`

Purpose:

- simple health and readiness check

Authentication:

- not required

Response:

```json
{
  "status": "ok",
  "databaseReady": true,
  "timestamp": "2026-04-26T11:34:10.123Z",
  "timezone": "Asia/Manila",
  "originsConfigured": true
}
```

### Auth

#### `POST /api/register`

Purpose:

- create a new student account

Authentication:

- not required

Rate limit:

- yes

Request body:

```json
{
  "firstname": "Juan",
  "lastname": "Dela Cruz",
  "email": "juan@example.com",
  "phone": "09123456789",
  "student_id": "MBC2024-12345",
  "password": "Welcome123!"
}
```

Validation rules:

- firstname: required, 2 to 100 chars
- lastname: required, 2 to 100 chars
- email: valid email
- phone: must match `09XXXXXXXXX`
- student_id: must match `MBC2024-12345`
- password: minimum 8 chars

Success response:

```json
{
  "user": {
    "id": 15,
    "firstname": "Juan",
    "lastname": "Dela Cruz",
    "fullName": "Juan Dela Cruz",
    "email": "juan@example.com",
    "phone": "09123456789",
    "studentId": "MBC2024-12345",
    "role": "student",
    "accountStatus": "active",
    "createdAt": "2026-04-26T11:35:10.123Z"
  },
  "role": "student",
  "token": "<jwt>"
}
```

Status:

- `201 Created`

#### `POST /api/login`

Purpose:

- authenticate any active user

Authentication:

- not required

Rate limit:

- yes

Request body:

```json
{
  "email": "student@mbciansappointizen.app",
  "password": "Welcome123!"
}
```

Success response:

```json
{
  "user": {
    "id": 5,
    "firstname": "Juan",
    "lastname": "Dela Cruz",
    "fullName": "Juan Dela Cruz",
    "email": "student@mbciansappointizen.app",
    "phone": "09123456783",
    "studentId": "MBC2024-12345",
    "role": "student",
    "accountStatus": "active",
    "createdAt": "2026-04-24T04:48:00.000Z"
  },
  "role": "student",
  "token": "<jwt>"
}
```

Failure examples:

- `401`: invalid email or password
- `403`: account disabled

#### `GET /api/me`

Purpose:

- fetch current authenticated user

Authentication:

- required

Response:

```json
{
  "user": {
    "id": 5,
    "firstname": "Juan",
    "lastname": "Dela Cruz",
    "fullName": "Juan Dela Cruz",
    "email": "student@mbciansappointizen.app",
    "phone": "09123456783",
    "studentId": "MBC2024-12345",
    "role": "student",
    "accountStatus": "active",
    "createdAt": "2026-04-24T04:48:00.000Z"
  },
  "role": "student"
}
```

#### `POST /api/logout`

Purpose:

- log out from the client perspective and write an audit log

Authentication:

- required

Response:

```json
{
  "message": "Logged out successfully."
}
```

Important note:

- this does not invalidate the JWT on the server

### Common

All common routes require authentication.

#### `GET /api/common/notifications`

Purpose:

- fetch the latest notifications for the current user

Response:

```json
{
  "notifications": [
    {
      "id": 1,
      "userId": 5,
      "title": "Appointment approved",
      "message": "APT-20260420-1001 is approved and awaiting payment verification.",
      "type": "success",
      "referenceType": "appointment",
      "referenceId": 1,
      "isRead": false,
      "createdAt": "2026-04-24T08:00:00.000Z"
    }
  ]
}
```

Notes:

- sorted by `created_at DESC`
- limited to 25 records

#### `PATCH /api/common/notifications/:id/read`

Purpose:

- mark one notification as read

Response:

```json
{
  "success": true
}
```

#### `PATCH /api/common/notifications/read-all`

Purpose:

- mark all current-user notifications as read

Response:

```json
{
  "success": true
}
```

### Student

All student routes require:

- authentication
- role `student`

#### `GET /api/student/dashboard`

Purpose:

- load the full student workspace model

Response shape:

```json
{
  "stats": {
    "totalAppointments": 3,
    "pendingAppointments": 1,
    "activeAppointments": 2,
    "inProgressAppointments": 2,
    "completedAppointments": 1,
    "cancelledAppointments": 0
  },
  "appointments": [],
  "documents": [],
  "timeSlots": [],
  "blockedDates": [],
  "settings": {}
}
```

Notes:

- returns all student appointments ordered by newest first
- payment `proofImage` is nulled for privacy on this endpoint
- `activeAppointments` and `inProgressAppointments` currently represent the same count

#### `GET /api/student/availability?date=YYYY-MM-DD`

Purpose:

- check slot load and blocked status for a single date

Query parameters:

- `date`: required date string in `YYYY-MM-DD`

Response:

```json
{
  "blocked": false,
  "reason": null,
  "slots": [
    {
      "id": 2,
      "startTime": "09:00:00",
      "endTime": "10:00:00",
      "maxAppointments": 8,
      "isActive": true,
      "used": 3,
      "remaining": 5,
      "disabled": false
    }
  ]
}
```

#### `POST /api/student/appointments`

Purpose:

- create an appointment and its initial payment record

Content type:

- `multipart/form-data`

Fields:

- `documentTypeId`: required integer
- `copies`: optional integer, default `1`, max `20`
- `isRush`: boolean-like value
- `appointmentDate`: required `YYYY-MM-DD`
- `timeSlotId`: required integer
- `purpose`: required string, 4 to 255 chars
- `remarks`: optional string, max 500
- `paymentMethod`: required, `gcash` or `cash`
- `referenceNumber`: required for `gcash`
- `proofImage`: required for `gcash`, optional for `cash`

Example cash request:

```text
documentTypeId=2
copies=1
isRush=false
appointmentDate=2026-05-02
timeSlotId=5
purpose=Needed for internship endorsement
remarks=
paymentMethod=cash
```

Example GCash request:

```text
documentTypeId=1
copies=2
isRush=true
appointmentDate=2026-05-03
timeSlotId=2
purpose=Requirement for scholarship renewal
remarks=Please prepare two copies.
paymentMethod=gcash
referenceNumber=GP1234567890
proofImage=<binary file>
```

Business rules:

- date must be today or later
- date must not be blocked
- slot must still have remaining capacity
- selected payment method must be enabled in settings
- GCash requires both proof and reference number

Success response:

```json
{
  "message": "Appointment submitted successfully.",
  "appointment": {
    "id": 12,
    "referenceNo": "APT-20260426-1A2B3C",
    "status": "pending",
    "paymentStatus": "for_verification",
    "payment": {
      "id": 12,
      "amount": 300,
      "method": "gcash",
      "status": "for_verification"
    }
  }
}
```

Status:

- `201 Created`

#### `PATCH /api/student/appointments/:id/cancel`

Purpose:

- cancel an appointment owned by the current student

Rules:

- cannot cancel `completed`, `rejected`, or `cancelled`

Response:

```json
{
  "message": "Appointment cancelled successfully.",
  "appointment": {
    "id": 12,
    "status": "cancelled"
  }
}
```

#### `POST /api/student/appointments/:id/payment`

Purpose:

- submit or resubmit payment details for an existing appointment

Content type:

- `multipart/form-data`

Fields:

- `method`: required, `gcash` or `cash`
- `referenceNumber`: required for `gcash`
- `proofImage`: required for `gcash`

Rules:

- appointment must belong to current student
- appointment must already be `approved`, `assigned`, or `processing`
- already paid appointments cannot be resubmitted

Cash example:

```text
method=cash
```

GCash example:

```text
method=gcash
referenceNumber=GP1234567890
proofImage=<binary file>
```

Success response:

```json
{
  "message": "Payment proof uploaded successfully.",
  "appointment": {
    "id": 12,
    "paymentStatus": "for_verification",
    "payment": {
      "id": 12,
      "method": "gcash",
      "status": "for_verification"
    }
  }
}
```

### Registrar Head

All registrar-head routes require:

- authentication
- role `registrar_head`

#### `GET /api/head/dashboard`

Purpose:

- load approval, assignment, and staff distribution dashboard

Response:

```json
{
  "stats": {
    "pendingRequests": 4,
    "approvedRequests": 6,
    "processingRequests": 2,
    "completedRequests": 8,
    "cancelledRequests": 1
  },
  "appointments": [],
  "staffMembers": [
    {
      "id": 4,
      "fullName": "Registrar Staff",
      "email": "staff1@mbciansappointizen.app"
    }
  ]
}
```

#### `GET /api/head/search`

Purpose:

- search appointments using server-side filters

Query parameters:

- `q`: free-text match against student name, email, student id, and reference no
- `studentId`: targeted search against student id or email
- `status`: appointment status
- `dateFrom`: lower bound for appointment date
- `dateTo`: upper bound for appointment date

Response:

```json
{
  "count": 2,
  "appointments": []
}
```

#### `PATCH /api/head/appointments/:id/approve`

Purpose:

- approve a pending appointment

Request body:

```json
{
  "remarks": "Approved for processing."
}
```

Rules:

- only `pending` appointments may be approved

Response:

```json
{
  "message": "Appointment approved successfully.",
  "appointment": {
    "id": 12,
    "status": "approved"
  }
}
```

#### `PATCH /api/head/appointments/:id/reject`

Purpose:

- reject an appointment

Request body:

```json
{
  "rejectionReason": "The selected request lacks the required supporting details."
}
```

Rules:

- allowed from `pending`, `approved`, or `assigned`
- if payment is not already `paid`, related payment record is also moved to `rejected`

Response:

```json
{
  "message": "Appointment rejected successfully.",
  "appointment": {
    "id": 12,
    "status": "rejected",
    "rejectionReason": "The selected request lacks the required supporting details."
  }
}
```

#### `PATCH /api/head/appointments/:id/assign`

Purpose:

- assign an appointment to a registrar staff user

Request body:

```json
{
  "staffId": 4,
  "remarks": "Please prioritize this request."
}
```

Rules:

- staff member must be active and have role `registrar_staff`
- appointment must be `approved`, `assigned`, or `processing`
- endpoint always sets status to `assigned`

Response:

```json
{
  "message": "Staff assigned successfully.",
  "appointment": {
    "id": 12,
    "status": "assigned",
    "assignedStaffId": 4
  }
}
```

### Registrar Staff

All registrar-staff routes require:

- authentication
- role `registrar_staff`

#### `GET /api/staff/dashboard`

Purpose:

- load the staff workspace with assigned and available queue items

Response:

```json
{
  "stats": {
    "assignedToMe": 3,
    "readyRequests": 3,
    "availableRequests": 4,
    "processingRequests": 1,
    "completedRequests": 6,
    "cancelledRequests": 1
  },
  "appointments": []
}
```

Notes:

- `readyRequests` currently mirrors `assignedToMe`

#### `PATCH /api/staff/appointments/:id/status`

Purpose:

- execute an allowed staff action against an appointment assigned to the current user

Request body:

```json
{
  "action": "start_processing",
  "remarks": "Started document preparation."
}
```

Supported actions:

- `mark_paid`
- `start_processing`
- `complete`

Action rules:

- `mark_paid`: only for cash payments, only for active appointments, only if not already paid
- `start_processing`: appointment must be `approved` or `assigned` and payment status must be `paid`
- `complete`: appointment must already be `processing`

Response:

```json
{
  "message": "Appointment updated successfully.",
  "appointment": {
    "id": 12,
    "status": "processing",
    "paymentStatus": "paid"
  }
}
```

### Cashier

All cashier routes require:

- authentication
- role `cashier`

#### `GET /api/cashier/dashboard`

Purpose:

- load payment verification dashboard

Response:

```json
{
  "stats": {
    "pendingVerification": 2,
    "paidTransactions": 8,
    "rejectedTransactions": 1
  },
  "appointments": []
}
```

#### `PATCH /api/cashier/payments/:id/approve`

Purpose:

- approve a payment linked to an appointment

Important note:

- despite the route segment name `payments`, the `:id` currently represents an appointment id, not a payment id

Request body:

```json
{}
```

Rules:

- appointment must have a payment record
- appointment cannot be `cancelled` or `rejected`
- payment must be `for_verification` or `pending`

Response:

```json
{
  "message": "Payment approved successfully.",
  "appointment": {
    "id": 12,
    "paymentStatus": "paid",
    "payment": {
      "id": 12,
      "status": "paid"
    }
  }
}
```

#### `PATCH /api/cashier/payments/:id/reject`

Purpose:

- reject a payment linked to an appointment

Important note:

- the `:id` currently represents an appointment id

Request body:

```json
{
  "rejectionReason": "The screenshot is blurry and the reference number cannot be verified."
}
```

Response:

```json
{
  "message": "Payment rejected successfully.",
  "appointment": {
    "id": 12,
    "paymentStatus": "rejected",
    "payment": {
      "id": 12,
      "status": "rejected",
      "rejectionReason": "The screenshot is blurry and the reference number cannot be verified."
    }
  }
}
```

### Admin

All admin routes require:

- authentication
- role `admin`

#### `GET /api/admin/dashboard`

Purpose:

- load the full admin workspace model

Response shape:

```json
{
  "stats": {
    "activeUsers": 5,
    "totalAppointments": 3,
    "pendingAppointments": 1,
    "cancelledAppointments": 0,
    "pendingPayments": 1
  },
  "documentTypes": [],
  "timeSlots": [],
  "blockedDates": [],
  "users": [],
  "settings": {},
  "appointments": [],
  "recentLogs": [
    {
      "id": 100,
      "action": "LOGIN_SUCCESS",
      "entityType": "auth",
      "entityId": 5,
      "description": "Student Juan Dela Cruz logged in successfully.",
      "created_at": "2026-04-26T11:35:10.123Z",
      "userName": "Juan Dela Cruz",
      "userEmail": "student@mbciansappointizen.app"
    }
  ]
}
```

#### `POST /api/admin/document-types`

Purpose:

- create a document type

Request body:

```json
{
  "name": "Certification of Graduation",
  "description": "Issued for job applications.",
  "baseFee": 120,
  "copyFee": 20,
  "rushFee": 80,
  "processingDays": 3
}
```

Response:

```json
{
  "message": "Document type added successfully."
}
```

Status:

- `201 Created`

#### `PUT /api/admin/document-types/:id`

Purpose:

- update a document type

Request body:

```json
{
  "name": "Transcript of Records",
  "description": "Official academic record.",
  "baseFee": 150,
  "copyFee": 25,
  "rushFee": 100,
  "processingDays": 5,
  "isActive": true
}
```

Response:

```json
{
  "message": "Document type updated successfully."
}
```

#### `DELETE /api/admin/document-types/:id`

Purpose:

- delete an unused document type

Rule:

- cannot delete if referenced by appointments

Response:

```json
{
  "message": "Document type removed successfully."
}
```

#### `POST /api/admin/time-slots`

Purpose:

- create a time slot

Request body:

```json
{
  "startTime": "08:00",
  "endTime": "09:00",
  "maxAppointments": 8
}
```

Rules:

- end time must be later than start time
- slot must not overlap an existing slot

Response:

```json
{
  "message": "Time slot added successfully."
}
```

Status:

- `201 Created`

#### `DELETE /api/admin/time-slots/:id`

Purpose:

- delete an unused time slot

Rule:

- cannot delete if referenced by appointments

Response:

```json
{
  "message": "Time slot removed successfully."
}
```

#### `POST /api/admin/blocked-dates`

Purpose:

- add a blocked appointment date

Request body:

```json
{
  "blockedDate": "2026-05-01",
  "reason": "Labor Day holiday."
}
```

Rules:

- date must be today or later
- date must not already be blocked

Response:

```json
{
  "message": "Blocked date added successfully."
}
```

Status:

- `201 Created`

#### `DELETE /api/admin/blocked-dates/:id`

Purpose:

- remove a blocked date record

Response:

```json
{
  "message": "Blocked date removed successfully."
}
```

#### `GET /api/admin/users`

Purpose:

- fetch all users

Response:

```json
{
  "users": []
}
```

#### `DELETE /api/admin/users/:id`

Purpose:

- disable a user account

Important note:

- this is a soft-disable, not a hard delete

Rules:

- admin cannot disable their own account

Response:

```json
{
  "message": "User removed successfully."
}
```

#### `PUT /api/admin/settings`

Purpose:

- create or update global settings row `id = 1`

Request body:

```json
{
  "orgName": "Mindoro State University - Bongabong Campus Registrar",
  "orgEmail": "registrar.bongabong@minsu.edu.ph",
  "orgPhone": "09537100668",
  "officeHours": "8:00 AM - 5:00 PM, Monday to Friday",
  "gcashEnabled": true,
  "gcashName": "Mindoro State University Registrar",
  "gcashNumber": "09537100668",
  "gcashQrImage": "/assets/qr-code.jpg",
  "cashEnabled": true,
  "maintenanceMode": false
}
```

Rules:

- at least one payment method must remain enabled
- if `gcashEnabled = true`, both `gcashName` and `gcashNumber` are required

Response:

```json
{
  "message": "Settings updated successfully."
}
```

#### `PATCH /api/admin/appointments/:id/status`

Purpose:

- execute an administrative appointment action

Request body:

```json
{
  "action": "reject",
  "remarks": "Insufficient request details.",
  "rejectionReason": "The request cannot proceed without the missing information."
}
```

Supported actions:

- `approve`
- `reject`
- `mark_paid`
- `start_processing`
- `complete`

Action notes:

- `reject` requires `rejectionReason`
- `mark_paid` is only for cash payments
- `start_processing` requires appointment payment status `paid`
- `complete` requires current status `processing`

Response:

```json
{
  "message": "Appointment updated successfully.",
  "appointment": {
    "id": 12,
    "status": "rejected",
    "paymentStatus": "rejected"
  }
}
```

## WebSocket Events

Socket transport:

- Socket.IO

Authentication:

- handshake auth payload must include `{ token: "<jwt>" }`

Rooms joined on connect:

- `user:{userId}`
- `role:{role}`

Server-emitted events:

- `notifications:new`
- `appointments:changed`
- `payments:changed`
- `settings:changed`
- `catalog:changed`

Representative payloads:

```json
{
  "title": "Payment verified",
  "message": "APT-20260420-1001 payment is verified.",
  "type": "success",
  "referenceType": "payment",
  "referenceId": 1
}
```

```json
{
  "appointmentId": 12,
  "action": "approved"
}
```

```json
{
  "appointmentId": 12,
  "paymentId": 12,
  "action": "rejected"
}
```

```json
{
  "area": "settings",
  "action": "updated"
}
```

```json
{
  "area": "document_types",
  "action": "created"
}
```

Client-originated event currently handled:

- `notifications:markRead`

Current server behavior for that event:

- echoes `notifications:read` back to the socket without persisting DB state

## Validation Rules Summary

Important formats:

- phone: `09XXXXXXXXX`
- student id: `MBC2024-12345`
- date: `YYYY-MM-DD`
- time: `HH:MM` or `HH:MM:SS`

Upload rules:

- accepted MIME types: `image/jpeg`, `image/png`, `image/webp`
- maximum size: `5 MB`
- field name: `proofImage`

## Operational Notes

- payment proof images are stored in the database as data URLs
- startup currently performs a schema check that upgrades `payments.proof_image` to `MEDIUMTEXT` when needed
- CORS origins are controlled by `CLIENT_ORIGIN`
- API health does not guarantee business readiness beyond DB/settings visibility
