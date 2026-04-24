import { escapeHTML, labelize } from '../shared/formatters.js';

export function renderTable({ columns, rows, cardTitle, emptyTitle, emptyMessage }) {
  if (!rows.length) {
    return `
      <div class="empty-state">
        <h3>${escapeHTML(emptyTitle || 'Nothing to show yet')}</h3>
        <p>${escapeHTML(emptyMessage || 'Records will appear here once data is available.')}</p>
      </div>
    `;
  }

  return `
    <div class="responsive-table">
      <div class="responsive-table__desktop">
        <table>
          <thead>
            <tr>
              ${columns.map((column) => `<th>${escapeHTML(column.label)}</th>`).join('')}
            </tr>
          </thead>
          <tbody>
            ${rows
              .map(
                (row) => `
                  <tr>
                    ${columns.map((column) => `<td>${column.render(row)}</td>`).join('')}
                  </tr>
                `
              )
              .join('')}
          </tbody>
        </table>
      </div>

      <div class="responsive-table__cards">
        ${rows
          .map(
            (row) => `
              <article class="responsive-table__card">
                <div class="responsive-table__card-header">
                  <h3 class="responsive-table__card-title">${cardTitle ? cardTitle(row) : 'Record'}</h3>
                </div>
                <dl class="responsive-table__rows">
                  ${columns
                    .map(
                      (column) => `
                        <div class="responsive-table__row">
                          <dt>${escapeHTML(column.mobileLabel || column.label)}</dt>
                          <dd>${column.render(row)}</dd>
                        </div>
                      `
                    )
                    .join('')}
                </dl>
              </article>
            `
          )
          .join('')}
      </div>
    </div>
  `;
}
