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

const BOOKING_STEPS = [
  { step: 1, label: 'Request details', description: 'Choose the document, payment method, and request purpose.' },
  { step: 2, label: 'Schedule', description: 'Pick a date from the calendar and tap an available time slot.' },
  { step: 3, label: 'Payment and review', description: 'Review the booking, scan the QR if needed, and upload proof before sending.' },
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

function matchesAppointmentSearch(appointment, query) {
  if (!query) {
    return true;
  }

  const haystack = [
    appointment.referenceNo,
    appointment.documentName,
    appointment.status,
    appointment.paymentStatus,
    appointment.purpose,
  ]
    .join(' ')
    .toLowerCase();

  return haystack.includes(query.toLowerCase());
}

function calculateDocumentFee(document, booking) {
  if (!document) {
    return 0;
  }

  const copies = Number(booking.copies || 1);
  const rushFee = booking.isRush ? Number(document.rushFee) : 0;
  return Number(document.baseFee) + Number(document.copyFee) * copies + rushFee;
}

function getSelectedSlot(availability, timeSlotId) {
  if (!availability?.slots?.length || !timeSlotId) {
    return null;
  }

  return availability.slots.find((slot) => Number(slot.id) === Number(timeSlotId)) || null;
}

function getUpcomingAppointment(appointments) {
  const today = new Date().toISOString().slice(0, 10);
  return appointments.find(
    (appointment) =>
      appointment.appointmentDate >= today &&
      !['completed', 'rejected', 'cancelled'].includes(appointment.status)
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
      booking: {
        ...helpers.getState().booking,
        appointmentDate: '',
        timeSlotId: '',
      },
    });
    return;
  }

  helpers.setState((current) => ({
    ...current,
    availability: null,
    availabilityLoading: true,
    booking: {
      ...current.booking,
      appointmentDate,
      timeSlotId: '',
    },
  }));

  try {
    const availability = await helpers.api.get(`/student/availability?date=${encodeURIComponent(appointmentDate)}`);
    helpers.setState((current) => ({
      ...current,
      availability,
      availabilityLoading: false,
      booking: {
        ...current.booking,
        appointmentDate,
        timeSlotId: '',
      },
    }));

    if (availability.blocked) {
      helpers.showToast(availability.reason || 'Selected date is blocked.', 'warning');
    }
  } catch (error) {
    helpers.setState((current) => ({
      ...current,
      availability: null,
      availabilityLoading: false,
      booking: {
        ...current.booking,
        appointmentDate,
        timeSlotId: '',
      },
    }));
    helpers.showToast(error.message || 'Unable to load the live time slots for that date.', 'error');
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

  if (proofInput) {
    proofInput.required = isGcash;
  }
}

function renderProofPreview(file) {
  const previewContainer = document.getElementById('proof-preview-container');
  if (!previewContainer) {
    return;
  }

  if (!file || !file.type.startsWith('image/')) {
    previewContainer.innerHTML = '';
    return;
  }

  const reader = new FileReader();
  reader.onload = (event) => {
    previewContainer.innerHTML = `
      <article class="payment-proof-preview">
        <img src="${escapeHTML(event.target?.result || '')}" alt="Payment receipt preview" class="proof-preview-image" />
        <p class="text-caption">Receipt uploaded and ready for submission. Double-check the amount and reference number before sending.</p>
      </article>
    `;
  };
  reader.readAsDataURL(file);
}

function renderStudentOverview(state) {
  const { dashboard, searchQuery } = state;
  const appointments = dashboard.appointments.filter((appointment) => matchesAppointmentSearch(appointment, searchQuery));
  const upcoming = getUpcomingAppointment(appointments);

  return `
    ${renderStatCards([
      {
        label: 'Total appointments',
        value: dashboard.stats.totalAppointments,
        icon: 'dashboard',
        tone: 'forest',
      },
      {
        label: 'Pending',
        value: dashboard.stats.pendingAppointments,
        icon: 'clock',
        tone: 'gold',
      },
      {
        label: 'In progress',
        value: dashboard.stats.inProgressAppointments,
        icon: 'calendar',
        tone: 'sky',
      },
      {
        label: 'Completed',
        value: dashboard.stats.completedAppointments,
        icon: 'check',
        tone: 'success',
      },
      {
        label: 'Cancelled',
        value: dashboard.stats.cancelledAppointments,
        icon: 'alert',
        tone: 'danger',
      },
    ])}

    <section class="panel-grid">
      <article class="spotlight-card">
        <div class="section-card__header">
          <div>
            <h3>Next action for your request</h3>
            <p>View the appointment that currently needs your attention, including its schedule, request status, and payment progress.</p>
          </div>
        </div>

        ${
          upcoming
            ? `
                <div class="info-list">
                  <div class="info-list__item"><span>Reference</span><strong>${escapeHTML(upcoming.referenceNo)}</strong></div>
                  <div class="info-list__item"><span>Document</span><strong>${escapeHTML(upcoming.documentName)}</strong></div>
                  <div class="info-list__item"><span>Schedule</span><strong>${escapeHTML(formatDate(upcoming.appointmentDate))}<br>${escapeHTML(
                    formatTimeRange(upcoming.startTime, upcoming.endTime)
                  )}</strong></div>
                  <div class="info-list__item"><span>Status</span><strong>${statusBadge(upcoming.status)}</strong></div>
                  <div class="info-list__item"><span>Payment</span><strong>${statusBadge(upcoming.paymentStatus)}</strong></div>
                </div>
              `
            : renderEmptyState('No active appointment yet', 'Once you submit a request, the next required action will appear here.')
        }
      </article>

      <article class="section-card section-card--soft">
        <div class="section-card__header">
          <div>
            <h3 class="section-card__title">Office details</h3>
          </div>
        </div>

        <div class="info-list">
          <div class="info-list__item"><span>Office</span><strong>${escapeHTML(dashboard.settings?.orgName || 'Registrar Office')}</strong></div>
          <div class="info-list__item"><span>Contact</span><strong>${escapeHTML(dashboard.settings?.orgEmail || 'N/A')}</strong></div>
          <div class="info-list__item"><span>Phone</span><strong>${escapeHTML(dashboard.settings?.orgPhone || 'N/A')}</strong></div>
          <div class="info-list__item"><span>Hours</span><strong>${escapeHTML(dashboard.settings?.officeHours || 'N/A')}</strong></div>
        </div>
      </article>
    </section>

    <section class="section-card">
      <div class="section-card__header">
        <div>
          <h3 class="section-card__title">Recent requests</h3>
        </div>
      </div>
      ${renderAppointmentsTable(appointments.slice(0, 5))}
    </section>
  `;
}

function renderStudentBookSection(state) {
  const { dashboard, booking, availability, availabilityLoading } = state;
  const document = dashboard.documents.find((item) => Number(item.id) === Number(booking.documentTypeId));
  const totalAmount = calculateDocumentFee(document, booking);
  const paymentChoices = getPaymentChoices(dashboard.settings);
  const selectedSlot = getSelectedSlot(availability, booking.timeSlotId);

  return `
    <section class="section-card stack">
      <div class="section-card__header">
        <div>
          <h3 class="section-card__title">Book an appointment</h3>
        </div>
      </div>

      <div class="wizard-steps wizard-steps--three">
        ${BOOKING_STEPS
          .map(
            (step) => `
              <div class="wizard-step ${booking.step === step.step ? 'is-active' : ''}">
                <strong>${step.step}. ${escapeHTML(step.label)}</strong>
                <span>${escapeHTML(step.description)}</span>
              </div>
            `
          )
          .join('')}
      </div>

      ${
        booking.step === 1
          ? `
              <form data-form="student-booking-step-1" class="wizard">
                <div class="field-grid">
                  <label class="field">
                    <span>Document type</span>
                    <select name="documentTypeId" required>
                      ${dashboard.documents
                        .map(
                          (item) => `
                            <option value="${item.id}" ${Number(item.id) === Number(booking.documentTypeId) ? 'selected' : ''}>
                              ${escapeHTML(item.name)} | ${escapeHTML(formatCurrency(item.baseFee))}
                            </option>
                          `
                        )
                        .join('')}
                    </select>
                  </label>

                  <label class="field">
                    <span>Number of copies</span>
                    <input name="copies" type="number" min="1" max="20" value="${escapeHTML(booking.copies)}" />
                  </label>
                </div>

                <div class="field-grid">
                  <label class="field">
                    <span>Payment method</span>
                    <select name="paymentMethod">
                      ${paymentChoices
                        .map(
                          (option) => `
                            <option value="${option.value}" ${option.value === booking.paymentMethod ? 'selected' : ''}>
                              ${escapeHTML(option.label)}
                            </option>
                          `
                        )
                        .join('')}
                    </select>
                  </label>

                  <label class="field">
                    <span>Rush processing</span>
                    <select name="isRush">
                      <option value="false" ${!booking.isRush ? 'selected' : ''}>Regular processing</option>
                      <option value="true" ${booking.isRush ? 'selected' : ''}>Rush processing</option>
                    </select>
                  </label>
                </div>

                <label class="field">
                  <span>Purpose of request</span>
                  <textarea name="purpose" placeholder="Example: scholarship renewal, employment requirement, transfer credential">${escapeHTML(
                    booking.purpose
                  )}</textarea>
                </label>

                <label class="field">
                  <span>Additional remarks</span>
                  <textarea name="remarks" placeholder="Optional details to help the registrar understand your request">${escapeHTML(
                    booking.remarks || ''
                  )}</textarea>
                </label>

                <div class="booking-summary-grid">
                  <article class="section-card section-card--soft booking-summary-card">
                    <div class="info-list">
                      <div class="info-list__item"><span>Base fee</span><strong>${escapeHTML(formatCurrency(document?.baseFee || 0))}</strong></div>
                      <div class="info-list__item"><span>Copy fee</span><strong>${escapeHTML(
                        formatCurrency((document?.copyFee || 0) * Number(booking.copies || 1))
                      )}</strong></div>
                      <div class="info-list__item"><span>Rush fee</span><strong>${escapeHTML(
                        formatCurrency(booking.isRush ? document?.rushFee || 0 : 0)
                      )}</strong></div>
                      <div class="info-list__item"><span>Total estimate</span><strong>${escapeHTML(formatCurrency(totalAmount))}</strong></div>
                    </div>
                  </article>
                </div>

                <div class="inline-actions">
                  <button class="button button--primary" type="submit">Continue to schedule</button>
                  <button class="button button--secondary" type="button" data-action="student-reset-booking">Reset form</button>
                </div>
              </form>
            `
          : ''
      }

      ${
        booking.step === 2
          ? `
              <form data-form="student-booking-step-2" class="wizard">
                <div class="field-grid">
                  <label class="field">
                    <span>Appointment date</span>
                    <input
                      name="appointmentDate"
                      type="date"
                      value="${escapeHTML(booking.appointmentDate || '')}"
                      min="${new Date().toISOString().slice(0, 10)}"
                      autocomplete="off"
                      data-booking-date
                      data-date-picker
                      required
                    />
                    <small class="field-hint">Use the calendar picker. Typing is disabled to avoid invalid dates.</small>
                  </label>

                  <article class="section-card section-card--soft">
                    <div class="info-list">
                      <div class="info-list__item"><span>Student</span><strong>${escapeHTML(state.user.fullName)}</strong></div>
                      <div class="info-list__item"><span>Student ID</span><strong>${escapeHTML(state.user.studentId || 'N/A')}</strong></div>
                      <div class="info-list__item"><span>Document</span><strong>${escapeHTML(document?.name || 'N/A')}</strong></div>
                      <div class="info-list__item"><span>Estimated fee</span><strong>${escapeHTML(formatCurrency(totalAmount))}</strong></div>
                    </div>
                  </article>
                </div>

                ${
                  availabilityLoading
                    ? renderEmptyState('Loading live time slots', 'Checking the remaining capacity for the selected date...')
                    : !booking.appointmentDate
                      ? renderEmptyState('Choose a date first', 'Tap the calendar field above to load the live time-slot options.')
                      : availability?.blocked
                        ? renderEmptyState('Selected date is blocked', availability.reason || 'Please choose a different date.')
                        : availability
                          ? `
                              <div class="slot-grid">
                                ${availability.slots
                                  .map(
                                    (slot) => `
                                      <label
                                        class="slot-card ${Number(booking.timeSlotId) === Number(slot.id) ? 'is-selected' : ''} ${
                                          slot.disabled ? 'is-disabled' : ''
                                        }"
                                      >
                                        <input
                                          type="radio"
                                          name="timeSlotId"
                                          value="${slot.id}"
                                          ${Number(booking.timeSlotId) === Number(slot.id) ? 'checked' : ''}
                                          ${slot.disabled ? 'disabled' : ''}
                                        />
                                        <div class="slot-card__label">
                                          <div class="slot-card__meta">
                                            <strong>${escapeHTML(formatTimeRange(slot.startTime, slot.endTime))}</strong>
                                            <span>${escapeHTML(slot.remaining)} slots left</span>
                                          </div>
                                          <span class="slot-card__status">${slot.disabled ? statusBadge('full') : statusBadge('available')}</span>
                                        </div>
                                      </label>
                                    `
                                  )
                                  .join('')}
                              </div>
                            `
                          : renderEmptyState('Live slots unavailable', 'Choose another date or try again in a moment.')
                }

                ${
                  selectedSlot
                    ? `
                        <article class="section-card slot-selection-summary">
                          <div>
                            <span class="eyebrow">Selected schedule</span>
                            <h4>${escapeHTML(formatDate(booking.appointmentDate))}</h4>
                            <p class="section-card__description">${escapeHTML(
                              formatTimeRange(selectedSlot.startTime, selectedSlot.endTime)
                            )}</p>
                          </div>
                          ${statusBadge('selected')}
                        </article>
                      `
                    : ''
                }

                <div class="inline-actions">
                  <button class="button button--secondary" type="button" data-action="student-booking-prev">Back</button>
                  <button class="button button--primary" type="submit">Continue to review</button>
                </div>
              </form>
            `
          : ''
      }

      ${
        booking.step === 3
          ? `
              <form data-form="student-booking-step-3" class="wizard">
                <div class="review-list">
                  <div class="review-list__item"><span>Student</span><strong>${escapeHTML(state.user.fullName)}<br>${escapeHTML(
                    state.user.studentId || 'N/A'
                  )}</strong></div>
                  <div class="review-list__item"><span>Document</span><strong>${escapeHTML(document?.name || 'N/A')}</strong></div>
                  <div class="review-list__item"><span>Purpose</span><strong>${escapeHTML(booking.purpose)}</strong></div>
                  <div class="review-list__item"><span>Copies</span><strong>${escapeHTML(booking.copies)}</strong></div>
                  <div class="review-list__item"><span>Schedule</span><strong>${escapeHTML(formatDate(booking.appointmentDate))}<br>${escapeHTML(
                    formatTimeRange(selectedSlot?.startTime, selectedSlot?.endTime)
                  )}</strong></div>
                  <div class="review-list__item"><span>Payment method</span><strong>${escapeHTML(
                    booking.paymentMethod === 'gcash' ? 'GCash' : 'Cash'
                  )}</strong></div>
                  <div class="review-list__item"><span>Total amount</span><strong>${escapeHTML(formatCurrency(totalAmount))}</strong></div>
                  ${
                    booking.remarks
                      ? `<div class="review-list__item"><span>Remarks</span><strong>${escapeHTML(booking.remarks)}</strong></div>`
                      : ''
                  }
                </div>

                ${
                  booking.paymentMethod === 'gcash'
                    ? `
                        <article class="section-card payment-preview-card">
                          <div>
                            <span class="eyebrow">GCash payment</span>
                            <h4>Scan, pay, then upload your proof</h4>
                            <p class="section-card__description">Complete the payment now, enter the GCash reference number, and upload the screenshot before submitting the appointment.</p>
                          </div>
                          <div class="payment-preview-card__details">
                            <img
                              class="payment-preview-card__qr"
                              src="${escapeHTML(resolveMediaUrl(dashboard.settings?.gcashQrImage) || APP_CONFIG.DEFAULT_QR_ASSET)}"
                              alt="GCash QR for ${escapeHTML(dashboard.settings?.gcashName || 'merchant')}"
                            />
                            <div class="payment-preview-card__meta">
                              <strong>${escapeHTML(dashboard.settings?.gcashName || 'Registrar cashier')}</strong>
                              <span>${escapeHTML(dashboard.settings?.gcashNumber || 'GCash details will appear here')}</span>
                              <span>Amount due: ${escapeHTML(formatCurrency(totalAmount))}</span>
                            </div>
                          </div>
                        </article>

                        <label class="field" data-proof-upload-group>
                          <span>GCash reference number</span>
                          <input
                            name="referenceNumber"
                            type="text"
                            placeholder="Example: GP1234567890"
                            value="${escapeHTML(booking.referenceNumber || '')}"
                            required
                          />
                          <p class="field-hint">Enter the exact reference number from your payment receipt.</p>
                        </label>

                        <label class="field">
                          <span>Upload screenshot proof of payment</span>
                          <input name="proofImage" type="file" accept="image/*" required />
                          <p class="field-hint">Upload a clear image that shows the amount paid, account, and reference number.</p>
                        </label>

                        <div id="proof-preview-container"></div>
                      `
                    : `
                        <article class="section-card payment-preview-card payment-preview-card--cash">
                          <div>
                            <span class="eyebrow">Cash payment</span>
                            <h4>Pay at the cashier window</h4>
                            <p class="section-card__description">Submit the appointment now, then bring ${escapeHTML(
                              formatCurrency(totalAmount)
                            )} when you visit.</p>
                          </div>
                        </article>
                      `
                }

                <div class="inline-actions">
                  <button class="button button--secondary" type="button" data-action="student-booking-prev">Back</button>
                  <button class="button button--primary" type="submit">Submit appointment</button>
                </div>
              </form>
            `
          : ''
      }
    </section>
  `;
}

function renderAppointmentsTable(appointments) {
  return renderTable({
    rows: appointments,
    cardTitle: (row) => escapeHTML(row.referenceNo),
    emptyTitle: 'No appointment records',
    emptyMessage: 'Book your first appointment to start tracking your requests in real time.',
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
        render: (row) => `${escapeHTML(formatDate(row.appointmentDate))}<br><span class="muted">${escapeHTML(
          formatTimeRange(row.startTime, row.endTime)
        )}</span>`,
      },
      {
        label: 'Status',
        render: (row) => `${statusBadge(row.status)}<br><span class="muted">${statusBadge(row.paymentStatus)}</span>`,
      },
      {
        label: 'Payment',
        render: (row) =>
          row.payment
            ? `<strong>${escapeHTML(formatCurrency(row.payment.amount))}</strong><br><span class="muted">${escapeHTML(
                row.payment.method?.toUpperCase() || 'N/A'
              )}</span>`
            : 'N/A',
      },
      {
        label: 'Actions',
        render: (row) => {
          const actions = [];

          if (canSubmitPayment(row)) {
            actions.push(
              `<button class="button button--secondary" type="button" data-action="student-open-payment" data-id="${row.id}">${
                row.paymentStatus === 'rejected' ? 'Re-submit payment' : 'Update payment'
              }</button>`
            );
          }

          if (canCancelAppointment(row)) {
            actions.push(
              `<button class="button button--danger" type="button" data-action="student-open-cancel" data-id="${row.id}">Cancel appointment</button>`
            );
          }

          return actions.length ? `<div class="inline-actions inline-actions--tight">${actions.join('')}</div>` : '<span class="muted">No action</span>';
        },
      },
    ],
  });
}

function renderStudentRequestsSection(state) {
  const appointments = state.dashboard.appointments.filter((appointment) => matchesAppointmentSearch(appointment, state.searchQuery));

  return `
    <section class="section-card">
      <div class="section-card__header">
        <div>
          <h3 class="section-card__title">Full request history</h3>
        </div>
      </div>
      ${renderAppointmentsTable(appointments)}
    </section>
  `;
}

function openPaymentModal(helpers, appointment) {
  const settings = helpers.getState().dashboard.settings;
  const paymentChoices = getPaymentChoices(settings);
  const selectedMethod =
    appointment.payment?.method && paymentChoices.some((option) => option.value === appointment.payment.method)
      ? appointment.payment.method
      : paymentChoices[0]?.value || 'gcash';

  helpers.openModal({
    title: `Payment for ${appointment.referenceNo}`,
    description: 'Choose your payment method and follow the instructions to complete payment verification.',
    content: `
      <form data-form="student-payment-form" class="stack">
        <input type="hidden" name="appointmentId" value="${appointment.id}" />

        <article class="section-card section-card--soft">
          <div class="info-list">
            <div class="info-list__item"><span>Amount due</span><strong>${escapeHTML(
              formatCurrency(appointment.payment?.amount || 0)
            )}</strong></div>
            <div class="info-list__item"><span>Appointment status</span><strong>${statusBadge(appointment.status)}</strong></div>
            <div class="info-list__item"><span>Payment status</span><strong>${statusBadge(
              appointment.paymentStatus
            )}</strong></div>
          </div>
        </article>

        <label class="field">
          <span>Payment method</span>
          <select name="method" data-payment-method-select>
            ${paymentChoices
              .map(
                (choice) => `
                  <option value="${choice.value}" ${choice.value === selectedMethod ? 'selected' : ''}>${escapeHTML(choice.label)}</option>
                `
              )
              .join('')}
          </select>
        </label>

        <div class="${selectedMethod === 'gcash' ? '' : 'hidden'}" data-qr-section>
          <article class="section-card payment-preview-card">
            <div>
              <span class="eyebrow">GCash</span>
              <h4>Scan to pay</h4>
              <p class="section-card__description">Use the QR code below or the account details beside it, then submit the receipt screenshot here.</p>
            </div>

            <div class="payment-preview-card__details">
              <img
                class="payment-preview-card__qr"
                src="${escapeHTML(resolveMediaUrl(settings?.gcashQrImage) || APP_CONFIG.DEFAULT_QR_ASSET)}"
                alt="GCash QR code for ${escapeHTML(settings?.gcashName || 'merchant')}"
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
            <input
              name="referenceNumber"
              type="text"
              placeholder="Example: GP1234567890"
              value="${escapeHTML(appointment.payment?.referenceNumber || '')}"
              required
            />
            <p class="field-hint">Enter the reference number shown on your GCash receipt.</p>
          </div>

          <label class="field">
            <span>Upload payment screenshot</span>
            <input name="proofImage" type="file" accept="image/*" required />
            <p class="field-hint">Upload a clear screenshot showing the amount and reference number.</p>
          </label>

          <div id="proof-preview-container"></div>
        </div>

        <div class="${selectedMethod === 'cash' ? '' : 'hidden'}" data-cash-info-group>
          <article class="section-card payment-preview-card payment-preview-card--cash">
            <div>
              <span class="eyebrow">Cash</span>
              <h4>Pay at the cashier window</h4>
              <p class="section-card__description">Bring ${escapeHTML(
                formatCurrency(appointment.payment?.amount || 0)
              )} when you visit. The cashier or registrar staff will confirm the payment for you.</p>
            </div>
          </article>
        </div>

        ${
          appointment.payment?.rejectionReason
            ? `
                <article class="section-card payment-preview-card payment-preview-card--danger">
                  <div>
                    <span class="eyebrow">Payment rejected</span>
                    <h4>Correction needed</h4>
                    <p class="section-card__description">${escapeHTML(appointment.payment.rejectionReason)}</p>
                  </div>
                </article>
              `
            : ''
        }

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
    description: 'This request will immediately move to cancelled status across all affected dashboards.',
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
    if (!dashboard.documents.length) {
      return;
    }

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
        booking: {
          ...current.booking,
          step: Math.max(current.booking.step - 1, 1),
        },
      }));
      return;
    }

    if (action === 'student-open-payment' && appointment) {
      openPaymentModal(helpers, appointment);
      return;
    }

    if (action === 'student-open-cancel' && appointment) {
      openCancelModal(helpers, appointment);
    }
  },
  async handleInput(target, helpers) {
    const form = target.closest('form[data-form="student-booking-step-1"]');

    if (form && ['documentTypeId', 'copies', 'isRush', 'paymentMethod'].includes(target.name)) {
      const formData = new FormData(form);
      helpers.setState((current) => ({
        ...current,
        booking: {
          ...current.booking,
          documentTypeId: Number(formData.get('documentTypeId')),
          copies: Number(formData.get('copies') || 1),
          isRush: formData.get('isRush') === 'true',
          paymentMethod: String(formData.get('paymentMethod') || current.booking.paymentMethod),
        },
      }));
      return;
    }

    if (target.closest('form[data-form="student-booking-step-3"]') && target.name === 'referenceNumber') {
      helpers.setState((current) => ({
        ...current,
        booking: {
          ...current.booking,
          referenceNumber: String(target.value || ''),
        },
      }));
    }
  },
  async handleChange(target, helpers) {
    if (target.matches('[data-booking-date]')) {
      await loadAvailability(helpers, target.value);
      return;
    }

    if (target.matches('input[name="timeSlotId"]') && target.closest('form[data-form="student-booking-step-2"]')) {
      helpers.setState((current) => ({
        ...current,
        booking: {
          ...current.booking,
          timeSlotId: Number(target.value),
        },
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
    }
  },
  async handleSubmit(formName, form, helpers) {
    const state = helpers.getState();
    const formData = new FormData(form);

    if (formName === 'student-booking-step-1') {
      const nextBooking = {
        ...state.booking,
        step: 2,
        documentTypeId: Number(formData.get('documentTypeId')),
        copies: Number(formData.get('copies') || 1),
        isRush: formData.get('isRush') === 'true',
        purpose: String(formData.get('purpose') || '').trim(),
        remarks: String(formData.get('remarks') || '').trim(),
        paymentMethod: String(formData.get('paymentMethod') || 'gcash'),
        referenceNumber: '',
      };

      if (!nextBooking.purpose) {
        helpers.showToast('Enter the purpose of your request before continuing.', 'warning');
        return;
      }

      helpers.setState({
        booking: nextBooking,
      });
      return;
    }

    if (formName === 'student-booking-step-2') {
      const appointmentDate = String(formData.get('appointmentDate') || state.booking.appointmentDate || '').trim();
      let availability = state.availability;

      if (!appointmentDate) {
        helpers.showToast('Select an appointment date first.', 'warning');
        return;
      }

      if (!availability || appointmentDate !== state.booking.appointmentDate) {
        availability = await helpers.api.get(`/student/availability?date=${encodeURIComponent(appointmentDate)}`);
        helpers.setState((current) => ({
          ...current,
          availability,
          booking: {
            ...current.booking,
            appointmentDate,
          },
        }));
      }

      if (availability.blocked) {
        helpers.showToast(availability.reason || 'Selected date is blocked.', 'warning');
        return;
      }

      const selectedSlotId = Number(state.booking.timeSlotId || formData.get('timeSlotId'));
      const selectedSlot = availability.slots.find(
        (slot) => Number(slot.id) === Number(selectedSlotId) && !slot.disabled
      );

      if (!selectedSlot) {
        helpers.showToast('Choose an available time slot to continue.', 'warning');
        return;
      }

      helpers.setState((current) => ({
        ...current,
        booking: {
          ...current.booking,
          step: 3,
          appointmentDate,
          timeSlotId: selectedSlotId,
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

  if (!(target instanceof HTMLElement) || !target.matches('[data-date-picker]')) {
    return;
  }

  if (event.key === 'Tab') {
    return;
  }

  event.preventDefault();

  if (typeof target.showPicker === 'function') {
    target.showPicker();
  }
});
