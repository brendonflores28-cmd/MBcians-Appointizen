import { APP_CONFIG } from "../config.js";
import { clearSession, getSession } from "./auth.js";

async function request(path, options = {}) {
  const url = `${APP_CONFIG.API_URL}${path.startsWith("/") ? path : `/${path}`}`;
  const session = getSession();
  const isFormData = options.body instanceof FormData;
  const headers = new Headers(options.headers || {});

  if (!isFormData) {
    headers.set("Content-Type", "application/json");
  }

  if (options.auth !== false && session?.token) {
    headers.set("Authorization", `Bearer ${session.token}`);
  }

  let response;

  try {
    response = await fetch(url, {
      method: options.method || "GET",
      headers,
      body: options.body
        ? isFormData
          ? options.body
          : JSON.stringify(options.body)
        : undefined,
    });
  } catch (fetchError) {
    const error = new Error(
      "Unable to reach the backend. Check that the API server is running and that VITE_API_URL or VITE_DEV_PROXY_TARGET is configured correctly.",
    );
    error.cause = fetchError;
    throw error;
  }

  const text = await response.text();
  let payload = {};
  const contentType = response.headers.get("content-type") || "";
  const trimmedText = text.trim();

  // Try to parse response as JSON, but handle non-JSON responses gracefully
  if (text) {
    try {
      payload = JSON.parse(text);
    } catch (parseError) {
      const looksLikeHtml =
        contentType.includes("text/html") ||
        /^<!doctype html/i.test(trimmedText) ||
        /^<html/i.test(trimmedText);

      console.error(
        "Failed to parse response as JSON:",
        text.substring(0, 100),
      );

      payload = {
        message: looksLikeHtml
          ? "The frontend reached a web page instead of the backend API. Check VITE_API_URL, VITE_SOCKET_URL, or the Vite proxy target."
          : response.ok
            ? text
            : text || "Request failed without error details.",
      };
    }
  }

  if (!response.ok) {
    if (response.status === 401) {
      clearSession();
    }

    const error = new Error(payload.message || "Request failed.");
    error.status = response.status;
    error.details = payload.details || null;
    throw error;
  }

  return payload;
}

export const api = {
  get: (path, options) => request(path, { ...options, method: "GET" }),
  post: (path, body, options) =>
    request(path, { ...options, method: "POST", body }),
  put: (path, body, options) =>
    request(path, { ...options, method: "PUT", body }),
  patch: (path, body, options) =>
    request(path, { ...options, method: "PATCH", body }),
  delete: (path, options) => request(path, { ...options, method: "DELETE" }),
};
