import { APP_CONFIG } from "../config.js";
import { icon } from "../shared/icons.js";
import { escapeHTML } from "../shared/formatters.js";

export function renderSidebar({
  roleLabel,
  navItems,
  activeSection,
  mobileNavigation = "tabs",
  mobileMenuOpen = false,
}) {
  const desktopNav = navItems
    .map(
      (item) => `
        <button class="sidebar__item ${activeSection === item.id ? "is-active" : ""}" data-nav-id="${escapeHTML(item.id)}">
          ${icon(item.icon)}
          <span>${escapeHTML(item.label)}</span>
        </button>
      `,
    )
    .join("");

  const mobileNav = navItems
    .map(
      (item) => `
        <button class="mobile-nav__item ${activeSection === item.id ? "is-active" : ""}" data-nav-id="${escapeHTML(item.id)}">
          ${icon(item.icon)}
          <span>${escapeHTML(item.label)}</span>
        </button>
      `,
    )
    .join("");

  return `
    <aside class="sidebar">
      <div class="sidebar__brand">
        <img src="${import.meta.env.BASE_URL}assets/logo.png" alt="${escapeHTML(APP_CONFIG.APP_NAME)} logo" />
        <div>
          <h2>${escapeHTML(APP_CONFIG.APP_NAME)}</h2>
          <p>${escapeHTML(roleLabel)}</p>
        </div>
      </div>

      <nav class="sidebar__nav">
        ${desktopNav}
      </nav>

      <div class="sidebar__footer">
        <button type="button" data-action="logout">
          ${icon("logout")}
          <span>Sign Out</span>
        </button>
      </div>
    </aside>

    ${
      mobileNavigation === "drawer"
        ? `
            <div class="mobile-drawer-backdrop ${mobileMenuOpen ? "is-open" : ""}" data-action="close-mobile-menu"></div>

            <aside class="mobile-drawer ${mobileMenuOpen ? "is-open" : ""}" aria-hidden="${mobileMenuOpen ? "false" : "true"}">
              <div class="mobile-drawer__header">
                <div class="sidebar__brand mobile-drawer__brand">
                  <img src="${import.meta.env.BASE_URL}assets/logo.png" alt="${escapeHTML(APP_CONFIG.APP_NAME)} logo" />
                  <div>
                    <h2>${escapeHTML(APP_CONFIG.APP_NAME)}</h2>
                    <p>${escapeHTML(roleLabel)}</p>
                  </div>
                </div>

                <button class="mobile-drawer__close" type="button" data-action="close-mobile-menu" aria-label="Close menu">
                  ${icon("x")}
                </button>
              </div>

              <nav class="mobile-drawer__nav">
                ${mobileNav}
              </nav>

              <div class="mobile-drawer__footer">
                <button class="button button--danger button--block" type="button" data-action="logout">
                  ${icon("logout")}
                  <span>Sign Out</span>
                </button>
              </div>
            </aside>
          `
        : `
            <nav class="bottom-nav">
              ${mobileNav}
            </nav>
          `
    }
  `;
}
