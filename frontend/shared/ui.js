import { icon } from './icons.js';
import { escapeHTML } from './formatters.js';

export function renderStatCards(items = []) {
  return `
    <section class="stats-grid">
      ${items
        .map(
          (item) => `
            <article class="stat-card ${item.tone ? `stat-card--${escapeHTML(item.tone)}` : ''}">
              <div class="stat-card__top">
                <div>
                  <div class="stat-card__label">${escapeHTML(item.label)}</div>
                  <div class="stat-card__value">${escapeHTML(item.value)}</div>
                </div>
                ${icon(item.icon || 'dashboard')}
              </div>
              ${item.hint ? `<p class="stat-card__hint">${escapeHTML(item.hint)}</p>` : ''}
            </article>
          `
        )
        .join('')}
    </section>
  `;
}

export function renderEmptyState(title, message) {
  return `
    <div class="empty-state">
      ${icon('alert')}
      <h3>${escapeHTML(title)}</h3>
      <p>${escapeHTML(message)}</p>
    </div>
  `;
}
