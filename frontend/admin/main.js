import { APP_CONFIG } from "../config.js";
import { renderTable } from "../components/table.js";
import { createPortalApp } from "../shared/portal.js";
import {
  escapeHTML,
  formatCurrency,
  formatDate,
  formatDateTime,
  formatTimeRange,
  labelize,
  resolveMediaUrl,
  statusBadge,
} from "../shared/formatters.js";
import { renderEmptyState, renderStatCards } from "../shared/ui.js";

const NAV_ITEMS = [
  { id: "overview", label: "Dashboard", icon: "dashboard" },
  { id: "appointments", label: "Appointments", icon: "calendar" },
  { id: "documents", label: "Document Types", icon: "document" },
  { id: "time-slots", label: "Time Slots", icon: "calendar" },
  { id: "blocked-dates", label: "Blocked Dates", icon: "alert" },
  { id: "users", label: "Users", icon: "users" },
  { id: "settings", label: "Settings", icon: "settings" },
];

function includesSearch(values, query) {
  if (!query) {
    return true;
  }

  return values.join(" ").toLowerCase().includes(query.toLowerCase());
}

function getVisibleAppointments(state) {
  return state.dashboard.appointments.filter((appointment) =>
    includesSearch(
      [
        appointment.referenceNo,
        appointment.studentName,
        appointment.documentName,
        appointment.status,
        appointment.payment?.method || "",
        appointment.payment?.referenceNumber || "",
        appointment.paymentStatus,
      ],
      state.searchQuery,
    ),
  );
}

function openDocumentModal(helpers, documentType = null) {
  helpers.openModal({
    title: documentType ? `Edit ${documentType.name}` : "Add document type",
    description:
      "Configure the request catalog, pricing rules, and rush fees available to students.",
    content: `
      <form data-form="admin-document-form" class="stack">
        <input type="hidden" name="documentId" value="${documentType?.id || ""}" />
        <label class="field">
          <span>Name</span>
          <input name="name" type="text" value="${escapeHTML(documentType?.name || "")}" required />
        </label>
        <label class="field">
          <span>Description</span>
          <textarea name="description" placeholder="Explain what this document is used for">${escapeHTML(
            documentType?.description || "",
          )}</textarea>
        </label>
        <div class="field-grid">
          <label class="field">
            <span>Base fee</span>
            <input name="baseFee" type="number" min="0" step="0.01" value="${documentType?.baseFee || 0}" required />
          </label>
          <label class="field">
            <span>Copy fee</span>
            <input name="copyFee" type="number" min="0" step="0.01" value="${documentType?.copyFee || 0}" required />
          </label>
        </div>
        <div class="field-grid">
          <label class="field">
            <span>Rush fee</span>
            <input name="rushFee" type="number" min="0" step="0.01" value="${documentType?.rushFee || 0}" required />
          </label>
          <label class="field">
            <span>Processing days</span>
            <input name="processingDays" type="number" min="1" max="60" value="${documentType?.processingDays || 3}" required />
          </label>
        </div>
        ${
          documentType
            ? `
                <label class="field">
                  <span>Availability</span>
                  <select name="isActive">
                    <option value="true" ${documentType.isActive ? "selected" : ""}>Active</option>
                    <option value="false" ${!documentType.isActive ? "selected" : ""}>Inactive</option>
                  </select>
                </label>
              `
            : ""
        }
        <div class="inline-actions">
          <button class="button button--primary" type="submit">${documentType ? "Save changes" : "Create document type"}</button>
          <button class="button button--ghost" type="button" data-close-modal>Cancel</button>
        </div>
      </form>
    `,
  });
}

function openTimeSlotModal(helpers) {
  helpers.openModal({
    title: "Add time slot",
    description: "Create another appointment window for student bookings.",
    content: `
      <form data-form="admin-time-slot-form" class="stack">
        <div class="field-grid">
          <label class="field">
            <span>Start time</span>
            <input name="startTime" type="time" required />
          </label>
          <label class="field">
            <span>End time</span>
            <input name="endTime" type="time" required />
          </label>
        </div>
        <label class="field">
          <span>Max appointments</span>
          <input name="maxAppointments" type="number" min="1" max="100" value="8" required />
        </label>
        <div class="inline-actions">
          <button class="button button--primary" type="submit">Add slot</button>
          <button class="button button--ghost" type="button" data-close-modal>Cancel</button>
        </div>
      </form>
    `,
  });
}

function openBlockedDateModal(helpers) {
  helpers.openModal({
    title: "Block a date",
    description:
      "Prevent student bookings for holidays, campus events, or registrar downtime.",
    content: `
      <form data-form="admin-blocked-date-form" class="stack">
        <label class="field">
          <span>Date</span>
          <input name="blockedDate" type="date" required />
        </label>
        <label class="field">
          <span>Reason</span>
          <textarea name="reason" placeholder="Reason for blocking this date" required></textarea>
        </label>
        <div class="inline-actions">
          <button class="button button--primary" type="submit">Block date</button>
          <button class="button button--ghost" type="button" data-close-modal>Cancel</button>
        </div>
      </form>
    `,
  });
}

function renderAppointmentsSection(state) {
  const rows = getVisibleAppointments(state);

  return `
    <section class="section-card">
      <div class="section-card__header">
        <div>
          <h3 class="section-card__title">All appointments</h3>
        </div>
      </div>
      ${renderTable({
        rows,
        cardTitle: (row) => escapeHTML(row.referenceNo),
        emptyTitle: "No appointments",
        emptyMessage: "Student appointments will appear here.",
        columns: [
          {
            label: "Reference",
            render: (row) => `<strong>${escapeHTML(row.referenceNo)}</strong>`,
          },
          {
            label: "Student",
            render: (row) =>
              `<strong>${escapeHTML(row.studentName)}</strong><br><span class="muted">${escapeHTML(row.studentEmail)}</span>`,
          },
          {
            label: "Document",
            render: (row) =>
              `<strong>${escapeHTML(row.documentName)}</strong><br><span class="muted">${escapeHTML(row.purpose || "")}</span>`,
          },
          {
            label: "Schedule",
            render: (row) =>
              `${escapeHTML(formatDate(row.appointmentDate))}<br><span class="muted">${escapeHTML(
                formatTimeRange(row.startTime, row.endTime),
              )}</span>`,
          },
          {
            label: "Status",
            render: (row) =>
              `${statusBadge(row.status)}<br><span class="muted">${statusBadge(row.paymentStatus)}</span>`,
          },
          {
            label: "Payment",
            render: (row) =>
              row.payment
                ? `<strong>${escapeHTML(formatCurrency(row.payment.amount || 0))}</strong><br><span class="muted">${escapeHTML(
                    row.payment.method?.toUpperCase() || "N/A",
                  )}</span>${
                    row.payment.referenceNumber
                      ? `<br><span class="muted">Ref: ${escapeHTML(row.payment.referenceNumber)}</span>`
                      : ""
                  }${
                    row.payment.proofImage
                      ? '<br><span class="muted">Screenshot uploaded</span>'
                      : ""
                  }`
                : '<span class="muted">No payment record</span>',
          },
          {
            label: "Actions",
            render: (row) =>
              `<button class="button button--secondary" type="button" data-action="admin-manage-appointment" data-id="${row.id}">Manage</button>`,
          },
        ],
      })}
    </section>
  `;
}

function openAdminAppointmentModal(helpers, appointment) {
  const allowedActions = [];

  if (appointment.status === "pending") {
    allowedActions.push({ value: "approve", label: "Approve request" });
    allowedActions.push({ value: "reject", label: "Reject request" });
  }

  if (
    appointment.payment?.method === "cash" &&
    appointment.paymentStatus !== "paid" &&
    ["approved", "assigned", "processing"].includes(appointment.status)
  ) {
    allowedActions.push({
      value: "mark_paid",
      label: "Mark cash payment as paid",
    });
  }

  if (
    ["approved", "assigned"].includes(appointment.status) &&
    appointment.paymentStatus === "paid"
  ) {
    allowedActions.push({
      value: "start_processing",
      label: "Start processing",
    });
  }

  if (appointment.status === "processing") {
    allowedActions.push({ value: "complete", label: "Mark as complete" });
  }

  if (["pending", "approved", "assigned"].includes(appointment.status)) {
    allowedActions.push({ value: "reject", label: "Reject request" });
  }

  helpers.openModal({
    title: `Manage ${appointment.referenceNo}`,
    description: "Admin has full control to manage this appointment.",
    content: `
      <form data-form="admin-appointment-form" class="stack">
        <input type="hidden" name="appointmentId" value="${appointment.id}" />

        <article class="section-card section-card--soft">
          <div class="info-list">
            <div class="info-list__item"><span>Student</span><strong>${escapeHTML(appointment.studentName)}</strong></div>
            <div class="info-list__item"><span>Email</span><strong>${escapeHTML(appointment.studentEmail)}</strong></div>
            <div class="info-list__item"><span>Document</span><strong>${escapeHTML(appointment.documentName)}</strong></div>
            <div class="info-list__item"><span>Schedule</span><strong>${escapeHTML(formatDate(appointment.appointmentDate))}<br>${escapeHTML(
              formatTimeRange(appointment.startTime, appointment.endTime),
            )}</strong></div>
            <div class="info-list__item"><span>Status</span><strong>${statusBadge(appointment.status)}</strong></div>
            <div class="info-list__item"><span>Payment</span><strong>${statusBadge(appointment.paymentStatus)}</strong></div>
            <div class="info-list__item"><span>Amount</span><strong>${escapeHTML(formatCurrency(appointment.payment?.amount || 0))}</strong></div>
            <div class="info-list__item"><span>Payment method</span><strong>${escapeHTML(
              appointment.payment?.method?.toUpperCase() || "N/A",
            )}</strong></div>
            <div class="info-list__item"><span>GCash reference</span><strong>${escapeHTML(
              appointment.payment?.referenceNumber || "N/A",
            )}</strong></div>
          </div>
        </article>

        ${
          appointment.payment?.proofImage
            ? `
                <article class="section-card">
                  <strong>Uploaded payment screenshot</strong>
                  <p class="section-card__description" style="margin-top: 0.5rem;">Admin can review the same proof image seen by cashier before taking action on this request.</p>
                </article>
                <img class="media-proof" src="${escapeHTML(resolveMediaUrl(appointment.payment.proofImage))}" alt="Payment proof for ${escapeHTML(
                  appointment.referenceNo,
                )}" />
              `
            : `
                <article class="section-card">
                  <p class="section-card__description">No screenshot proof is attached to this appointment yet. Cash payments and unpaid requests will appear like this until updated.</p>
                </article>
              `
        }

        ${
          allowedActions.length
            ? `
              <label class="field">
                <span>Action</span>
                <select name="action" required>
                  <option value="">Select an action</option>
                  ${allowedActions
                    .map(
                      (action) =>
                        `<option value="${action.value}">${escapeHTML(action.label)}</option>`,
                    )
                    .join("")}
                </select>
              </label>

              <label class="field">
                <span>Remarks</span>
                <textarea name="remarks" placeholder="Add any remarks or notes about this action"></textarea>
              </label>
            `
            : `<p class="section-card__description">No actions available for this appointment at this time.</p>`
        }

        <div class="inline-actions">
          ${allowedActions.length ? `<button class="button button--primary" type="submit">Apply action</button>` : ""}
          <button class="button button--ghost" type="button" data-close-modal>Close</button>
        </div>
      </form>
    `,
  });
}

function renderAdminOverview(state) {
  const appointments = getVisibleAppointments(state);

  return `
    ${renderStatCards([
      {
        label: "Active users",
        value: state.dashboard.stats.activeUsers,
        icon: "users",
        tone: "forest",
      },
      {
        label: "Appointments",
        value: state.dashboard.stats.totalAppointments,
        icon: "calendar",
        tone: "sky",
      },
      {
        label: "Pending approvals",
        value: state.dashboard.stats.pendingAppointments,
        icon: "clock",
        tone: "gold",
      },
      {
        label: "Cancelled",
        value: state.dashboard.stats.cancelledAppointments,
        icon: "alert",
        tone: "danger",
      },
      {
        label: "Payments to verify",
        value: state.dashboard.stats.pendingPayments,
        icon: "wallet",
        tone: "success",
      },
    ])}

    <section class="section-card">
      <div class="section-card__header">
        <div>
          <h3 class="section-card__title">Student appointment history</h3>
        </div>
      </div>
      ${
        appointments.length
          ? renderTable({
              rows: appointments,
              cardTitle: (row) => escapeHTML(row.referenceNo),
              emptyTitle: "No appointments found",
              emptyMessage: "Student appointment history will appear here.",
              columns: [
                {
                  label: "Reference",
                  render: (row) => `<strong>${escapeHTML(row.referenceNo)}</strong>`,
                },
                {
                  label: "Student",
                  render: (row) =>
                    `<strong>${escapeHTML(row.studentName)}</strong><br><span class="muted">${escapeHTML(row.studentEmail)}</span>`,
                },
                {
                  label: "Document",
                  render: (row) =>
                    `<strong>${escapeHTML(row.documentName)}</strong><br><span class="muted">${escapeHTML(
                      formatDate(row.appointmentDate),
                    )}</span>`,
                },
                {
                  label: "Status",
                  render: (row) =>
                    `${statusBadge(row.status)}<br><span class="muted">${statusBadge(row.paymentStatus)}</span>`,
                },
              ],
            })
          : renderEmptyState(
              "No appointments found",
              "Student appointment history will surface here automatically.",
            )
      }
    </section>

    <section class="section-card">
      <div class="section-card__header">
        <div>
          <h3 class="section-card__title">Recent activity</h3>
        </div>
      </div>
      ${
        state.dashboard.recentLogs.length
          ? `
              <div class="stack">
                ${state.dashboard.recentLogs
                  .map(
                    (log) => `
                      <article class="section-card">
                        <strong>${escapeHTML(labelize(log.action))}</strong>
                        <p class="section-card__description">${escapeHTML(log.description)}</p>
                        <span class="muted">${escapeHTML(log.userName ? log.userName + " | " : "")}${escapeHTML(log.userEmail ? log.userEmail + " | " : "")}${escapeHTML(formatDateTime(log.created_at))}</span>
                      </article>
                    `,
                  )
                  .join("")}
              </div>
            `
          : renderEmptyState(
              "No recent activity",
              "System events will appear here once users start interacting with the platform.",
            )
      }
    </section>
  `;
}

function renderDocumentsSection(state) {
  const rows = state.dashboard.documentTypes.filter((item) =>
    includesSearch([item.name, item.description || ""], state.searchQuery),
  );

  return `
    <section class="section-card">
      <div class="section-card__header">
        <div>
          <h3 class="section-card__title">Document types</h3>
        </div>
        <button class="button button--primary" type="button" data-action="admin-add-document">Add document</button>
      </div>
      ${renderTable({
        rows,
        cardTitle: (row) => escapeHTML(row.name),
        emptyTitle: "No document types configured",
        emptyMessage: "Add the first document type to allow student bookings.",
        columns: [
          {
            label: "Name",
            render: (row) =>
              `<strong>${escapeHTML(row.name)}</strong><br><span class="muted">${escapeHTML(row.description || "No description")}</span>`,
          },
          {
            label: "Fees",
            render: (row) =>
              `Base: ${escapeHTML(formatCurrency(row.baseFee))}<br><span class="muted">Copy: ${escapeHTML(formatCurrency(row.copyFee))} | Rush: ${escapeHTML(formatCurrency(row.rushFee))}</span>`,
          },
          {
            label: "Processing",
            render: (row) =>
              `${escapeHTML(row.processingDays)} days<br><span class="muted">${row.isActive ? "Active" : "Inactive"}</span>`,
          },
          {
            label: "Actions",
            render: (row) => `
              <div class="inline-actions">
                <button class="button button--secondary" type="button" data-action="admin-edit-document" data-id="${row.id}">Edit</button>
                <button class="button button--danger" type="button" data-action="admin-delete-document" data-id="${row.id}">Delete</button>
              </div>
            `,
          },
        ],
      })}
    </section>
  `;
}

function renderTimeSlotsSection(state) {
  const rows = state.dashboard.timeSlots.filter((slot) =>
    includesSearch([slot.startTime, slot.endTime], state.searchQuery),
  );

  return `
    <section class="section-card">
      <div class="section-card__header">
        <div>
          <h3 class="section-card__title">Time slots</h3>
        </div>
        <button class="button button--primary" type="button" data-action="admin-add-time-slot">Add slot</button>
      </div>
      ${renderTable({
        rows,
        cardTitle: (row) => escapeHTML(`${row.startTime} - ${row.endTime}`),
        emptyTitle: "No time slots configured",
        emptyMessage:
          "Create at least one appointment slot to open student bookings.",
        columns: [
          {
            label: "Window",
            render: (row) =>
              `<strong>${escapeHTML(row.startTime)} - ${escapeHTML(row.endTime)}</strong>`,
          },
          {
            label: "Capacity",
            render: (row) => `${escapeHTML(row.maxAppointments)} students`,
          },
          {
            label: "Actions",
            render: (row) =>
              `<button class="button button--danger" type="button" data-action="admin-delete-time-slot" data-id="${row.id}">Delete</button>`,
          },
        ],
      })}
    </section>
  `;
}

function renderBlockedDatesSection(state) {
  const rows = state.dashboard.blockedDates.filter((item) =>
    includesSearch([item.blockedDate, item.reason], state.searchQuery),
  );

  return `
    <section class="section-card">
      <div class="section-card__header">
        <div>
          <h3 class="section-card__title">Blocked dates</h3>
          <p class="section-card__description">Prevent bookings on holidays, maintenance windows, or campus events.</p>
        </div>
        <button class="button button--primary" type="button" data-action="admin-add-blocked-date">Block a date</button>
      </div>
      ${renderTable({
        rows,
        cardTitle: (row) => escapeHTML(row.blockedDate),
        emptyTitle: "No blocked dates",
        emptyMessage:
          "Students can currently book any available schedule date.",
        columns: [
          {
            label: "Date",
            render: (row) => escapeHTML(formatDate(row.blockedDate)),
          },
          { label: "Reason", render: (row) => escapeHTML(row.reason) },
          {
            label: "Actions",
            render: (row) =>
              `<button class="button button--danger" type="button" data-action="admin-delete-blocked-date" data-id="${row.id}">Unblock</button>`,
          },
        ],
      })}
    </section>
  `;
}

function renderUsersSection(state) {
  const rows = state.dashboard.users.filter((user) =>
    includesSearch(
      [user.fullName, user.email, user.role, user.studentId || ""],
      state.searchQuery,
    ),
  );

  return `
    <section class="section-card">
      <div class="section-card__header">
        <div>
          <h3 class="section-card__title">User management</h3>
          <p class="section-card__description">Review active accounts and disable access when needed.</p>
        </div>
      </div>
      ${renderTable({
        rows,
        cardTitle: (row) => escapeHTML(row.fullName),
        emptyTitle: "No users found",
        emptyMessage:
          "Accounts will appear here once they are registered or seeded.",
        columns: [
          {
            label: "User",
            render: (row) =>
              `<strong>${escapeHTML(row.fullName)}</strong><br><span class="muted">${escapeHTML(row.email)}</span>`,
          },
          { label: "Role", render: (row) => escapeHTML(labelize(row.role)) },
          {
            label: "Status",
            render: (row) => escapeHTML(labelize(row.accountStatus)),
          },
          {
            label: "Student ID",
            render: (row) => escapeHTML(row.studentId || "N/A"),
          },
          {
            label: "Actions",
            render: (row) =>
              row.accountStatus === "active"
                ? `<button class="button button--danger" type="button" data-action="admin-remove-user" data-id="${row.id}">Remove</button>`
                : '<span class="muted">Disabled</span>',
          },
        ],
      })}
    </section>
  `;
}

function renderSettingsSection(state) {
  const settings = state.dashboard.settings;

  return `
    <section class="section-card">
      <div class="section-card__header">
        <div>
          <h3 class="section-card__title">System settings</h3>
          <p class="section-card__description">These values control the office identity and payment options seen throughout the portal.</p>
        </div>
      </div>

      <form data-form="admin-settings-form" class="stack">
        <div class="field-grid">
          <label class="field">
            <span>Organization name</span>
            <input name="orgName" type="text" value="${escapeHTML(settings?.orgName || "")}" required />
          </label>
          <label class="field">
            <span>Office email</span>
            <input name="orgEmail" type="email" value="${escapeHTML(settings?.orgEmail || "")}" required />
          </label>
        </div>

        <div class="field-grid">
          <label class="field">
            <span>Office phone</span>
            <input name="orgPhone" type="text" value="${escapeHTML(settings?.orgPhone || "")}" required />
          </label>
          <label class="field">
            <span>Office hours</span>
            <input name="officeHours" type="text" value="${escapeHTML(settings?.officeHours || "")}" required />
          </label>
        </div>

        <div class="field-grid">
          <label class="field">
            <span>GCash enabled</span>
            <select name="gcashEnabled">
              <option value="true" ${settings?.gcashEnabled ? "selected" : ""}>Enabled</option>
              <option value="false" ${!settings?.gcashEnabled ? "selected" : ""}>Disabled</option>
            </select>
          </label>
          <label class="field">
            <span>Cash enabled</span>
            <select name="cashEnabled">
              <option value="true" ${settings?.cashEnabled ? "selected" : ""}>Enabled</option>
              <option value="false" ${!settings?.cashEnabled ? "selected" : ""}>Disabled</option>
            </select>
          </label>
        </div>

        <div class="field-grid">
          <label class="field">
            <span>GCash account name</span>
            <input name="gcashName" type="text" value="${escapeHTML(settings?.gcashName || "")}" />
          </label>
          <label class="field">
            <span>GCash number</span>
            <input name="gcashNumber" type="text" value="${escapeHTML(settings?.gcashNumber || "")}" />
          </label>
        </div>

        <div class="inline-actions">
          <button class="button button--primary" type="submit">Save settings</button>
        </div>
      </form>
    </section>
  `;
}

createPortalApp({
  roleLabel: "Admin",
  portalTitle: "Administration Console",
  heroTitle: "System administration",
  navItems: NAV_ITEMS,
  defaultSection: "overview",
  primaryAction: {
    label: "Add Document Type",
    icon: "plus",
    async onClick(helpers) {
      openDocumentModal(helpers);
    },
  },
  async loadData({ api }) {
    return api.get("/admin/dashboard");
  },
  renderContent(state) {
    if (!state.dashboard) {
      return renderEmptyState("Loading", "Preparing administration tools...");
    }

    switch (state.activeSection) {
      case "appointments":
        return renderAppointmentsSection(state);
      case "documents":
        return renderDocumentsSection(state);
      case "time-slots":
        return renderTimeSlotsSection(state);
      case "blocked-dates":
        return renderBlockedDatesSection(state);
      case "users":
        return renderUsersSection(state);
      case "settings":
        return renderSettingsSection(state);
      default:
        return renderAdminOverview(state);
    }
  },
  async handleAction(action, button, helpers) {
    const state = helpers.getState();

    if (action === "admin-add-document") {
      openDocumentModal(helpers);
      return;
    }

    if (action === "admin-add-time-slot") {
      openTimeSlotModal(helpers);
      return;
    }

    if (action === "admin-add-blocked-date") {
      openBlockedDateModal(helpers);
      return;
    }

    if (action === "admin-manage-appointment") {
      const appointment = state.dashboard.appointments.find(
        (item) => Number(item.id) === Number(button.dataset.id),
      );
      if (appointment) {
        openAdminAppointmentModal(helpers, appointment);
      }
      return;
    }

    if (action === "admin-edit-document") {
      const documentType = state.dashboard.documentTypes.find(
        (item) => Number(item.id) === Number(button.dataset.id),
      );
      if (documentType) {
        openDocumentModal(helpers, documentType);
      }
      return;
    }

    if (action === "admin-delete-document") {
      if (
        !window.confirm(
          "Delete this document type? This only works if it is not used by existing appointments.",
        )
      ) {
        return;
      }

      await helpers.api.delete(`/admin/document-types/${button.dataset.id}`);
      helpers.showToast("Document type removed successfully.", "success");
      await helpers.refresh({ silent: true });
      return;
    }

    if (action === "admin-delete-time-slot") {
      if (!window.confirm("Delete this time slot?")) {
        return;
      }

      await helpers.api.delete(`/admin/time-slots/${button.dataset.id}`);
      helpers.showToast("Time slot removed successfully.", "success");
      await helpers.refresh({ silent: true });
      return;
    }

    if (action === "admin-delete-blocked-date") {
      if (!window.confirm("Unblock this date?")) {
        return;
      }

      await helpers.api.delete(`/admin/blocked-dates/${button.dataset.id}`);
      helpers.showToast("Date unblocked successfully.", "success");
      await helpers.refresh({ silent: true });
      return;
    }

    if (action === "admin-remove-user") {
      if (!window.confirm("Disable this user account?")) {
        return;
      }

      await helpers.api.delete(`/admin/users/${button.dataset.id}`);
      helpers.showToast("User disabled successfully.", "warning");
      await helpers.refresh({ silent: true });
    }
  },
  async handleSubmit(formName, form, helpers) {
    const formData = new FormData(form);

    if (formName === "admin-document-form") {
      const documentId = formData.get("documentId");
      const payload = {
        name: formData.get("name"),
        description: formData.get("description"),
        baseFee: formData.get("baseFee"),
        copyFee: formData.get("copyFee"),
        rushFee: formData.get("rushFee"),
        processingDays: formData.get("processingDays"),
        isActive: formData.get("isActive"),
      };

      if (documentId) {
        await helpers.api.put(`/admin/document-types/${documentId}`, payload);
        helpers.showToast("Document type updated successfully.", "success");
      } else {
        await helpers.api.post("/admin/document-types", payload);
        helpers.showToast("Document type created successfully.", "success");
      }

      helpers.closeModal();
      await helpers.refresh({ silent: true });
      return;
    }

    if (formName === "admin-time-slot-form") {
      await helpers.api.post("/admin/time-slots", {
        startTime: formData.get("startTime"),
        endTime: formData.get("endTime"),
        maxAppointments: formData.get("maxAppointments"),
      });
      helpers.closeModal();
      helpers.showToast("Time slot added successfully.", "success");
      await helpers.refresh({ silent: true });
      return;
    }

    if (formName === "admin-blocked-date-form") {
      await helpers.api.post("/admin/blocked-dates", {
        blockedDate: formData.get("blockedDate"),
        reason: formData.get("reason"),
      });
      helpers.closeModal();
      helpers.showToast("Blocked date created successfully.", "success");
      await helpers.refresh({ silent: true });
      return;
    }

    if (formName === "admin-appointment-form") {
      const appointmentId = formData.get("appointmentId");
      const action = formData.get("action");

      if (!action) {
        helpers.showToast("Please select an action.", "error");
        return;
      }

      await helpers.api.patch(`/admin/appointments/${appointmentId}/status`, {
        action: action,
        remarks: formData.get("remarks"),
      });
      helpers.closeModal();
      helpers.showToast(
        `Appointment action "${action}" applied successfully.`,
        "success",
      );
      await helpers.refresh({ silent: true });
      return;
    }

    if (formName === "admin-settings-form") {
      await helpers.api.put("/admin/settings", {
        orgName: formData.get("orgName"),
        orgEmail: formData.get("orgEmail"),
        orgPhone: formData.get("orgPhone"),
        officeHours: formData.get("officeHours"),
        gcashEnabled: formData.get("gcashEnabled"),
        cashEnabled: formData.get("cashEnabled"),
        gcashName: formData.get("gcashName"),
        gcashNumber: formData.get("gcashNumber"),
      });
      helpers.showToast("System settings updated successfully.", "success");
      await helpers.refresh({ silent: true });
    }
  },
});
