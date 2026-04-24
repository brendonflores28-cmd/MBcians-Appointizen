import { escapeHTML } from '../shared/formatters.js';

let modalRoot = null;

function ensureRoot() {
  if (!modalRoot) {
    modalRoot = document.createElement('div');
    modalRoot.className = 'modal-root';
    modalRoot.id = 'modal-root';
    document.body.appendChild(modalRoot);

    modalRoot.addEventListener('click', (event) => {
      if (event.target === modalRoot || event.target.closest('[data-close-modal]')) {
        closeModal();
      }
    });
  }

  return modalRoot;
}

export function openModal({ title, description = '', content = '' }) {
  const root = ensureRoot();
  root.innerHTML = `
    <div class="modal-sheet" role="dialog" aria-modal="true" aria-label="${escapeHTML(title)}">
      <div class="modal-sheet__header">
        <div>
          <h3>${escapeHTML(title)}</h3>
          ${description ? `<p>${escapeHTML(description)}</p>` : ''}
        </div>
        <button class="icon-button" type="button" data-close-modal aria-label="Close modal">&times;</button>
      </div>
      <div class="modal-sheet__body">${content}</div>
    </div>
  `;
  root.classList.add('is-open');
  document.body.style.overflow = 'hidden';
}

export function closeModal() {
  if (!modalRoot) {
    return;
  }

  modalRoot.classList.remove('is-open');
  modalRoot.innerHTML = '';
  document.body.style.overflow = '';
}

export function mountModalRoot() {
  ensureRoot();
}
