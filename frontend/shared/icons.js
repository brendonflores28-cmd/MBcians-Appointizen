const icons = {
  dashboard:
    '<path d="M3 13.5h8.5V3H3v10.5Zm0 7.5h8.5v-4.5H3V21Zm11.5 0H22V10.5h-7.5V21Zm0-18v4.5H22V3h-7.5Z"/>',
  calendar:
    '<path d="M7 2v3M17 2v3M3 8h18M5 5h14a2 2 0 0 1 2 2v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2Z"/>',
  file:
    '<path d="M14 2H7a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7l-5-5Zm0 0v5h5M9 13h6M9 17h6M9 9h2"/>',
  settings:
    '<path d="M12 8.5A3.5 3.5 0 1 0 12 15.5A3.5 3.5 0 1 0 12 8.5Zm8.2 4.3l1.7 1-1.7 3-2-.3a7.9 7.9 0 0 1-1.3 1.3l.4 2-3 1.7-1-1.7c-.5.1-1 .2-1.6.2s-1.1-.1-1.6-.2l-1 1.7-3-1.7.4-2a7.9 7.9 0 0 1-1.3-1.3l-2 .4-1.7-3 1.7-1c-.1-.5-.2-1-.2-1.6s.1-1.1.2-1.6l-1.7-1 1.7-3 2 .4a7.9 7.9 0 0 1 1.3-1.3l-.4-2L9 2.5l1 1.7c.5-.1 1-.2 1.6-.2s1.1.1 1.6.2l1-1.7 3 1.7-.4 2a7.9 7.9 0 0 1 1.3 1.3l2-.4 1.7 3-1.7 1c.1.5.2 1 .2 1.6s-.1 1.1-.2 1.6Z"/>',
  users:
    '<path d="M16 21v-2a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4v2M9.5 11A4 4 0 1 0 9.5 3A4 4 0 1 0 9.5 11Zm7 1a3 3 0 1 0 0-6a3 3 0 0 0 0 6Zm2.5 9v-1a3 3 0 0 0-2-2.83"/>',
  wallet:
    '<path d="M3 7.5A2.5 2.5 0 0 1 5.5 5H19a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5.5A2.5 2.5 0 0 1 3 16.5v-9Zm0 0V6a2 2 0 0 1 2-2h13M17 13.5h.01"/>',
  shield:
    '<path d="M12 2l7 3v6c0 5-3.5 9-7 11c-3.5-2-7-6-7-11V5l7-3Z"/>',
  bell:
    '<path d="M15 17h5l-1.4-1.4A2 2 0 0 1 18 14.2V10a6 6 0 1 0-12 0v4.2a2 2 0 0 1-.6 1.4L4 17h5m6 0a3 3 0 1 1-6 0m6 0H9"/>',
  logout:
    '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5l-5-5M21 12H9"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  search: '<path d="m21 21-4.35-4.35M10.5 18a7.5 7.5 0 1 0 0-15a7.5 7.5 0 0 0 0 15Z"/>',
  check: '<path d="M20 6 9 17l-5-5"/>',
  clock: '<path d="M12 7v5l3 3M21 12A9 9 0 1 0 3 12A9 9 0 0 0 21 12Z"/>',
  receipt:
    '<path d="M6 3h12v18l-2.5-1.5L13 21l-2.5-1.5L8 21l-2-1.5V3Zm3 4h6M9 11h6M9 15h4"/>',
  upload: '<path d="M12 16V4M8 8l4-4l4 4M5 20h14"/>',
  menu: '<path d="M4 7h16M4 12h16M4 17h16"/>',
  x: '<path d="m18 6-12 12M6 6l12 12"/>',
  eye: '<path d="M2 12s3.5-6 10-6s10 6 10 6s-3.5 6-10 6S2 12 2 12Zm10 3a3 3 0 1 0 0-6a3 3 0 0 0 0 6Z"/>',
  assign:
    '<path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2M8.5 11A4 4 0 1 0 8.5 3A4 4 0 1 0 8.5 11Zm9.5 1v6m-3-3h6"/>',
  alert: '<path d="M12 9v4m0 4h.01M10.3 3.9 1.8 18.2A1.5 1.5 0 0 0 3.1 20.5h17.8a1.5 1.5 0 0 0 1.3-2.3L13.7 3.9a1.5 1.5 0 0 0-2.6 0Z"/>',
  document:
    '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6Zm0 0v6h6M8 13h8M8 17h5M8 9h3"/>',
};

export function icon(name, extraClass = '') {
  const path = icons[name] || icons.document;
  const className = ['icon', extraClass].filter(Boolean).join(' ');
  return `
    <svg class="${className}" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      ${path}
    </svg>
  `;
}
