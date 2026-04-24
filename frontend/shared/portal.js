import { api } from "./api.js";
import {
  getSession,
  clearSession,
  redirectByRole,
  requireRole,
  syncSessionUser,
} from "./auth.js";
import { createStore } from "./store.js";
import { connectSocket, disconnectSocket } from "./socket.js";
import { renderSidebar } from "../components/sidebar.js";
import { mountModalRoot, openModal, closeModal } from "../components/modal.js";
import { mountToastRoot, showToast } from "../components/toast.js";
import { icon } from "./icons.js";
import { escapeHTML, formatDateTime } from "./formatters.js";

const REFRESH_EVENTS = [
  "appointments:changed",
  "payments:changed",
  "settings:changed",
  "catalog:changed",
  "notifications:new",
];

function getDisplayName(user) {
  const firstName = String(user?.firstname || "").trim();
  if (firstName) {
    return firstName;
  }

  const fullName = String(user?.fullName || "").trim();
  if (fullName) {
    return fullName.split(/\s+/)[0];
  }

  return "User";
}

function getStaffChipRoleLabel(user) {
  const sources = [
    user?.email,
    user?.firstname,
    user?.lastname,
    user?.fullName,
  ]
    .filter(Boolean)
    .map((value) => String(value));

  for (const source of sources) {
    const match = source.match(/staff\s*([0-9]+)/i);
    if (match) {
      return `Staff${match[1]}`;
    }
  }

  return "Staff1";
}

function getUserChipRoleLabel(user, fallbackRoleLabel = "User") {
  switch (user?.role) {
    case "student":
      return "Student";
    case "admin":
      return "Admin";
    case "cashier":
      return "Cashier";
    case "registrar_head":
      return "Head";
    case "registrar_staff":
      return getStaffChipRoleLabel(user);
    default:
      return fallbackRoleLabel;
  }
}

export function createPortalApp(config) {
  const session = requireRole(config.role);
  if (!session) {
    return;
  }

  const root = document.getElementById("app");
  mountModalRoot();
  mountToastRoot();

  const store = createStore({
    user: session.user,
    activeSection: config.defaultSection || config.navItems[0]?.id,
    mobileMenuOpen: false,
    notifications: [],
    notificationsOpen: false,
    searchQuery: "",
    loading: true,
    dashboard: null,
    ...config.initialState,
  });

  const helpers = {
    api,
    showToast,
    openModal,
    closeModal,
    getState: store.getState,
    setState(update) {
      const current = store.getState();
      store.setState(
        typeof update === "function"
          ? update(current)
          : { ...current, ...update },
      );
    },
    async refresh(options = {}) {
      return refresh(options);
    },
    async logout() {
      try {
        await api.post("/logout");
      } catch (error) {
        console.error("Logout error:", error);
      }
      disconnectSocket();
      clearSession();
      window.location.replace("/login.html");
    },
  };

  let refreshPromise = null;

  async function refresh({ silent = false } = {}) {
    if (refreshPromise) {
      return refreshPromise;
    }

    if (!silent) {
      helpers.setState({ loading: true });
    }

    refreshPromise = Promise.all([
      api.get("/me"),
      api.get("/common/notifications"),
      config.loadData(helpers),
    ])
      .then(([mePayload, notificationsPayload, dashboard]) => {
        syncSessionUser(mePayload.user);
        store.setState((current) => ({
          ...current,
          user: mePayload.user,
          notifications: notificationsPayload.notifications || [],
          dashboard,
          loading: false,
        }));

        if (config.afterLoad) {
          config.afterLoad(helpers, dashboard);
        }
      })
      .catch((error) => {
        if (error.status === 401) {
          helpers.logout();
          return;
        }

        showToast(error.message || "Unable to load dashboard data.", "error");
        helpers.setState({ loading: false });
      })
      .finally(() => {
        refreshPromise = null;
      });

    return refreshPromise;
  }

  function renderNotifications(state) {
    if (!state.notificationsOpen) {
      return "";
    }

    return `
      <aside class="notification-panel">
        <div class="notification-panel__header">
          <div>
            <strong>Notifications</strong>
            <div class="muted">${state.notifications.filter((item) => !item.isRead).length} unread</div>
          </div>
          <button class="button button--ghost" type="button" data-action="mark-all-notifications">Mark all read</button>
        </div>

        <div class="notification-list">
          ${
            state.notifications.length
              ? state.notifications
                  .map(
                    (notification) => `
                      <article class="notification-item ${notification.isRead ? "" : "is-unread"}">
                        <h4>${escapeHTML(notification.title)}</h4>
                        <p>${escapeHTML(notification.message)}</p>
                        <div class="inline-actions">
                          <span class="muted">${escapeHTML(formatDateTime(notification.createdAt))}</span>
                          ${
                            notification.isRead
                              ? ""
                              : `<button class="button button--secondary" type="button" data-action="mark-notification-read" data-id="${notification.id}">Mark read</button>`
                          }
                        </div>
                      </article>
                    `,
                  )
                  .join("")
              : '<p class="muted">No notifications yet.</p>'
          }
        </div>
      </aside>
    `;
  }

  function getFocusableFieldSnapshot() {
    const activeElement = document.activeElement;

    if (
      !(
        activeElement instanceof HTMLInputElement ||
        activeElement instanceof HTMLTextAreaElement ||
        activeElement instanceof HTMLSelectElement
      )
    ) {
      return null;
    }

    if (!root.contains(activeElement)) {
      return null;
    }

    let selector = "";

    if (activeElement.matches("[data-search-input]")) {
      selector = "[data-search-input]";
    } else if (activeElement.id) {
      selector = `#${CSS.escape(activeElement.id)}`;
    } else if (activeElement.name) {
      const parentForm = activeElement.closest("form[data-form]");

      selector = parentForm?.dataset.form
        ? `form[data-form="${CSS.escape(parentForm.dataset.form)}"] [name="${CSS.escape(activeElement.name)}"]`
        : `[name="${CSS.escape(activeElement.name)}"]`;
    }

    if (!selector) {
      return null;
    }

    const supportsSelection =
      activeElement instanceof HTMLInputElement ||
      activeElement instanceof HTMLTextAreaElement;

    return {
      selector,
      selectionStart: supportsSelection ? activeElement.selectionStart : null,
      selectionEnd: supportsSelection ? activeElement.selectionEnd : null,
    };
  }

  function restoreFocusableField(snapshot) {
    if (!snapshot) {
      return;
    }

    const nextField = document.querySelector(snapshot.selector);
    if (
      !(
        nextField instanceof HTMLInputElement ||
        nextField instanceof HTMLTextAreaElement ||
        nextField instanceof HTMLSelectElement
      )
    ) {
      return;
    }

    nextField.focus({ preventScroll: true });

    if (
      typeof snapshot.selectionStart === "number" &&
      typeof snapshot.selectionEnd === "number" &&
      (nextField instanceof HTMLInputElement ||
        nextField instanceof HTMLTextAreaElement)
    ) {
      try {
        nextField.setSelectionRange(
          snapshot.selectionStart,
          snapshot.selectionEnd,
        );
      } catch (error) {
        // Some input types, such as number/date, don't support caret restoration.
      }
    }
  }

  function render() {
    const state = store.getState();
    const focusSnapshot = getFocusableFieldSnapshot();
    const displayName = getDisplayName(state.user);
    const chipRoleLabel = getUserChipRoleLabel(state.user, config.roleLabel);
    const usesDrawerNavigation = config.mobileNavigation === "drawer";
    const shellClasses = [
      "portal-shell",
      usesDrawerNavigation ? "portal-shell--drawer-nav" : "",
      state.mobileMenuOpen ? "is-mobile-menu-open" : "",
    ]
      .filter(Boolean)
      .join(" ");

    const unreadCount = state.notifications.filter(
      (item) => !item.isRead,
    ).length;
    const content = state.loading
      ? '<div class="section-card"><p class="muted">Loading your workspace...</p></div>'
      : config.renderContent(state, helpers);

    root.innerHTML = `
      <div class="${shellClasses}">
        ${renderSidebar({
          roleLabel: config.roleLabel,
          navItems: config.navItems,
          activeSection: state.activeSection,
          mobileNavigation: usesDrawerNavigation ? "drawer" : "tabs",
          mobileMenuOpen: state.mobileMenuOpen,
        })}

        <main class="portal-main">
          <header class="topbar">
            <div class="topbar__lead">
              ${
                usesDrawerNavigation
                  ? `
                      <button
                        class="hamburger-button"
                        type="button"
                        data-action="open-mobile-menu"
                        aria-label="Open menu"
                        aria-expanded="${state.mobileMenuOpen ? "true" : "false"}"
                      >
                        ${icon("menu")}
                      </button>
                    `
                  : ""
              }

              <div class="topbar__welcome">
                <span class="eyebrow">${escapeHTML(config.roleLabel)}</span>
                <h1>${escapeHTML(config.portalTitle)}</h1>
                <p>${escapeHTML(config.portalDescription)}</p>
              </div>
            </div>

            <div class="topbar__actions">
              <label class="field search-field">
                ${icon("search")}
                <input data-search-input type="search" placeholder="Search records, status, reference..." value="${escapeHTML(state.searchQuery)}" />
              </label>

              <button class="icon-button" type="button" data-action="toggle-notifications" aria-label="Notifications">
                ${icon("bell")}
                ${unreadCount ? '<span class="notification-dot"></span>' : ""}
              </button>

              <div class="user-chip" aria-label="${escapeHTML(displayName)} ${escapeHTML(chipRoleLabel)}">
                <strong>${escapeHTML(displayName)}</strong>
                <span class="user-chip__role">${escapeHTML(chipRoleLabel)}</span>
              </div>
            </div>
          </header>

          <section class="hero-strip">
            <div class="hero-strip__content">
              <div>
                <span class="eyebrow">Live Workspace</span>
                <h2>${escapeHTML(config.heroTitle || config.portalTitle)}</h2>
                <p>${escapeHTML(config.heroDescription || config.portalDescription)}</p>
              </div>

              ${
                config.primaryAction
                  ? `
                      <div class="hero-strip__actions">
                        <button class="button button--ghost" type="button" data-action="primary-action">
                          ${icon(config.primaryAction.icon || "plus")}
                          <span>${escapeHTML(config.primaryAction.label)}</span>
                        </button>
                      </div>
                    `
                  : ""
              }
            </div>
          </section>

          <section class="portal-content">
            ${content}
          </section>
        </main>
      </div>

      ${renderNotifications(state)}
    `;

    document.body.classList.toggle(
      "has-mobile-menu-open",
      usesDrawerNavigation && state.mobileMenuOpen,
    );
    restoreFocusableField(focusSnapshot);
  }

  document.addEventListener("click", async (event) => {
    const button = event.target.closest("[data-action], [data-nav-id]");
    if (!button) {
      return;
    }

    const navId = button.dataset.navId;
    if (navId) {
      helpers.setState({ activeSection: navId, mobileMenuOpen: false });
      return;
    }

    const action = button.dataset.action;

    if (action === "open-mobile-menu") {
      helpers.setState({ mobileMenuOpen: true });
      return;
    }

    if (action === "close-mobile-menu") {
      helpers.setState({ mobileMenuOpen: false });
      return;
    }

    if (action === "logout") {
      helpers.logout();
      return;
    }

    if (action === "primary-action" && config.primaryAction?.onClick) {
      await config.primaryAction.onClick(helpers);
      return;
    }

    if (action === "toggle-notifications") {
      helpers.setState((current) => ({
        ...current,
        notificationsOpen: !current.notificationsOpen,
      }));
      return;
    }

    if (action === "mark-all-notifications") {
      await api.patch("/common/notifications/read-all", {});
      await refresh({ silent: true });
      return;
    }

    if (action === "mark-notification-read") {
      await api.patch(`/common/notifications/${button.dataset.id}/read`, {});
      await refresh({ silent: true });
      return;
    }

    if (config.handleAction) {
      await config.handleAction(action, button, helpers);
    }
  });

  document.addEventListener("submit", async (event) => {
    const form = event.target.closest("form[data-form]");
    if (!form || !config.handleSubmit) {
      return;
    }

    event.preventDefault();
    await config.handleSubmit(form.dataset.form, form, helpers, event);
  });

  document.addEventListener("input", async (event) => {
    const target = event.target;
    if (target.matches("[data-search-input]")) {
      helpers.setState({ searchQuery: target.value });
      return;
    }

    if (config.handleInput) {
      await config.handleInput(target, helpers);
    }
  });

  document.addEventListener("change", async (event) => {
    if (!config.handleChange) {
      return;
    }

    await config.handleChange(event.target, helpers, event);
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && store.getState().mobileMenuOpen) {
      helpers.setState({ mobileMenuOpen: false });
    }
  });

  window.addEventListener("beforeunload", disconnectSocket, { once: true });

  store.subscribe(render);
  render();

  const socketHandlers = (config.socketEvents || REFRESH_EVENTS).reduce(
    (accumulator, eventName) => {
      accumulator[eventName] = () => refresh({ silent: true });
      return accumulator;
    },
    {},
  );

  connectSocket(session.token, socketHandlers);
  refresh();
}
