import { renderTable } from '../components/table.js';
import { createPortalApp } from '../shared/portal.js';
import { escapeHTML, formatDate, formatTimeRange, labelize, statusBadge } from '../shared/formatters.js';
import { renderEmptyState, renderStatCards } from '../shared/ui.js';

const NAV_ITEMS = [
  { id: 'overview', label: 'Dashboard', icon: 'dashboard' },
  { id: 'queue', label: 'Requests Queue', icon: 'file' },
];

function matchesSearch(appointment, query) {
  if (!query) {
    return true;
  }

  const haystack = [
    appointment.referenceNo,
    appointment.studentName,
    appointment.documentName,
    appointment.status,
    appointment.paymentStatus,
  ]
    .join(' ')
    .toLowerCase();

  return haystack.includes(query.toLowerCase());
}

function getAllowedActions(appointment) {
  const actions = [];

  if (appointment.status === 'pending') {
    actions.push({ value: 'approve', label: 'Approve request' });
  }

  if (
    appointment.payment?.method === 'cash' &&
    appointment.paymentStatus !== 'paid' &&
    ['approved', 'assigned', 'processing'].includes(appointment.status)
  ) {
    actions.push({ value: 'mark_paid', label: 'Mark cash payment as paid' });
  }

  if (['approved', 'assigned'].includes(appointment.status) && appointment.paymentStatus === 'paid') {
    actions.push({ value: 'start_processing', label: 'Start processing' });
  }

  if (appointment.status === 'processing') {
    actions.push({ value: 'complete', label: 'Mark as complete' });
  }

  return actions;
}

function renderStaffTable(appointments) {
  return renderTable({
    rows: appointments,
    cardTitle: (row) => escapeHTML(row.referenceNo),
    emptyTitle: 'No staff items to process',
    emptyMessage: 'Assigned or available requests will show here once they are routed to the staff queue.',
    columns: [
      {
        label: 'Reference',
        render: (row) => `<strong>${escapeHTML(row.referenceNo)}</strong>`,
      },
      {
        label: 'Student',
        render: (row) => `<strong>${escapeHTML(row.studentName)}</strong><br><span class="muted">${escapeHTML(row.studentIdentifier || 'N/A')}</span>`,
      },
      {
        label: 'Document',
        render: (row) => `<strong>${escapeHTML(row.documentName)}</strong><br><span class="muted">${escapeHTML(row.purpose)}</span>`,
      },
      {
        label: 'Schedule',
        render: (row) => `${escapeHTML(formatDate(row.appointmentDate))}<br><span class="muted">${escapeHTML(
          formatTimeRange(row.startTime, row.endTime)
        )}</span>`,
      },
      {
        label: 'Status',
        render: (row) => `${statusBadge(row.status)}<br><span class="muted">${statusBadge(row.paymentStatus)}</span>`,
      },
      {
        label: 'Actions',
        render: (row) =>
          getAllowedActions(row).length
            ? `<button class="button button--secondary" type="button" data-action="staff-open-process" data-id="${row.id}">View & Process</button>`
            : '<span class="muted">No action</span>',
      },
    ],
  });
}

function openProcessModal(helpers, appointment) {
  const allowedActions = getAllowedActions(appointment);

  helpers.openModal({
    title: `Process ${appointment.referenceNo}`,
    description: 'Review the request details, then choose the next registrar action.',
    content: `
      <form data-form="staff-process-form" class="stack">
        <input type="hidden" name="appointmentId" value="${appointment.id}" />

        <article class="section-card section-card--soft">
          <div class="info-list">
            <div class="info-list__item"><span>Student</span><strong>${escapeHTML(appointment.studentName)}</strong></div>
            <div class="info-list__item"><span>Document</span><strong>${escapeHTML(appointment.documentName)}</strong></div>
            <div class="info-list__item"><span>Schedule</span><strong>${escapeHTML(formatDate(appointment.appointmentDate))}<br>${escapeHTML(
              formatTimeRange(appointment.startTime, appointment.endTime)
            )}</strong></div>
            <div class="info-list__item"><span>Status</span><strong>${statusBadge(appointment.status)}</strong></div>
            <div class="info-list__item"><span>Payment</span><strong>${statusBadge(appointment.paymentStatus)}</strong></div>
          </div>
        </article>

        <label class="field">
          <span>Next action</span>
          <select name="action" required>
            ${allowedActions
              .map((action) => `<option value="${action.value}">${escapeHTML(action.label)}</option>`)
              .join('')}
          </select>
        </label>

        <label class="field">
          <span>Remarks</span>
          <textarea name="remarks" placeholder="Add an internal remark or completion note">${escapeHTML(appointment.remarks || '')}</textarea>
        </label>

        <div class="inline-actions">
          <button class="button button--primary" type="submit">Apply action</button>
          <button class="button button--ghost" type="button" data-close-modal>Cancel</button>
        </div>
      </form>
    `,
  });
}

createPortalApp({
  role: 'registrar_staff',
  roleLabel: 'Registrar Staff',
  portalTitle: 'Registrar Staff Workspace',
  portalDescription: 'Handle assigned requests, confirm cash payments, and move approved records into processing.',
  heroTitle: 'Assigned and available queue',
  heroDescription: 'Every student-facing update you trigger here is reflected instantly across the student, cashier, and head dashboards.',
  navItems: NAV_ITEMS,
  defaultSection: 'overview',
  primaryAction: {
    label: 'Open Queue',
    icon: 'file',
    async onClick(helpers) {
      helpers.setState({ activeSection: 'queue' });
    },
  },
  async loadData({ api }) {
    return api.get('/staff/dashboard');
  },
  renderContent(state) {
    if (!state.dashboard) {
      return renderEmptyState('Loading', 'Preparing staff queue...');
    }

    const appointments = state.dashboard.appointments.filter((appointment) => matchesSearch(appointment, state.searchQuery));

    if (state.activeSection === 'queue') {
      return `
        <section class="section-card">
          <div class="section-card__header">
            <div>
              <h3 class="section-card__title">Processing queue</h3>
              <p class="section-card__description">Assigned, available, and recently cancelled items stay here so staff always see the current workflow state.</p>
            </div>
          </div>
          ${renderStaffTable(appointments)}
        </section>
      `;
    }

    const actionable = appointments.filter((item) => getAllowedActions(item).length);

    return `
      ${renderStatCards([
        { label: 'Assigned to me', value: state.dashboard.stats.assignedToMe, icon: 'assign', hint: 'Requests currently in your ownership.', tone: 'forest' },
        { label: 'Available pool', value: state.dashboard.stats.availableRequests, icon: 'dashboard', hint: 'Unassigned items still visible to staff.', tone: 'sky' },
        { label: 'Processing now', value: state.dashboard.stats.processingRequests, icon: 'clock', hint: 'Records already being worked on.', tone: 'gold' },
        { label: 'Completed', value: state.dashboard.stats.completedRequests, icon: 'check', hint: 'Requests finished by your queue.', tone: 'success' },
        { label: 'Cancelled', value: state.dashboard.stats.cancelledRequests, icon: 'alert', hint: 'Visible for audit and coordination.', tone: 'danger' },
      ])}

      <section class="section-card">
        <div class="section-card__header">
          <div>
            <h3 class="section-card__title">Immediate actions</h3>
            <p class="section-card__description">These requests currently have a next step you can execute from the staff portal.</p>
          </div>
        </div>
        ${renderStaffTable(actionable.slice(0, 5))}
      </section>

      <section class="section-card">
        <div class="section-card__header">
          <div>
            <h3 class="section-card__title">Student appointment history</h3>
            <p class="section-card__description">Show every appointment the student submitted so staff can review the full request trail.</p>
          </div>
        </div>
        ${
          appointments.length
            ? renderStaffTable(appointments)
            : renderEmptyState('No appointment requests', 'Student appointment history will appear here automatically.')
        }
      </section>
    `;
  },
  async handleAction(action, button, helpers) {
    const appointment = helpers.getState().dashboard.appointments.find((item) => Number(item.id) === Number(button.dataset.id));
    if (action === 'staff-open-process' && appointment) {
      openProcessModal(helpers, appointment);
    }
  },
  async handleSubmit(formName, form, helpers) {
    if (formName !== 'staff-process-form') {
      return;
    }

    const formData = new FormData(form);
    await helpers.api.patch(`/staff/appointments/${formData.get('appointmentId')}/status`, {
      action: formData.get('action'),
      remarks: formData.get('remarks'),
    });
    helpers.closeModal();
    helpers.showToast(`Staff action "${labelize(formData.get('action'))}" applied successfully.`, 'success');
    await helpers.refresh({ silent: true });
  },
});
