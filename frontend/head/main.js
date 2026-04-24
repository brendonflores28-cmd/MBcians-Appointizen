import { renderTable } from '../components/table.js';
import { createPortalApp } from '../shared/portal.js';
import { escapeHTML, formatDate, formatTimeRange, formatDateTime, statusBadge } from '../shared/formatters.js';
import { renderEmptyState, renderStatCards } from '../shared/ui.js';

const NAV_ITEMS = [
  { id: 'overview', label: 'Dashboard', icon: 'dashboard' },
  { id: 'appointments', label: 'Appointments', icon: 'calendar' },
];

function matchesSearch(appointment, query, filters = {}) {
  if (!query && Object.values(filters).every(v => !v)) {
    return true;
  }

  // Text search across multiple fields
  if (query) {
    const haystack = [
      appointment.referenceNo,
      appointment.studentName,
      appointment.studentEmail,
      appointment.studentIdentifier,
      appointment.documentName,
      appointment.status,
      appointment.paymentStatus,
    ]
      .filter(Boolean)
      .join(' ')
      .toLowerCase();

    if (!haystack.includes(query.toLowerCase())) {
      return false;
    }
  }

  // Status filter
  if (filters.status && appointment.status !== filters.status) {
    return false;
  }

  // Date range filters
  if (filters.dateFrom && new Date(appointment.appointmentDate) < new Date(filters.dateFrom)) {
    return false;
  }

  if (filters.dateTo && new Date(appointment.appointmentDate) > new Date(filters.dateTo)) {
    return false;
  }

  return true;
}

function renderHeadTable(appointments) {
  return renderTable({
    rows: appointments,
    cardTitle: (row) => escapeHTML(row.referenceNo),
    emptyTitle: 'No appointments available',
    emptyMessage: 'Incoming requests will appear here as soon as students submit them.',
    columns: [
      {
        label: 'Reference',
        render: (row) => `<strong>${escapeHTML(row.referenceNo)}</strong>`,
      },
      {
        label: 'Student',
        render: (row) => `<strong>${escapeHTML(row.studentName)}</strong><br><span class="muted">${escapeHTML(row.studentIdentifier || row.studentEmail || 'N/A')}</span>`,
      },
      {
        label: 'Document',
        render: (row) => `<strong>${escapeHTML(row.documentName)}</strong><br><span class="muted">${escapeHTML(row.purpose)}</span>`,
      },
      {
        label: 'Submitted',
        render: (row) => `<strong>${escapeHTML(formatDate(row.createdAt))}</strong><br><span class="muted">${escapeHTML(new Date(row.createdAt).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true }))}</span>`,
      },
      {
        label: 'Schedule',
        render: (row) => `${escapeHTML(formatDate(row.appointmentDate))}<br><span class="muted">${escapeHTML(
          formatTimeRange(row.startTime, row.endTime)
        )}</span>`,
      },
      {
        label: 'Progress',
        render: (row) => `${statusBadge(row.status)}<br><span class="muted">${statusBadge(row.paymentStatus)}</span>`,
      },
      {
        label: 'Staff',
        render: (row) => escapeHTML(row.assignedStaffName || 'Unassigned'),
      },
      {
        label: 'Actions',
        render: (row) => `
          <div class="inline-actions">
            ${
              row.status === 'pending'
                ? `<button class="button button--secondary" type="button" data-action="head-approve" data-id="${row.id}">Approve</button>`
                : ''
            }
            ${
              ['pending', 'approved', 'assigned', 'processing'].includes(row.status)
                ? `<button class="button button--secondary" type="button" data-action="head-assign" data-id="${row.id}">Assign</button>`
                : ''
            }
            ${
              ['pending', 'approved', 'assigned'].includes(row.status)
                ? `<button class="button button--danger" type="button" data-action="head-reject" data-id="${row.id}">Reject</button>`
                : ''
            }
          </div>
        `,
      },
    ],
  });
}

function openAssignModal(helpers, appointment) {
  const staffMembers = helpers.getState().dashboard.staffMembers || [];

  helpers.openModal({
    title: `Assign staff for ${appointment.referenceNo}`,
    description: 'Route this request to the registrar staff member who will own the next processing steps.',
    content: `
      <form data-form="head-assign-form" class="stack">
        <input type="hidden" name="appointmentId" value="${appointment.id}" />
        <label class="field">
          <span>Select staff</span>
          <select name="staffId" required>
            <option value="">Choose a staff member</option>
            ${staffMembers
              .map(
                (staff) => `
                  <option value="${staff.id}" ${Number(staff.id) === Number(appointment.assignedStaffId) ? 'selected' : ''}>
                    ${escapeHTML(staff.fullName)}
                  </option>
                `
              )
              .join('')}
          </select>
        </label>

        <label class="field">
          <span>Remarks (optional)</span>
          <textarea name="remarks" placeholder="Add a processing note or instruction">${escapeHTML(appointment.remarks || '')}</textarea>
        </label>

        <div class="inline-actions">
          <button class="button button--primary" type="submit">Assign request</button>
          <button class="button button--ghost" type="button" data-close-modal>Cancel</button>
        </div>
      </form>
    `,
  });
}

function openRejectModal(helpers, appointment) {
  helpers.openModal({
    title: `Reject ${appointment.referenceNo}`,
    description: 'Provide a clear reason so the student understands the next corrective step.',
    content: `
      <form data-form="head-reject-form" class="stack">
        <input type="hidden" name="appointmentId" value="${appointment.id}" />
        <label class="field">
          <span>Reason</span>
          <textarea name="rejectionReason" placeholder="Explain why this request cannot proceed" required></textarea>
        </label>

        <div class="inline-actions">
          <button class="button button--danger" type="submit">Reject appointment</button>
          <button class="button button--ghost" type="button" data-close-modal>Cancel</button>
        </div>
      </form>
    `,
  });
}

createPortalApp({
  role: 'registrar_head',
  roleLabel: 'Registrar Head',
  portalTitle: 'Registrar Head Console',
  portalDescription: 'Approve, reject, and distribute requests with full oversight over the registrar workflow.',
  heroTitle: 'Decision and assignment hub',
  heroDescription: 'Review pending appointments, assign staff ownership, and push live workflow changes to the student and registrar teams.',
  navItems: NAV_ITEMS,
  defaultSection: 'overview',
  initialState: {
    filters: {
      status: '',
      dateFrom: '',
      dateTo: '',
    },
  },
  primaryAction: {
    label: 'Jump to Appointments',
    icon: 'calendar',
    async onClick(helpers) {
      helpers.setState({ activeSection: 'appointments' });
    },
  },
  async loadData({ api }) {
    return api.get('/head/dashboard');
  },
  renderContent(state) {
    if (!state.dashboard) {
      return renderEmptyState('Loading', 'Preparing registrar head data...');
    }

    const appointments = state.dashboard.appointments.filter((appointment) =>
      matchesSearch(appointment, state.searchQuery, state.filters)
    );

    if (state.activeSection === 'appointments') {
      return `
        <section class="section-card">
          <div class="section-card__header">
            <div>
              <h3 class="section-card__title">Appointment oversight</h3>
              <p class="section-card__description">Pending approval, cancelled records, assigned cases, and processing work all stay visible in one queue.</p>
            </div>
          </div>

          <div class="filter-panel">
            <form data-form="head-filters" class="filter-form">
              <div class="filter-controls">
                <label class="field">
                  <span>Status</span>
                  <select name="status">
                    <option value="">All statuses</option>
                    <option value="pending" ${state.filters.status === 'pending' ? 'selected' : ''}>Pending</option>
                    <option value="approved" ${state.filters.status === 'approved' ? 'selected' : ''}>Approved</option>
                    <option value="assigned" ${state.filters.status === 'assigned' ? 'selected' : ''}>Assigned</option>
                    <option value="processing" ${state.filters.status === 'processing' ? 'selected' : ''}>Processing</option>
                    <option value="completed" ${state.filters.status === 'completed' ? 'selected' : ''}>Completed</option>
                    <option value="rejected" ${state.filters.status === 'rejected' ? 'selected' : ''}>Rejected</option>
                    <option value="cancelled" ${state.filters.status === 'cancelled' ? 'selected' : ''}>Cancelled</option>
                  </select>
                </label>

                <label class="field">
                  <span>Date from</span>
                  <input type="date" name="dateFrom" value="${state.filters.dateFrom || ''}" />
                </label>

                <label class="field">
                  <span>Date to</span>
                  <input type="date" name="dateTo" value="${state.filters.dateTo || ''}" />
                </label>

                <button class="button button--secondary" type="button" data-action="head-reset-filters">Reset</button>
              </div>
            </form>
          </div>

          ${renderHeadTable(appointments)}
        </section>
      `;
    }

    const pending = appointments.filter((appointment) => appointment.status === 'pending');

    return `
      ${renderStatCards([
        { label: 'Pending requests', value: state.dashboard.stats.pendingRequests, icon: 'clock', hint: 'Awaiting approval or rejection.', tone: 'gold' },
        { label: 'Approved / assigned', value: state.dashboard.stats.approvedRequests, icon: 'check', hint: 'Already distributed into the workflow.', tone: 'forest' },
        { label: 'Processing now', value: state.dashboard.stats.processingRequests, icon: 'document', hint: 'Currently in registrar handling.', tone: 'sky' },
        { label: 'Completed', value: state.dashboard.stats.completedRequests, icon: 'receipt', hint: 'Released or finalized requests.', tone: 'success' },
        { label: 'Cancelled', value: state.dashboard.stats.cancelledRequests, icon: 'alert', hint: 'Student requests withdrawn from the workflow.', tone: 'danger' },
      ])}

      <section class="panel-grid">
        <article class="section-card">
          <div class="section-card__header">
            <div>
              <h3 class="section-card__title">Priority queue</h3>
              <p class="section-card__description">The newest pending requests should be reviewed first.</p>
            </div>
          </div>
          ${renderHeadTable(pending.slice(0, 4))}
        </article>

        <article class="section-card section-card--soft">
          <div class="section-card__header">
            <div>
              <h3 class="section-card__title">Available staff</h3>
              <p class="section-card__description">Use this quick view when routing requests to the proper staff queue.</p>
            </div>
          </div>
          ${
            state.dashboard.staffMembers.length
              ? `
                  <div class="stack">
                    ${state.dashboard.staffMembers
                      .map(
                        (staff) => `
                          <article class="section-card">
                            <strong>${escapeHTML(staff.fullName)}</strong>
                            <p class="section-card__description">${escapeHTML(staff.email)}</p>
                          </article>
                        `
                      )
                      .join('')}
                  </div>
                `
              : renderEmptyState('No staff accounts found', 'Create or reactivate registrar staff accounts so appointments can be assigned.')
          }
        </article>

      </section>

      <section class="section-card">
        <div class="section-card__header">
          <div>
            <h3 class="section-card__title">Student appointment history</h3>
            <p class="section-card__description">Review all appointments students have submitted so every request remains visible in the audit trail.</p>
          </div>
        </div>
        ${
          appointments.length
            ? renderHeadTable(appointments)
            : renderEmptyState('No appointments found', 'Student appointment history will appear here automatically.')
        }
      </section>
    `;
  },
  async handleAction(action, button, helpers) {
    const appointment = helpers.getState().dashboard.appointments.find((item) => Number(item.id) === Number(button.dataset.id));
    if (!appointment) {
      return;
    }

    if (action === 'head-reset-filters') {
      helpers.setState((state) => ({
        ...state,
        filters: {
          status: '',
          dateFrom: '',
          dateTo: '',
        },
      }));
      return;
    }

    if (action === 'head-approve') {
      if (!window.confirm(`Approve ${appointment.referenceNo}?`)) {
        return;
      }

      await helpers.api.patch(`/head/appointments/${appointment.id}/approve`, { remarks: appointment.remarks || '' });
      helpers.showToast('Appointment approved successfully.', 'success');
      await helpers.refresh({ silent: true });
      return;
    }

    if (action === 'head-assign') {
      openAssignModal(helpers, appointment);
      return;
    }

    if (action === 'head-reject') {
      openRejectModal(helpers, appointment);
    }
  },
  async handleSubmit(formName, form, helpers) {
    const formData = new FormData(form);

    if (formName === 'head-assign-form') {
      await helpers.api.patch(`/head/appointments/${formData.get('appointmentId')}/assign`, {
        staffId: formData.get('staffId'),
        remarks: formData.get('remarks'),
      });
      helpers.closeModal();
      helpers.showToast('Staff assigned successfully.', 'success');
      await helpers.refresh({ silent: true });
      return;
    }

    if (formName === 'head-reject-form') {
      await helpers.api.patch(`/head/appointments/${formData.get('appointmentId')}/reject`, {
        rejectionReason: formData.get('rejectionReason'),
      });
      helpers.closeModal();
      helpers.showToast('Appointment rejected.', 'warning');
      await helpers.refresh({ silent: true });
    }
  },
  async handleChange(input, helpers) {
    const form = input.closest('form[data-form="head-filters"]');
    if (!form) {
      return;
    }

    const formData = new FormData(form);
    helpers.setState((state) => ({
      ...state,
      filters: {
        status: formData.get('status') || '',
        dateFrom: formData.get('dateFrom') || '',
        dateTo: formData.get('dateTo') || '',
      },
    }));
  },
});

