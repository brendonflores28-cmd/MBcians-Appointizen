import { APP_CONFIG } from '../config.js';
import { renderTable } from '../components/table.js';
import { createPortalApp } from '../shared/portal.js';
import { escapeHTML, formatCurrency, formatDate, formatTimeRange, resolveMediaUrl, statusBadge } from '../shared/formatters.js';
import { renderEmptyState, renderStatCards } from '../shared/ui.js';

const NAV_ITEMS = [
  { id: 'overview', label: 'Dashboard', icon: 'dashboard' },
  { id: 'book', label: 'Book Appointment', icon: 'calendar' },
  { id: 'requests', label: 'My Requests', icon: 'file' },
];

const CANCELLABLE_STATUSES = ['pending', 'approved', 'assigned', 'processing'];
const PAYMENT_READY_STATUSES = ['approved', 'assigned', 'processing'];

function buildDefaultBooking(settings, documents) {
  const preferredMethod = settings?.gcashEnabled ? 'gcash' : settings?.cashEnabled ? 'cash' : 'gcash';
  return {
    step: 1,
    documentTypeId: documents[0]?.id || '',
    copies: 1,
    isRush: false,
    purpose: '',
    remarks: '',
    paymentMethod: preferredMethod,
    referenceNumber: '',
    appointmentDate: '',
    timeSlotId: '',
  };
}

function getPaymentChoices(settings) {
  return [
    settings?.gcashEnabled ? { value: 'gcash', label: 'GCash' } : null,
    settings?.cashEnabled ? { value: 'cash', label: 'Cash' } : null,
  ].filter(Boolean);
}

function matchesAppointmentSearch(appointment, query, filters = {}) {
  if (filters.status && appointment.status !== filters.status) return false;
  if (filters.dateFrom && appointment.appointmentDate < filters.dateFrom) return false;
  if (filters.dateTo && appointment.appointmentDate > filters.dateTo) return false;

  if (!query) return true;
  const haystack = [
    appointment.referenceNo,
    appointment.documentName,
    appointment.status,
    appointment.purpose,
  ].join(' ').toLowerCase();
  return haystack.includes(query.toLowerCase());
}

function calculateDocumentFee(document, booking) {
  if (!document) return 0;
  const copies = Math.max(1, Number(booking.copies) || 1);
  const perCopy = Number(document.baseFee) + (booking.isRush ? Number(document.rushFee) : 0);
  return perCopy * copies;
}

function getSelectedSlot(availability, timeSlotId) {
  if (!availability?.slots?.length || !timeSlotId) return null;
  return availability.slots.find((slot) => Number(slot.id) === Number(timeSlotId)) || null;
}

function getUpcomingAppointment(appointments) {
  const today = new Date().toISOString().slice(0, 10);
  return appointments.find(
    (a) => a.appointmentDate >= today && !['completed', 'rejected', 'cancelled'].includes(a.status)
  );
}

function canSubmitPayment(appointment) {
  if (appointment.paymentStatus === 'rejected') {
    return !['completed', 'rejected', 'cancelled'].includes(appointment.status);
  }
  return (
    PAYMENT_READY_STATUSES.includes(appointment.status) &&
    !['paid', 'for_verification'].includes(appointment.paymentStatus)
  );
}

function canCancelAppointment(appointment) {
  return CANCELLABLE_STATUSES.includes(appointment.status);
}

async function loadAvailability(helpers, appointmentDate) {
  if (!appointmentDate) {
    helpers.setState({
      availability: null,
      availabilityLoading: false,
      booking: { ...helpers.getState().booking, appointmentDate: '', timeSlotId: '' },
    });
    return;
  }

  helpers.setState((current) => ({
    ...current,
    availability: null,
    availabilityLoading: true,
    booking: { ...current.booking, appointmentDate, timeSlotId: '' },
  }));

  try {
    const availability = await helpers.api.get(`/student/availability?date=${encodeURIComponent(appointmentDate)}`);
    helpers.setState((current) => ({
      ...current,
      availability,
      availabilityLoading: false,
      booking: { ...current.booking, appointmentDate, timeSlotId: '' },
    }));
    if (availability.blocked) {
      helpers.showToast(availability.reason || 'Selected date is blocked.', 'warning');
    }
  } catch (error) {
    helpers.setState((current) => ({
      ...current,
      availability: null,
      availabilityLoading: false,
      booking: { ...current.booking, appointmentDate, timeSlotId: '' },
    }));
    helpers.showToast(error.message || 'Unable to load time slots for that date.', 'error');
  }
}

function toggleStudentPaymentFields(method) {
  const proofGroup = document.querySelector('[data-proof-upload-group]');
  const proofInput = document.querySelector('input[name="proofImage"]');
  const qrSection = document.querySelector('[data-qr-section]');
  const cashGroup = document.querySelector('[data-cash-info-group]');
  const isGcash = method === 'gcash';

  proofGroup?.classList.toggle('hidden', !isGcash);
  qrSection?.classList.toggle('hidden', !isGcash);
  cashGroup?.classList.toggle('hidden', isGcash);
  if (proofInput) proofInput.required = isGcash;
}

function renderProofPreview(file) {
  const previewContainer = document.getElementById('proof-preview-container');
  if (!previewContainer) return;
  if (!file || !file.type.startsWith('image/')) {
    previewContainer.innerHTML = '';
    return;
  }
  const reader = new FileReader();
  reader.onload = (event) => {
    previewContainer.innerHTML = `
      <article class="payment-proof-preview">
        <img src="${escapeHTML(event.target?.result || '')}" alt="Payment receipt preview" class="proof-preview-image" />
        <p class="text-caption">Receipt uploaded and ready for submission.</p>
      </article>
    `;
  };
  reader.readAsDataURL(file);
}

async function fetchLogoDataUrl() {
  try {
    const logoPath = (import.meta.env.BASE_URL || '/') + 'assets/logo.png';
    const response = await fetch(logoPath);
    if (!response.ok) return null;
    const blob = await response.blob();
    return await new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

async function printReceipt(appointment, settings) {
  const logoDataUrl = await fetchLogoDataUrl();
  const date = formatDate(appointment.appointmentDate);
  const timeRange = formatTimeRange(appointment.startTime, appointment.endTime);
  const totalAmount = appointment.payment?.amount || 0;
  const copies = Number(appointment.copies) || 1;
  const isRush = Boolean(appointment.isRush);
  const baseFee = appointment.baseFee != null ? Number(appointment.baseFee) : null;
  const rushFee = appointment.rushFee != null ? Number(appointment.rushFee) : null;
  const amount = formatCurrency(totalAmount);
  const method = appointment.payment?.method === 'gcash' ? 'GCash (Online)' : 'Cash';
  const issuedOn = new Date().toLocaleDateString('en-PH', { year: 'numeric', month: 'long', day: 'numeric' });
  const issuedTime = new Date().toLocaleTimeString('en-PH', { hour: 'numeric', minute: '2-digit', hour12: true });
  const orgName = settings?.orgName || 'Office of the University Registrar';
  const orgEmail = settings?.orgEmail || '';
  const orgPhone = settings?.orgPhone || '';
  const officeHours = settings?.officeHours || 'Monday – Friday, 8:00 AM – 5:00 PM';

  const logoHTML = logoDataUrl
    ? `<img src="${logoDataUrl}" alt="${escapeHTML(orgName)} logo" class="logo-img" />`
    : `<div class="logo-placeholder">🏫</div>`;

  const receiptHTML = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Official Receipt — ${escapeHTML(appointment.referenceNo)}</title>
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap');

    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

    body {
      font-family: 'Inter', system-ui, -apple-system, sans-serif;
      font-size: 12px;
      color: #111827;
      background: #f3f4f6;
      padding: 20px;
      min-height: 100vh;
      display: flex;
      flex-direction: column;
      align-items: center;
    }

    .page {
      width: 100%;
      max-width: 480px;
    }

    /* ── Receipt card ──────────────────────────────── */
    .receipt {
      background: #fff;
      border-radius: 16px;
      overflow: hidden;
      box-shadow: 0 4px 24px rgba(0,0,0,0.12);
    }

    /* ── Header band ───────────────────────────────── */
    .receipt-head {
      background: linear-gradient(135deg, #0f3d22 0%, #1a6b3a 60%, #22a85a 100%);
      color: #fff;
      padding: 24px 24px 20px;
      text-align: center;
      position: relative;
    }

    .receipt-head::after {
      content: '';
      display: block;
      position: absolute;
      bottom: -12px;
      left: 0; right: 0;
      height: 24px;
      background: #fff;
      border-radius: 50% 50% 0 0 / 100% 100% 0 0;
    }

    .logo-img {
      width: 68px;
      height: 68px;
      border-radius: 50%;
      object-fit: cover;
      border: 3px solid rgba(255,255,255,0.35);
      background: #fff;
      margin-bottom: 10px;
      display: block;
      margin-left: auto;
      margin-right: auto;
    }

    .logo-placeholder {
      font-size: 48px;
      line-height: 1;
      margin-bottom: 8px;
    }

    .receipt-head h1 {
      font-size: 15px;
      font-weight: 800;
      letter-spacing: 0.3px;
      line-height: 1.3;
      margin-bottom: 4px;
    }

    .receipt-head .sub {
      font-size: 10.5px;
      color: rgba(255,255,255,0.76);
      letter-spacing: 0.5px;
    }

    /* ── Reference badge ───────────────────────────── */
    .ref-band {
      padding: 22px 24px 16px;
      text-align: center;
      border-bottom: 1px dashed #e5e7eb;
    }

    .ref-label {
      font-size: 9px;
      font-weight: 700;
      letter-spacing: 1.5px;
      text-transform: uppercase;
      color: #6b7280;
      margin-bottom: 6px;
    }

    .ref-number {
      font-size: 16px;
      font-weight: 800;
      letter-spacing: 0.5px;
      color: #0f3d22;
      background: #f0fdf4;
      border: 1.5px solid #bbf7d0;
      border-radius: 10px;
      padding: 8px 16px;
      display: inline-block;
      word-break: break-all;
    }

    .status-badge {
      display: inline-flex;
      align-items: center;
      gap: 5px;
      margin-top: 10px;
      padding: 4px 12px;
      border-radius: 999px;
      background: #dcfce7;
      color: #15803d;
      font-size: 10px;
      font-weight: 700;
      letter-spacing: 0.5px;
    }

    .status-dot {
      width: 7px;
      height: 7px;
      border-radius: 50%;
      background: #16a34a;
    }

    /* ── Info grid ─────────────────────────────────── */
    .info-section {
      padding: 20px 24px;
      border-bottom: 1px dashed #e5e7eb;
    }

    .info-section-title {
      font-size: 9px;
      font-weight: 700;
      letter-spacing: 1.5px;
      text-transform: uppercase;
      color: #9ca3af;
      margin-bottom: 12px;
    }

    .info-row {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      gap: 12px;
      padding: 5px 0;
      border-bottom: 1px solid #f9fafb;
    }

    .info-row:last-child { border-bottom: none; }

    .info-label {
      color: #6b7280;
      font-size: 11px;
      font-weight: 500;
      flex-shrink: 0;
      min-width: 90px;
    }

    .info-value {
      color: #111827;
      font-size: 11px;
      font-weight: 600;
      text-align: right;
      word-break: break-word;
    }

    /* ── Rush tag ──────────────────────────────────── */
    .rush-tag {
      display: inline-flex;
      align-items: center;
      gap: 3px;
      background: #fef3c7;
      color: #92400e;
      border: 1px solid #fde68a;
      padding: 2px 8px;
      border-radius: 6px;
      font-size: 10px;
      font-weight: 700;
    }

    /* ── Amount box ────────────────────────────────── */
    .amount-section {
      padding: 16px 24px;
      background: #f0fdf4;
      border-bottom: 1px dashed #e5e7eb;
      display: flex;
      align-items: center;
      justify-content: space-between;
    }

    .amount-label {
      font-size: 12px;
      font-weight: 700;
      color: #374151;
    }

    .amount-value {
      font-size: 20px;
      font-weight: 800;
      color: #0f3d22;
    }

    .method-tag {
      font-size: 10px;
      color: #6b7280;
      margin-top: 2px;
      text-align: right;
    }

    /* ── Footer ────────────────────────────────────── */
    .receipt-foot {
      padding: 16px 24px;
      text-align: center;
      background: #f9fafb;
      border-top: 2px dashed #d1fae5;
    }

    .receipt-foot p {
      font-size: 10px;
      color: #6b7280;
      line-height: 1.6;
      margin-bottom: 3px;
    }

    .receipt-foot .hours {
      font-size: 10px;
      font-weight: 600;
      color: #374151;
    }

    .issued-line {
      font-size: 9.5px;
      color: #9ca3af;
      margin-top: 8px;
    }

    .watermark {
      font-size: 9px;
      letter-spacing: 2px;
      text-transform: uppercase;
      color: #d1d5db;
      margin-top: 6px;
    }

    /* ── Print button (hidden on print) ────────────── */
    .print-actions {
      margin-top: 16px;
      display: flex;
      gap: 10px;
      justify-content: center;
    }

    .btn-print {
      padding: 10px 28px;
      background: #0f3d22;
      color: #fff;
      border: none;
      border-radius: 10px;
      font-size: 13px;
      font-weight: 700;
      cursor: pointer;
      transition: background 0.15s;
    }

    .btn-print:hover { background: #1a6b3a; }

    .btn-close {
      padding: 10px 20px;
      background: #f3f4f6;
      color: #374151;
      border: 1px solid #d1d5db;
      border-radius: 10px;
      font-size: 13px;
      font-weight: 600;
      cursor: pointer;
    }

    /* ── Print overrides ───────────────────────────── */
    @media print {
      body { background: #fff; padding: 0; }
      .print-actions { display: none; }
      .receipt {
        box-shadow: none;
        border-radius: 0;
      }
    }
  </style>
</head>
<body>
  <div class="page">
    <div class="receipt">

      <div class="receipt-head">
        ${logoHTML}
        <h1>${escapeHTML(orgName)}</h1>
        <p class="sub">OFFICIAL APPOINTMENT RECEIPT</p>
      </div>

      <div class="ref-band">
        <div class="ref-label">Appointment Reference</div>
        <div class="ref-number">${escapeHTML(appointment.referenceNo)}</div>
        <div class="status-badge">
          <span class="status-dot"></span>
          COMPLETED
        </div>
      </div>

      <div class="info-section">
        <div class="info-section-title">Student Information</div>
        <div class="info-row">
          <span class="info-label">Full Name</span>
          <span class="info-value">${escapeHTML(appointment.studentName)}</span>
        </div>
        <div class="info-row">
          <span class="info-label">Student ID</span>
          <span class="info-value">${escapeHTML(appointment.studentIdentifier || 'N/A')}</span>
        </div>
        <div class="info-row">
          <span class="info-label">Email</span>
          <span class="info-value">${escapeHTML(appointment.studentEmail || 'N/A')}</span>
        </div>
      </div>

      <div class="info-section">
        <div class="info-section-title">Request Details</div>
        <div class="info-row">
          <span class="info-label">Document</span>
          <span class="info-value">${escapeHTML(appointment.documentName)}</span>
        </div>
        <div class="info-row">
          <span class="info-label">Copies</span>
          <span class="info-value">${escapeHTML(String(appointment.copies))}</span>
        </div>
        <div class="info-row">
          <span class="info-label">Processing</span>
          <span class="info-value">${appointment.isRush ? '<span class="rush-tag">⚡ Rush</span>' : 'Regular'}</span>
        </div>
        <div class="info-row">
          <span class="info-label">Purpose</span>
          <span class="info-value">${escapeHTML(appointment.purpose || 'N/A')}</span>
        </div>
      </div>

      <div class="info-section">
        <div class="info-section-title">Schedule</div>
        <div class="info-row">
          <span class="info-label">Date</span>
          <span class="info-value">${escapeHTML(date)}</span>
        </div>
        <div class="info-row">
          <span class="info-label">Time Slot</span>
          <span class="info-value">${escapeHTML(timeRange)}</span>
        </div>
      </div>

      ${baseFee != null ? `
      <div class="info-section">
        <div class="info-section-title">Fee Breakdown</div>
        <div class="info-row">
          <span class="info-label">Base price ×${copies}</span>
          <span class="info-value">${escapeHTML(formatCurrency(baseFee * copies))}</span>
        </div>
        ${isRush && rushFee != null ? `
        <div class="info-row">
          <span class="info-label">Rush fee ×${copies}</span>
          <span class="info-value">${escapeHTML(formatCurrency(rushFee * copies))}</span>
        </div>` : ''}
      </div>` : ''}

      <div class="amount-section">
        <div>
          <div class="amount-label">Total Amount Paid</div>
          <div class="method-tag">${escapeHTML(method)}</div>
        </div>
        <div>
          <div class="amount-value">${escapeHTML(amount)}</div>
        </div>
      </div>

      <div class="receipt-foot">
        <p>Present this receipt when claiming your document at the Registrar's Office.</p>
        <p class="hours">${escapeHTML(officeHours)}</p>
        ${orgEmail ? `<p>${escapeHTML(orgEmail)}${orgPhone ? '  ·  ' + escapeHTML(orgPhone) : ''}</p>` : ''}
        <p class="issued-line">Issued: ${issuedOn} at ${issuedTime}</p>
        <p class="watermark">· · · official receipt · · ·</p>
      </div>

    </div>

    <div class="print-actions">
      <button class="btn-print" onclick="window.print();">🖨&nbsp; Print / Save PDF</button>
      <button class="btn-close" onclick="window.close();">Close</button>
    </div>
  </div>
</body>
</html>`;

  const win = window.open('', '_blank', 'width=540,height=760,scrollbars=yes,resizable=yes');
  if (win) {
    win.document.write(receiptHTML);
    win.document.close();
  }
}

function renderStudentOverview(state) {
  const { dashboard, searchQuery } = state;
  const filters = state.filters || {};
  const appointments = dashboard.appointments.filter((a) => matchesAppointmentSearch(a, searchQuery, filters));

  return `
    ${renderStatCards([
      { label: 'Total appointments', value: dashboard.stats.totalAppointments, icon: 'dashboard', tone: 'forest' },
      { label: 'Pending', value: dashboard.stats.pendingAppointments, icon: 'clock', tone: 'gold' },
      { label: 'In progress', value: dashboard.stats.inProgressAppointments, icon: 'calendar', tone: 'sky' },
      { label: 'Completed', value: dashboard.stats.completedAppointments, icon: 'check', tone: 'success' },
      { label: 'Cancelled', value: dashboard.stats.cancelledAppointments, icon: 'alert', tone: 'danger' },
    ])}

    <section class="section-card">
      <div class="section-card__header">
        <div><h3 class="section-card__title">Recent requests</h3></div>
      </div>
      ${renderAppointmentsTable(appointments.slice(0, 5), dashboard.settings)}
    </section>
  `;
}

function renderStudentBookSection(state) {
  const { dashboard, booking, availability, availabilityLoading } = state;
  const document = dashboard.documents.find((item) => Number(item.id) === Number(booking.documentTypeId));
  const totalAmount = calculateDocumentFee(document, booking);
  const paymentChoices = getPaymentChoices(dashboard.settings);
  const selectedSlot = getSelectedSlot(availability, booking.timeSlotId);

  if (booking.step === 2) {
    return `
      <section class="floating-form-wrap">
        <div class="floating-form">
          <div class="floating-form__header">
            <div>
              <h3>Review &amp; payment</h3>
              <p>Confirm your details, then complete payment before submitting.</p>
            </div>
            <button class="button button--ghost" type="button" data-action="student-booking-prev">← Back</button>
          </div>

          <form data-form="student-booking-step-3" class="floating-form__body">
            <div class="review-list">
              <div class="review-list__item"><span>Student</span><strong>${escapeHTML(state.user.fullName)}<br><span class="muted">${escapeHTML(state.user.studentId || 'N/A')}</span></strong></div>
              <div class="review-list__item"><span>Document</span><strong>${escapeHTML(document?.name || 'N/A')}</strong></div>
              <div class="review-list__item"><span>Purpose</span><strong>${escapeHTML(booking.purpose)}</strong></div>
              <div class="review-list__item"><span>Copies</span><strong>${escapeHTML(String(booking.copies))}</strong></div>
              <div class="review-list__item"><span>Type</span><strong>${booking.isRush ? '<span class="status-pill status-pill--warning">Rush</span>' : 'Regular'}</strong></div>
              <div class="review-list__item"><span>Schedule</span><strong>${escapeHTML(formatDate(booking.appointmentDate))}<br>${escapeHTML(formatTimeRange(selectedSlot?.startTime, selectedSlot?.endTime))}</strong></div>
              <div class="review-list__item"><span>Payment</span><strong>${escapeHTML(booking.paymentMethod === 'gcash' ? 'GCash' : 'Cash')}</strong></div>
              <div class="review-list__item"><span>Total amount</span><strong class="amount-highlight">${escapeHTML(formatCurrency(totalAmount))}</strong></div>
              ${booking.remarks ? `<div class="review-list__item"><span>Remarks</span><strong>${escapeHTML(booking.remarks)}</strong></div>` : ''}
            </div>

            ${booking.paymentMethod === 'gcash' ? `
              <article class="section-card payment-preview-card" style="margin-top:1rem;">
                <div>
                  <span class="eyebrow">GCash payment</span>
                  <h4>Scan, pay, then upload your proof</h4>
                  <p class="section-card__description">Complete payment, enter the reference number, and upload your screenshot before submitting.</p>
                </div>
                <div class="payment-preview-card__details">
                  <img class="payment-preview-card__qr"
                    src="${escapeHTML(resolveMediaUrl(dashboard.settings?.gcashQrImage) || APP_CONFIG.DEFAULT_QR_ASSET)}"
                    alt="GCash QR for ${escapeHTML(dashboard.settings?.gcashName || 'merchant')}"
                  />
                  <div class="payment-preview-card__meta">
                    <strong>${escapeHTML(dashboard.settings?.gcashName || 'Registrar cashier')}</strong>
                    <span>${escapeHTML(dashboard.settings?.gcashNumber || '')}</span>
                    <span>Amount due: ${escapeHTML(formatCurrency(totalAmount))}</span>
                  </div>
                </div>
              </article>

              <label class="field" data-proof-upload-group style="margin-top:1rem;">
                <span>GCash reference number</span>
                <input name="referenceNumber" type="text" placeholder="Example: GP1234567890"
                  value="${escapeHTML(booking.referenceNumber || '')}" required />
                <p class="field-hint">Enter the exact reference number from your GCash receipt.</p>
              </label>

              <label class="field">
                <span>Upload screenshot proof of payment</span>
                <input name="proofImage" type="file" accept="image/*" required />
                <p class="field-hint">Upload a clear image showing the amount, account, and reference number.</p>
              </label>
              <div id="proof-preview-container"></div>
            ` : `
              <article class="section-card payment-preview-card payment-preview-card--cash" style="margin-top:1rem;">
                <div>
                  <span class="eyebrow">Cash payment</span>
                  <h4>Pay at the cashier window</h4>
                  <p class="section-card__description">Submit the appointment now, then bring ${escapeHTML(formatCurrency(totalAmount))} when you visit.</p>
                </div>
              </article>
            `}

            <div class="inline-actions" style="margin-top:1.5rem;">
              <button class="button button--primary" type="submit">Submit appointment</button>
              <button class="button button--ghost" type="button" data-action="student-booking-prev">Back</button>
            </div>
          </form>
        </div>
      </section>
    `;
  }

  return `
    <section class="floating-form-wrap">
      <div class="floating-form">
        <div class="floating-form__header">
          <div>
            <h3>Book an appointment</h3>
            <p>Fill in your request details and schedule below.</p>
          </div>
          <button class="button button--ghost" type="button" data-action="student-reset-booking">Reset</button>
        </div>

        <form data-form="student-booking-step-1" class="floating-form__body">
          <div class="floating-form__section">
            <div class="field-grid">
              <label class="field">
                <span>Document type</span>
                <select name="documentTypeId" required>
                  ${dashboard.documents.map((item) => `
                    <option value="${item.id}" ${Number(item.id) === Number(booking.documentTypeId) ? 'selected' : ''}>
                      ${escapeHTML(item.name)}
                    </option>
                  `).join('')}
                </select>
              </label>

              <div class="field">
                <span>Number of copies</span>
                <div class="qty-stepper">
                  <button type="button" class="qty-btn" data-action="qty-decrease" aria-label="Decrease">−</button>
                  <input name="copies" type="text" inputmode="numeric" value="${escapeHTML(String(booking.copies))}"
                    data-copies-input style="text-align:center;" />
                  <button type="button" class="qty-btn" data-action="qty-increase" aria-label="Increase">+</button>
                </div>
              </div>
            </div>

            <div class="field-grid">
              <label class="field">
                <span>Processing type</span>
                <select name="isRush">
                  <option value="false" ${!booking.isRush ? 'selected' : ''}>Regular processing</option>
                  <option value="true" ${booking.isRush ? 'selected' : ''}>Rush processing (+${escapeHTML(formatCurrency(document?.rushFee || 0))} per copy)</option>
                </select>
              </label>

              <label class="field">
                <span>Payment method</span>
                <select name="paymentMethod">
                  ${paymentChoices.map((opt) => `
                    <option value="${opt.value}" ${opt.value === booking.paymentMethod ? 'selected' : ''}>${escapeHTML(opt.label)}</option>
                  `).join('')}
                </select>
              </label>
            </div>

            <label class="field">
              <span>Purpose of request</span>
              <textarea name="purpose" placeholder="Example: scholarship renewal, employment requirement, transfer credential">${escapeHTML(booking.purpose)}</textarea>
            </label>

            <label class="field">
              <span>Additional remarks <span class="muted">(optional)</span></span>
              <textarea name="remarks" placeholder="Optional details to help the registrar understand your request">${escapeHTML(booking.remarks || '')}</textarea>
            </label>

            <article class="fee-summary-card">
              <div class="fee-summary-card__row"><span>Base price (×${escapeHTML(String(Math.max(1, Number(booking.copies) || 1)))} ${Math.max(1, Number(booking.copies) || 1) === 1 ? 'copy' : 'copies'})</span><strong>${escapeHTML(formatCurrency((document?.baseFee || 0) * Math.max(1, Number(booking.copies) || 1)))}</strong></div>
              ${booking.isRush ? `<div class="fee-summary-card__row"><span>Rush fee (×${escapeHTML(String(Math.max(1, Number(booking.copies) || 1)))} ${Math.max(1, Number(booking.copies) || 1) === 1 ? 'copy' : 'copies'})</span><strong>${escapeHTML(formatCurrency((document?.rushFee || 0) * Math.max(1, Number(booking.copies) || 1)))}</strong></div>` : ''}
              <div class="fee-summary-card__row fee-summary-card__row--total"><span>Total estimate</span><strong>${escapeHTML(formatCurrency(totalAmount))}</strong></div>
            </article>
          </div>

          <div class="floating-form__divider"></div>

          <div class="floating-form__section">
            <div class="field-grid">
              <label class="field">
                <span>Appointment date</span>
                <input name="appointmentDate" type="date"
                  value="${escapeHTML(booking.appointmentDate || '')}"
                  min="${new Date().toISOString().slice(0, 10)}"
                  autocomplete="off"
                  data-booking-date
                  data-date-picker
                  required
                />
                <small class="field-hint">Use the calendar picker.</small>
              </label>

              <article class="section-card section-card--soft">
                <div class="info-list">
                  <div class="info-list__item"><span>Student</span><strong>${escapeHTML(state.user.fullName)}</strong></div>
                  <div class="info-list__item"><span>Student ID</span><strong>${escapeHTML(state.user.studentId || 'N/A')}</strong></div>
                  <div class="info-list__item"><span>Document</span><strong>${escapeHTML(document?.name || 'N/A')}</strong></div>
                  <div class="info-list__item"><span>Fee estimate</span><strong>${escapeHTML(formatCurrency(totalAmount))}</strong></div>
                </div>
              </article>
            </div>

            ${availabilityLoading
              ? renderEmptyState('Loading time slots', 'Checking availability for the selected date...')
              : !booking.appointmentDate
                ? renderEmptyState('Choose a date first', 'Select a date above to load available time slots.')
                : availability?.blocked
                  ? renderEmptyState('Date is unavailable', availability.reason || 'Please choose a different date.')
                  : availability
                    ? `
                        <div class="slot-grid">
                          ${availability.slots.map((slot) => `
                            <label class="slot-card ${Number(booking.timeSlotId) === Number(slot.id) ? 'is-selected' : ''} ${slot.disabled ? 'is-disabled' : ''}">
                              <input type="radio" name="timeSlotId" value="${slot.id}"
                                ${Number(booking.timeSlotId) === Number(slot.id) ? 'checked' : ''}
                                ${slot.disabled ? 'disabled' : ''}
                              />
                              <div class="slot-card__label">
                                <div class="slot-card__meta">
                                  <strong>${escapeHTML(formatTimeRange(slot.startTime, slot.endTime))}</strong>
                                  ${slot.disabled
                                    ? '<span class="slot-unavail-msg">Fully booked — no slots remaining</span>'
                                    : `<span>${escapeHTML(String(slot.remaining))} slot${slot.remaining === 1 ? '' : 's'} left</span>`
                                  }
                                </div>
                                <span class="slot-card__status">${slot.disabled ? statusBadge('full') : statusBadge('available')}</span>
                              </div>
                            </label>
                          `).join('')}
                        </div>
                      `
                    : renderEmptyState('Slots unavailable', 'Try another date or refresh.')
            }

            ${selectedSlot ? `
              <article class="section-card slot-selection-summary">
                <div>
                  <span class="eyebrow">Selected schedule</span>
                  <h4>${escapeHTML(formatDate(booking.appointmentDate))}</h4>
                  <p class="section-card__description">${escapeHTML(formatTimeRange(selectedSlot.startTime, selectedSlot.endTime))}</p>
                </div>
                ${statusBadge('selected')}
              </article>
            ` : ''}
          </div>

          <div class="inline-actions" style="margin-top:1.5rem;">
            <button class="button button--primary" type="submit">Review &amp; confirm</button>
            <button class="button button--secondary" type="button" data-action="student-reset-booking">Reset form</button>
          </div>
        </form>
      </div>
    </section>
  `;
}

function renderAppointmentsTable(appointments, settings) {
  return renderTable({
    rows: appointments,
    cardTitle: (row) => escapeHTML(row.referenceNo),
    emptyTitle: 'No appointment records',
    emptyMessage: 'Book your first appointment to start tracking your requests.',
    columns: [
      {
        label: 'Reference',
        render: (row) => `<strong>${escapeHTML(row.referenceNo)}</strong>`,
      },
      {
        label: 'Document',
        render: (row) => `<strong>${escapeHTML(row.documentName)}</strong><br><span class="muted">${escapeHTML(row.purpose)}</span>`,
      },
      {
        label: 'Schedule',
        render: (row) => `${escapeHTML(formatDate(row.appointmentDate))}<br><span class="muted">${escapeHTML(formatTimeRange(row.startTime, row.endTime))}</span>`,
      },
      {
        label: 'Status',
        render: (row) => statusBadge(row.status),
      },
      {
        label: 'Amount',
        render: (row) => row.payment
          ? `<strong>${escapeHTML(formatCurrency(row.payment.amount))}</strong><br><span class="muted">${escapeHTML(row.payment.method?.toUpperCase() || 'N/A')}</span>`
          : 'N/A',
      },
      {
        label: 'Actions',
        render: (row) => {
          const actions = [];

          if (row.status === 'completed') {
            actions.push(
              `<button class="button button--secondary button--print" type="button" data-action="student-print-receipt" data-id="${row.id}">🖨 Receipt</button>`
            );
          }

          if (canSubmitPayment(row)) {
            actions.push(
              `<button class="button button--secondary" type="button" data-action="student-open-payment" data-id="${row.id}">${
                row.paymentStatus === 'rejected' ? 'Re-submit payment' : 'Update payment'
              }</button>`
            );
          }

          if (canCancelAppointment(row)) {
            actions.push(
              `<button class="button button--danger" type="button" data-action="student-open-cancel" data-id="${row.id}">Cancel</button>`
            );
          }

          return actions.length
            ? `<div class="inline-actions inline-actions--tight">${actions.join('')}</div>`
            : '<span class="muted">No action</span>';
        },
      },
    ],
  });
}

function renderStudentRequestsSection(state) {
  const filters = state.filters || {};
  const appointments = state.dashboard.appointments.filter((a) =>
    matchesAppointmentSearch(a, state.searchQuery, filters)
  );

  return `
    <section class="section-card">
      <div class="section-card__header">
        <div><h3 class="section-card__title">Full request history</h3></div>
      </div>

      <div class="filter-panel">
        <form data-form="student-filters" class="filter-form">
          <div class="filter-controls">
            <label class="field">
              <span>Status</span>
              <select name="status">
                <option value="">All statuses</option>
                <option value="pending" ${filters.status === 'pending' ? 'selected' : ''}>Pending</option>
                <option value="approved" ${filters.status === 'approved' ? 'selected' : ''}>Approved</option>
                <option value="assigned" ${filters.status === 'assigned' ? 'selected' : ''}>Assigned</option>
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
            <button class="button button--secondary" type="button" data-action="student-reset-filters">Reset</button>
          </div>
        </form>
      </div>

      ${renderAppointmentsTable(appointments, state.dashboard.settings)}
    </section>
  `;
}

function openPaymentModal(helpers, appointment) {
  const settings = helpers.getState().dashboard.settings;
  const paymentChoices = getPaymentChoices(settings);
  const selectedMethod =
    appointment.payment?.method && paymentChoices.some((o) => o.value === appointment.payment.method)
      ? appointment.payment.method
      : paymentChoices[0]?.value || 'gcash';

  helpers.openModal({
    title: `Payment for ${appointment.referenceNo}`,
    description: 'Choose your payment method and follow the instructions to complete payment.',
    content: `
      <form data-form="student-payment-form" class="stack">
        <input type="hidden" name="appointmentId" value="${appointment.id}" />

        <article class="section-card section-card--soft">
          <div class="info-list">
            <div class="info-list__item"><span>Amount due</span><strong>${escapeHTML(formatCurrency(appointment.payment?.amount || 0))}</strong></div>
            <div class="info-list__item"><span>Appointment status</span><strong>${statusBadge(appointment.status)}</strong></div>
          </div>
        </article>

        <label class="field">
          <span>Payment method</span>
          <select name="method" data-payment-method-select>
            ${paymentChoices.map((c) => `
              <option value="${c.value}" ${c.value === selectedMethod ? 'selected' : ''}>${escapeHTML(c.label)}</option>
            `).join('')}
          </select>
        </label>

        <div class="${selectedMethod === 'gcash' ? '' : 'hidden'}" data-qr-section>
          <article class="section-card payment-preview-card">
            <div>
              <span class="eyebrow">GCash</span>
              <h4>Scan to pay</h4>
            </div>
            <div class="payment-preview-card__details">
              <img class="payment-preview-card__qr"
                src="${escapeHTML(resolveMediaUrl(settings?.gcashQrImage) || APP_CONFIG.DEFAULT_QR_ASSET)}"
                alt="GCash QR"
              />
              <div class="payment-preview-card__meta">
                <strong>${escapeHTML(settings?.gcashName || 'N/A')}</strong>
                <span>${escapeHTML(settings?.gcashNumber || 'N/A')}</span>
                <span>Amount: ${escapeHTML(formatCurrency(appointment.payment?.amount || 0))}</span>
              </div>
            </div>
          </article>

          <div class="field" data-proof-upload-group>
            <span>GCash reference number</span>
            <input name="referenceNumber" type="text" placeholder="GP1234567890"
              value="${escapeHTML(appointment.payment?.referenceNumber || '')}" required />
          </div>

          <label class="field">
            <span>Upload payment screenshot</span>
            <input name="proofImage" type="file" accept="image/*" required />
          </label>
          <div id="proof-preview-container"></div>
        </div>

        <div class="${selectedMethod === 'cash' ? '' : 'hidden'}" data-cash-info-group>
          <article class="section-card payment-preview-card payment-preview-card--cash">
            <div>
              <span class="eyebrow">Cash</span>
              <h4>Pay at the cashier window</h4>
              <p class="section-card__description">Bring ${escapeHTML(formatCurrency(appointment.payment?.amount || 0))} when you visit.</p>
            </div>
          </article>
        </div>

        ${appointment.payment?.rejectionReason ? `
          <article class="section-card payment-preview-card payment-preview-card--danger">
            <div>
              <span class="eyebrow">Payment rejected</span>
              <h4>Correction needed</h4>
              <p class="section-card__description">${escapeHTML(appointment.payment.rejectionReason)}</p>
            </div>
          </article>
        ` : ''}

        <div class="inline-actions">
          <button class="button button--primary" type="submit">Submit payment</button>
          <button class="button button--ghost" type="button" data-close-modal>Cancel</button>
        </div>
      </form>
    `,
  });

  toggleStudentPaymentFields(selectedMethod);
}

function openCancelModal(helpers, appointment) {
  helpers.openModal({
    title: `Cancel ${appointment.referenceNo}`,
    description: 'This request will immediately move to cancelled status.',
    content: `
      <form data-form="student-cancel-form" class="stack">
        <input type="hidden" name="appointmentId" value="${appointment.id}" />
        <article class="section-card payment-preview-card payment-preview-card--danger">
          <div>
            <span class="eyebrow">Confirm cancellation</span>
            <h4>${escapeHTML(appointment.documentName)}</h4>
            <p class="section-card__description">This appointment will be marked as cancelled and removed from the active workflow.</p>
          </div>
          <div class="payment-preview-card__meta">
            <strong>${escapeHTML(formatDate(appointment.appointmentDate))}</strong>
            <span>${escapeHTML(formatTimeRange(appointment.startTime, appointment.endTime))}</span>
            <span>${statusBadge(appointment.status)}</span>
          </div>
        </article>
        <div class="inline-actions">
          <button class="button button--danger" type="submit">Yes, cancel appointment</button>
          <button class="button button--ghost" type="button" data-close-modal>Keep appointment</button>
        </div>
      </form>
    `,
  });
}

createPortalApp({
  role: 'student',
  roleLabel: 'Student',
  portalTitle: 'Student Portal',
  heroTitle: 'Student request center',
  heroDescription: 'Book a schedule, upload payment proof, and follow each registrar milestone in real time.',
  mobileNavigation: 'drawer',
  navItems: NAV_ITEMS,
  defaultSection: 'overview',
  initialState: {
    booking: buildDefaultBooking({}, []),
    availability: null,
    availabilityLoading: false,
    filters: { status: '', dateFrom: '', dateTo: '' },
  },
  primaryAction: {
    label: 'Book Appointment',
    icon: 'plus',
    async onClick(helpers) {
      helpers.setState({ activeSection: 'book' });
    },
  },
  async loadData({ api }) {
    return api.get('/student/dashboard');
  },
  afterLoad(helpers, dashboard) {
    const state = helpers.getState();
    if (!dashboard.documents.length) return;

    const hasCurrentDocument = dashboard.documents.some((item) => Number(item.id) === Number(state.booking.documentTypeId));
    if (!hasCurrentDocument || !state.booking.paymentMethod) {
      helpers.setState({
        booking: {
          ...buildDefaultBooking(dashboard.settings, dashboard.documents),
          ...state.booking,
          documentTypeId: hasCurrentDocument ? state.booking.documentTypeId : dashboard.documents[0].id,
          paymentMethod:
            state.booking.paymentMethod ||
            (dashboard.settings?.gcashEnabled ? 'gcash' : dashboard.settings?.cashEnabled ? 'cash' : 'gcash'),
        },
      });
    }
  },
  renderContent(state) {
    if (!state.dashboard) {
      return renderEmptyState('Loading', 'Preparing your student workspace...');
    }

    if (state.activeSection === 'book') {
      return renderStudentBookSection(state);
    }

    if (state.activeSection === 'requests') {
      return renderStudentRequestsSection(state);
    }

    return renderStudentOverview(state);
  },
  async handleAction(action, button, helpers) {
    const state = helpers.getState();
    const appointment = state.dashboard?.appointments.find((item) => Number(item.id) === Number(button.dataset.id));

    if (action === 'student-reset-booking') {
      helpers.setState({
        booking: buildDefaultBooking(state.dashboard.settings, state.dashboard.documents),
        availability: null,
        availabilityLoading: false,
      });
      return;
    }

    if (action === 'student-booking-prev') {
      helpers.setState((current) => ({
        ...current,
        booking: { ...current.booking, step: 1 },
      }));
      return;
    }

    if (action === 'qty-decrease') {
      const input = document.querySelector('[data-copies-input]');
      const current = Math.max(1, Number(input?.value) || 1);
      const next = Math.max(1, current - 1);
      if (input) input.value = next;
      helpers.setState((s) => ({ ...s, booking: { ...s.booking, copies: next } }));
      return;
    }

    if (action === 'qty-increase') {
      const input = document.querySelector('[data-copies-input]');
      const current = Math.min(20, Number(input?.value) || 1);
      const next = Math.min(20, current + 1);
      if (input) input.value = next;
      helpers.setState((s) => ({ ...s, booking: { ...s.booking, copies: next } }));
      return;
    }

    if (action === 'student-open-payment' && appointment) {
      openPaymentModal(helpers, appointment);
      return;
    }

    if (action === 'student-open-cancel' && appointment) {
      openCancelModal(helpers, appointment);
      return;
    }

    if (action === 'student-print-receipt' && appointment) {
      await printReceipt(appointment, state.dashboard.settings);
      return;
    }

    if (action === 'student-reset-filters') {
      helpers.setState((s) => ({ ...s, filters: { status: '', dateFrom: '', dateTo: '' } }));
    }
  },
  async handleInput(target, helpers) {
    const form = target.closest('form[data-form="student-booking-step-1"]');

    if (form && ['documentTypeId', 'isRush', 'paymentMethod'].includes(target.name)) {
      const formData = new FormData(form);
      helpers.setState((current) => ({
        ...current,
        booking: {
          ...current.booking,
          documentTypeId: Number(formData.get('documentTypeId')),
          isRush: formData.get('isRush') === 'true',
          paymentMethod: String(formData.get('paymentMethod') || current.booking.paymentMethod),
        },
      }));
      return;
    }

    if (form && target.name === 'copies') {
      const raw = String(target.value || '');
      const parsed = parseInt(raw, 10);
      if (!isNaN(parsed) && parsed >= 1) {
        helpers.setState((current) => ({
          ...current,
          booking: { ...current.booking, copies: Math.min(20, parsed) },
        }));
      }
      return;
    }

    if (target.closest('form[data-form="student-booking-step-3"]') && target.name === 'referenceNumber') {
      helpers.setState((current) => ({
        ...current,
        booking: { ...current.booking, referenceNumber: String(target.value || '') },
      }));
    }
  },
  async handleChange(target, helpers) {
    if (target.matches('[data-booking-date]')) {
      await loadAvailability(helpers, target.value);
      return;
    }

    if (target.matches('input[name="timeSlotId"]') && target.closest('form[data-form="student-booking-step-1"]')) {
      helpers.setState((current) => ({
        ...current,
        booking: { ...current.booking, timeSlotId: Number(target.value) },
      }));
      return;
    }

    if (target.matches('[data-payment-method-select]')) {
      toggleStudentPaymentFields(target.value);
      return;
    }

    if (
      target.matches('input[name="proofImage"]') &&
      target.closest('form[data-form="student-payment-form"], form[data-form="student-booking-step-3"]')
    ) {
      renderProofPreview(target.files?.[0]);
      return;
    }

    const filtersForm = target.closest('form[data-form="student-filters"]');
    if (filtersForm) {
      const formData = new FormData(filtersForm);
      helpers.setState((s) => ({
        ...s,
        filters: {
          status: formData.get('status') || '',
          dateFrom: formData.get('dateFrom') || '',
          dateTo: formData.get('dateTo') || '',
        },
      }));
    }
  },
  async handleSubmit(formName, form, helpers) {
    const state = helpers.getState();
    const formData = new FormData(form);

    if (formName === 'student-booking-step-1') {
      const appointmentDate = String(formData.get('appointmentDate') || state.booking.appointmentDate || '').trim();
      let availability = state.availability;

      const purpose = String(formData.get('purpose') || '').trim();
      if (!purpose) {
        helpers.showToast('Enter the purpose of your request before continuing.', 'warning');
        return;
      }

      if (!appointmentDate) {
        helpers.showToast('Select an appointment date first.', 'warning');
        return;
      }

      if (!availability || appointmentDate !== state.booking.appointmentDate) {
        availability = await helpers.api.get(`/student/availability?date=${encodeURIComponent(appointmentDate)}`);
        helpers.setState((current) => ({
          ...current,
          availability,
          booking: { ...current.booking, appointmentDate },
        }));
      }

      if (availability.blocked) {
        helpers.showToast(availability.reason || 'Selected date is blocked.', 'warning');
        return;
      }

      const selectedSlotId = Number(state.booking.timeSlotId || formData.get('timeSlotId'));
      const selectedSlot = availability.slots.find((slot) => Number(slot.id) === selectedSlotId && !slot.disabled);

      if (!selectedSlot) {
        helpers.showToast('Choose an available time slot to continue.', 'warning');
        return;
      }

      const copies = Math.max(1, Math.min(20, parseInt(formData.get('copies') || '1', 10) || 1));

      helpers.setState((current) => ({
        ...current,
        booking: {
          ...current.booking,
          step: 2,
          documentTypeId: Number(formData.get('documentTypeId')),
          copies,
          isRush: formData.get('isRush') === 'true',
          purpose,
          remarks: String(formData.get('remarks') || '').trim(),
          paymentMethod: String(formData.get('paymentMethod') || 'gcash'),
          appointmentDate,
          timeSlotId: selectedSlotId,
          referenceNumber: '',
        },
      }));
      return;
    }

    if (formName === 'student-booking-step-3') {
      const payload = new FormData();
      payload.set('documentTypeId', String(state.booking.documentTypeId));
      payload.set('copies', String(state.booking.copies));
      payload.set('isRush', String(state.booking.isRush));
      payload.set('purpose', state.booking.purpose);
      payload.set('remarks', state.booking.remarks || '');
      payload.set('paymentMethod', state.booking.paymentMethod);
      payload.set('appointmentDate', state.booking.appointmentDate);
      payload.set('timeSlotId', String(state.booking.timeSlotId));

      if (state.booking.paymentMethod === 'gcash') {
        const referenceNumber = String(formData.get('referenceNumber') || '').trim();
        const proofImage = formData.get('proofImage');

        if (!referenceNumber) {
          helpers.showToast('Enter the GCash reference number before submitting.', 'warning');
          return;
        }

        if (!(proofImage instanceof File) || !proofImage.name) {
          helpers.showToast('Upload the screenshot proof of payment before submitting.', 'warning');
          return;
        }

        payload.set('referenceNumber', referenceNumber);
        payload.set('proofImage', proofImage);
      }

      await helpers.api.post('/student/appointments', payload);
      helpers.showToast('Appointment created successfully.', 'success');
      helpers.setState({
        booking: buildDefaultBooking(state.dashboard.settings, state.dashboard.documents),
        availability: null,
        availabilityLoading: false,
        activeSection: 'requests',
      });
      await helpers.refresh({ silent: true });
      return;
    }

    if (formName === 'student-payment-form') {
      const appointmentId = formData.get('appointmentId');
      await helpers.api.post(`/student/appointments/${appointmentId}/payment`, formData);
      helpers.closeModal();
      helpers.showToast('Payment update submitted successfully.', 'success');
      await helpers.refresh({ silent: true });
      return;
    }

    if (formName === 'student-cancel-form') {
      const appointmentId = formData.get('appointmentId');
      await helpers.api.patch(`/student/appointments/${appointmentId}/cancel`, {});
      helpers.closeModal();
      helpers.showToast('Appointment cancelled successfully.', 'warning');
      helpers.setState({ activeSection: 'requests' });
      await helpers.refresh({ silent: true });
    }
  },
});

document.addEventListener('keydown', (event) => {
  const target = event.target;
  if (!(target instanceof HTMLElement) || !target.matches('[data-date-picker]')) return;
  if (event.key === 'Tab') return;
  event.preventDefault();
  if (typeof target.showPicker === 'function') target.showPicker();
});
