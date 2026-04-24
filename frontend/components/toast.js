let toastRoot = null;

function ensureRoot() {
  if (!toastRoot) {
    toastRoot = document.createElement('div');
    toastRoot.className = 'toast-root';
    document.body.appendChild(toastRoot);
  }

  return toastRoot;
}

export function showToast(message, type = 'info') {
  const root = ensureRoot();
  const element = document.createElement('div');
  element.className = `toast toast--${type}`;
  element.textContent = message;
  root.appendChild(element);

  window.setTimeout(() => {
    element.remove();
  }, 3600);
}

export function mountToastRoot() {
  ensureRoot();
}
