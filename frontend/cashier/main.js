import { renderTable } from '../components/table.js';
import { createPortalApp } from '../shared/portal.js';
import { escapeHTML, formatCurrency, formatDate, formatDateTime, formatTimeRange, resolveMediaUrl, statusBadge } from '../shared/formatters.js';
import { renderEmptyState, renderStatCards } from '../shared/ui.js';

const NAV_ITEMS = [
  { id: 'overview', label: 'Dashboard', icon: 'dashboard' },
  { id: 'payments', label: 'Payments', icon: 'wallet' },
];

function matchesSearch(appointment, query, filters = {}) {
  if (filters.status && appointment.status !== filters.status) return false;
  if (filters.dateFrom && appointment.appointmentDate < filters.dateFrom) return false;
  if (filters.dateTo && appointment.appointmentDate > filters.dateTo) return false;

  if (!query) return true;
  const haystack = [
    appointment.referenceNo,
    appointment.studentName,
    appointment.documentName,
    appointment.status,
    appointment.payment?.method,
  ].join(' ').toLowerCase();
  return haystack.includes(query.toLowerCase());
}

function canReviewPayment(appointment) {
  return appointment.status !== 'cancelled' && ['for_verification', 'pending'].includes(appointment.payment?.status || appointment.paymentStatus);
}

function renderPaymentTable(appointments) {
  return renderTable({
    rows: appointments,
    cardTitle: (row) => escapeHTML(row.referenceNo),
    emptyTitle: 'No payment records',
    emptyMessage: 'Student payment submissions will appear here for cashier verification.',
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
        label: 'Amount',
        render: (row) => `<strong>${escapeHTML(formatCurrency(row.payment?.amount || 0))}</strong><br><span class="muted">${escapeHTML(
          row.payment?.method?.toUpperCase() || 'N/A'
        )}</span>`,
      },
      {
        label: 'Reference',
        render: (row) =>
          row.payment?.method === 'gcash' && row.payment?.referenceNumber
            ? `<strong style="font-family: monospace;">${escapeHTML(row.payment.referenceNumber)}</strong><br><span class="muted">GCash</span>`
            : '<span class="muted">-</span>',
      },
      {
        label: 'Payment proof',
        render: (row) =>
          row.payment?.proofImage
            ? `<span class="muted">Student screenshot uploaded</span><br><span class="muted">${escapeHTML(
                formatDateTime(row.payment.createdAt || row.createdAt)
              )}</span>`
            : row.payment?.method === 'gcash'
              ? '<span class="muted">No GCash proof</span>'
              : '<span class="muted">Cash payment</span>',
      },
      {
        label: 'Status',
        render: (row) => statusBadge(row.status),
      },
      {
        label: 'Actions',
        render: (row) =>
          canReviewPayment(row)
            ? `<button class="button button--secondary" type="button" data-action="cashier-review" data-id="${row.id}">Review</button>`
            : '<span class="muted">No action</span>',
      },
    ],
  });
}

function openReviewModal(helpers, appointment) {
  const isGcashPayment = appointment.payment?.method === 'gcash';

  helpers.openModal({
    title: `Review ${appointment.referenceNo}`,
    description: isGcashPayment
      ? 'Inspect the student-uploaded screenshot and payment details, then approve or reject the payment.'
      : 'Confirm the cash payment details, then approve or reject the payment.',
    content: `
      <form data-form="cashier-review-form" class="stack">
        <input type="hidden" name="appointmentId" value="${appointment.id}" />

        <article class="section-card section-card--soft">
          <div class="info-list">
            <div class="info-list__item"><span>Student</span><strong>${escapeHTML(appointment.studentName)}</strong></div>
            <div class="info-list__item"><span>Student ID</span><strong>${escapeHTML(appointment.studentIdentifier || 'N/A')}</strong></div>
            <div class="info-list__item"><span>Document</span><strong>${escapeHTML(appointment.documentName)}</strong></div>
            <div class="info-list__item"><span>Schedule</span><strong>${escapeHTML(formatDate(appointment.appointmentDate))}<br>${escapeHTML(
              formatTimeRange(appointment.startTime, appointment.endTime)
            )}</strong></div>
            <div class="info-list__item"><span>Amount</span><strong>${escapeHTML(formatCurrency(appointment.payment?.amount || 0))}</strong></div>
            <div class="info-list__item"><span>Appointment</span><strong>${statusBadge(appointment.status)}</strong></div>
            <div class="info-list__item"><span>Payment method</span><strong>${escapeHTML(
              appointment.payment?.method?.toUpperCase() || 'N/A'
            )}</strong></div>
          </div>
        </article>

        ${
          isGcashPayment && appointment.payment?.referenceNumber
            ? `
                <article class="section-card payment-preview-card">
                  <div>
                    <span class="eyebrow">GCash reference</span>
                    <h4 style="font-family: var(--font-sans);">${escapeHTML(appointment.payment.referenceNumber)}</h4>
                    <p class="section-card__description">Match this reference number against the student-uploaded screenshot before approving the payment.</p>
                  </div>
                </article>
              `
            : ''
        }

        ${
          isGcashPayment
            ? appointment.payment?.proofImage
              ? `
                  <article class="section-card">
                    <strong>Student uploaded receipt screenshot</strong>
                    <p class="section-card__description" style="margin-top: 0.5rem;">Review the screenshot uploaded by the student to verify transaction details.</p>
                  </article>
                  <img class="media-proof" src="${escapeHTML(resolveMediaUrl(appointment.payment.proofImage))}" alt="Payment proof for ${escapeHTML(
                    appointment.referenceNo
                  )}" />
                `
              : '<article class="section-card"><p class="section-card__description">No GCash proof image was uploaded.</p></article>'
            : ''
        }

        <label class="field">
          <span>Decision</span>
          <select name="decision" data-cashier-decision>
            <option value="approve">Approve payment</option>
            <option value="reject">Reject payment</option>
          </select>
        </label>

        <label class="field hidden" data-rejection-group>
          <span>Rejection reason</span>
          <textarea name="rejectionReason" placeholder="Explain why the proof cannot be verified or why the payment is incorrect"></textarea>
        </label>

        <div class="inline-actions">
          <button class="button button--primary" type="submit">Save cashier decision</button>
          <button class="button button--ghost" type="button" data-close-modal>Cancel</button>
        </div>
      </form>
    `,
  });
}

createPortalApp({
  role: 'cashier',
  roleLabel: 'Cashier',
  portalTitle: 'Cashier Verification Desk',
  portalDescription: 'Review uploaded GCash proofs and confirm pending cash transactions without leaving the live queue.',
  heroTitle: 'Payment verification center',
  heroDescription: 'Cashier decisions update student and staff dashboards instantly, helping the registrar workflow move without page reloads.',
  navItems: NAV_ITEMS,
  defaultSection: 'overview',
  initialState: {
    filters: { status: '', dateFrom: '', dateTo: '' },
  },
  primaryAction: {
    label: 'Open Payments Queue',
    icon: 'wallet',
    async onClick(helpers) {
      helpers.setState({ activeSection: 'payments' });
    },
  },
  async loadData({ api }) {
    return api.get('/cashier/dashboard');
  },
  renderContent(state) {
    if (!state.dashboard) {
      return renderEmptyState('Loading', 'Preparing cashier records...');
    }

    const filters = state.filters || {};
    const appointments = state.dashboard.appointments.filter((appointment) => matchesSearch(appointment, state.searchQuery, filters));
    const cancelledCount = appointments.filter((appointment) => appointment.status === 'cancelled').length;

    if (state.activeSection === 'payments') {
      return `
        <section class="section-card">
          <div class="section-card__header">
            <div>
              <h3 class="section-card__title">Verification queue</h3>
              <p class="section-card__description">Approve or reject submitted payment proofs while still seeing every appointment record tied to each student.</p>
            </div>
          </div>

          <div class="filter-panel">
            <form data-form="cashier-filters" class="filter-form">
              <div class="filter-controls">
                <label class="field">
                  <span>Appointment status</span>
                  <select name="status">
                    <option value="">All statuses</option>
                    <option value="pending" ${filters.status === 'pending' ? 'selected' : ''}>Pending</option>
                    <option value="approved" ${filters.status === 'approved' ? 'selected' : ''}>Approved</option>
                    <option value="assigned" ${filters.status === 'assigned' ? 'selected' : ''}>Scheduled</option>
                    <option value="processing" ${filters.status === 'processing' ? 'selected' : ''}>Processing</option>
                    <option value="completed" ${filters.status === 'completed' ? 'selected' : ''}>Completed</option>
                    <option value="rejected" ${filters.status === 'rejected' ? 'selected' : ''}>Rejected</option>
                    <option value="cancelled" ${filters.status === 'cancelled' ? 'selected' : ''}>Cancelled</option>
                  </select>
                </label>
                <label class="field">
                  <span>Date from</span>
                  <input type="date" name="dateFrom" value="${filters.dateFrom || ''}" />
                </label>
                <label class="field">
                  <span>Date to</span>
                  <input type="date" name="dateTo" value="${filters.dateTo || ''}" />
                </label>
                <button class="button button--secondary" type="button" data-action="cashier-reset-filters">Reset</button>
              </div>
            </form>
          </div>

          ${renderPaymentTable(appointments)}
        </section>
      `;
    }

    const pending = appointments.filter((appointment) => canReviewPayment(appointment));

    return `
      ${renderStatCards([
        { label: 'Pending verification', value: state.dashboard.stats.pendingVerification, icon: 'clock', hint: 'Needs cashier review now.', tone: 'gold' },
        { label: 'Paid transactions', value: state.dashboard.stats.paidTransactions, icon: 'check', hint: 'Verified and released to the workflow.', tone: 'success' },
        { label: 'Rejected payments', value: state.dashboard.stats.rejectedTransactions, icon: 'alert', hint: 'Waiting for a corrected proof.', tone: 'sky' },
        { label: 'Cancelled requests', value: cancelledCount, icon: 'alert', hint: 'Visible so cashier actions stay aligned with appointment status.', tone: 'danger' },
      ])}

      <section class="section-card">
        <div class="section-card__header">
          <div>
            <h3 class="section-card__title">Needs attention</h3>
            <p class="section-card__description">Prioritize these records so students can continue their appointment processing immediately.</p>
          </div>
        </div>
        ${renderPaymentTable(pending.slice(0, 5))}
      </section>

      <section class="section-card">
        <div class="section-card__header">
          <div>
            <h3 class="section-card__title">Student appointment history</h3>
            <p class="section-card__description">See every appointment and payment state a student has submitted, not just cancelled records.</p>
          </div>
        </div>
        ${
          appointments.length
            ? renderPaymentTable(appointments)
            : renderEmptyState('No appointment records', 'Student appointment and payment history will appear here automatically.')
        }
      </section>
    `;
  },
  async handleAction(action, button, helpers) {
    if (action === 'cashier-reset-filters') {
      helpers.setState((s) => ({ ...s, filters: { status: '', dateFrom: '', dateTo: '' } }));
      return;
    }
    const appointment = helpers.getState().dashboard.appointments.find((item) => Number(item.id) === Number(button.dataset.id));
    if (action === 'cashier-review' && appointment) {
      openReviewModal(helpers, appointment);
    }
  },
  async handleInput(target) {
    if (target.matches('[data-cashier-decision]')) {
      const rejectionGroup = document.querySelector('[data-rejection-group]');
      const rejectionField = rejectionGroup?.querySelector('textarea');
      const shouldShow = target.value === 'reject';
      rejectionGroup?.classList.toggle('hidden', !shouldShow);
      if (rejectionField) {
        rejectionField.required = shouldShow;
      }
    }
  },
  async handleChange(target, helpers) {
    const form = target.closest('form[data-form="cashier-filters"]');
    if (!form) return;
    const formData = new FormData(form);
    helpers.setState((s) => ({
      ...s,
      filters: {
        status: formData.get('status') || '',
        dateFrom: formData.get('dateFrom') || '',
        dateTo: formData.get('dateTo') || '',
      },
    }));
  },
  async handleSubmit(formName, form, helpers) {
    if (formName !== 'cashier-review-form') {
      return;
    }

    const formData = new FormData(form);
    const appointmentId = formData.get('appointmentId');
    const decision = formData.get('decision');

    if (decision === 'approve') {
      await helpers.api.patch(`/cashier/payments/${appointmentId}/approve`, {});
      helpers.showToast('Payment approved successfully.', 'success');
    } else {
      await helpers.api.patch(`/cashier/payments/${appointmentId}/reject`, {
        rejectionReason: formData.get('rejectionReason'),
      });
      helpers.showToast('Payment rejected and sent back to the student.', 'warning');
    }

    helpers.closeModal();
    await helpers.refresh({ silent: true });
  },
});
