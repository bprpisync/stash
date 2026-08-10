(function () {
  "use strict";

  var SAD_VERSION = "v1.0.0";
  var API_NAME = "StashAppDrawer";
  var QUEUE_NAME = "__stashAppDrawerQueue";
  var DETECTED_NAME = "__stashAppDrawerDetected";

  // Set this immediately so optional integrations can see that the Drawer script exists
  // even when the public API is still waiting for DOM initialization.
  window[DETECTED_NAME] = true;

  console.log("[Stash App Drawer] " + SAD_VERSION + " loading.");

  var state = {
    apps: new Map(),
    open: false,
    query: "",
    activeCategory: "All",
    initialized: false,
    returnFocusElement: null
  };

  // This is the frozen v1 public registration contract.
  var PUBLIC_CONTRACT_FIELDS = Object.freeze([
    "id",
    "name",
    "description",
    "category",
    "Author",
    "path"
  ]);

  // App categories are fixed and owned by Stash App Drawer, not by individual plugins.
  var APP_CATEGORIES = Object.freeze([
    "Management",
    "Players",
    "Tools",
    "Utility",
    "other"
  ]);

  var CATEGORY_LABELS = Object.freeze({
    Management: "Management",
    Players: "Players",
    Tools: "Tools",
    Utility: "Utility",
    other: "Everything Else"
  });

  var iconSvgs = {
    apps: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/></svg>',
    search: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.6-3.6"/></svg>'
  };

  function normalizeText(value) {
    if (typeof value === "string") {
      return value.trim();
    }
    return "";
  }

  function RegistrationError(code, message) {
    this.name = "RegistrationError";
    this.code = code;
    this.message = message;
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, RegistrationError);
    }
  }

  RegistrationError.prototype = Object.create(Error.prototype);
  RegistrationError.prototype.constructor = RegistrationError;

  function registrationError(code, message) {
    throw new RegistrationError(code, message);
  }

  function stashLogError(message) {
    var text = normalizeText(message);
    if (!text) {
      text = "Unknown Stash App Drawer error.";
    }

    // Always write the original error to the browser developer console.
    console.error("[Stash App Drawer] " + text);

    // Mirror the same error to the normal Stash log through the embedded logger operation.
    // Logging is best-effort and must never break the Drawer itself.
    var query = "mutation {\n" +
      "  runPluginOperation(\n" +
      "    plugin_id: \"stash-app-drawer\"\n" +
      "    args_map: {\n" +
      "      operation: \"log_error\"\n" +
      "      message: " + JSON.stringify(text) + "\n" +
      "    }\n" +
      "  )\n" +
      "}";

    fetch("/graphql", {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query: query })
    })
      .then(function (response) {
        return response.json()
          .catch(function () {
            return null;
          })
          .then(function (payload) {
            var hasPayloadErrors = false;
            if (payload && Array.isArray(payload.errors) && payload.errors.length > 0) {
              hasPayloadErrors = true;
            }

            if (!response.ok || hasPayloadErrors) {
              var detail = response.status + " " + response.statusText;
              if (hasPayloadErrors) {
                detail = payload.errors;
              }
              console.error(
                "[Stash App Drawer] Failed to mirror registration error to the Stash log:",
                detail
              );
            }
          });
      })
      .catch(function (error) {
        console.error(
          "[Stash App Drawer] Failed to mirror registration error to the Stash log:",
          error
        );
      });
  }

  function requireNonEmptyString(input, field, appId) {
    var displayId = appId;
    if (!displayId) {
      displayId = "unknown";
    }

    if (!Object.prototype.hasOwnProperty.call(input, field)) {
      registrationError(
        "MISSING_FIELD",
        "App '" + displayId + "' is missing required field '" + field + "'."
      );
    }

    var value = normalizeText(input[field]);
    if (!value) {
      registrationError(
        "EMPTY_FIELD",
        "App '" + displayId + "' requires non-empty content in '" + field + "'."
      );
    }

    return value;
  }

  function validateContractFields(input, appId) {
    var keys = Object.keys(input);
    var i;

    for (i = 0; i < keys.length; i += 1) {
      if (PUBLIC_CONTRACT_FIELDS.indexOf(keys[i]) === -1) {
        registrationError(
          "UNSUPPORTED_FIELD",
          "App '" + appId + "' contains unsupported field '" + keys[i] + "'. " +
          "The v1 registration contract only allows: " + PUBLIC_CONTRACT_FIELDS.join(", ") + "."
        );
      }
    }
  }

  function normalizeCategory(value, appId) {
    var category = normalizeText(value);
    if (APP_CATEGORIES.indexOf(category) === -1) {
      var shownCategory = category;
      if (!shownCategory) {
        shownCategory = "(empty)";
      }

      registrationError(
        "INVALID_CATEGORY",
        "App '" + appId + "' has invalid category '" + shownCategory + "'. " +
        "Allowed values: " + APP_CATEGORIES.join(", ") + "."
      );
    }
    return category;
  }

  function normalizePath(value, appId) {
    var path = normalizeText(value);

    // Internal destinations must be absolute Stash routes, never relative or protocol-relative.
    if (path.indexOf("/") === 0) {
      if (path.indexOf("//") === 0) {
        registrationError(
          "INVALID_PATH",
          "App '" + appId + "' has invalid path '" + path + "'. " +
          "Internal Stash routes must start with exactly one '/'."
        );
      }
      return path;
    }

    // External destinations must be complete HTTP(S) URLs. No javascript:, data:, file:, etc.
    var url;
    try {
      url = new URL(path);
    } catch (error) {
      registrationError(
        "INVALID_PATH",
        "App '" + appId + "' has invalid path '" + path + "'. " +
        "Use an internal Stash route beginning with '/' or a complete http:// or https:// URL."
      );
    }

    if (url.protocol !== "http:" && url.protocol !== "https:") {
      registrationError(
        "INVALID_PATH",
        "App '" + appId + "' has invalid path protocol '" + url.protocol + "'. " +
        "Only internal Stash routes, http://, and https:// are allowed."
      );
    }

    return url.href;
  }

  function normalizeApp(input) {
    if (!input || typeof input !== "object" || Array.isArray(input)) {
      registrationError("INVALID_OBJECT", "register(app) expects one app object.");
    }

    var id = requireNonEmptyString(input, "id", "unknown");
    if (!/^[a-z0-9][a-z0-9._-]*$/i.test(id)) {
      registrationError(
        "INVALID_ID",
        "Invalid app id '" + id + "'. Use letters, numbers, dots, underscores or hyphens."
      );
    }

    validateContractFields(input, id);

    var name = requireNonEmptyString(input, "name", id);
    var description = requireNonEmptyString(input, "description", id);
    var category = normalizeCategory(requireNonEmptyString(input, "category", id), id);
    var Author = requireNonEmptyString(input, "Author", id);
    var path = normalizePath(requireNonEmptyString(input, "path", id), id);

    return Object.freeze({
      id: id,
      name: name,
      description: description,
      category: category,
      Author: Author,
      path: path
    });
  }

  function register(input) {
    try {
      var app = normalizeApp(input);

      if (state.apps.has(app.id)) {
        registrationError(
          "DUPLICATE_ID",
          "App id '" + app.id + "' is already registered. " +
          "App IDs must be unique; the existing app was kept unchanged."
        );
      }

      state.apps.set(app.id, app);
      renderDrawer();
      window.dispatchEvent(new CustomEvent("stash-app-drawer:registered", { detail: { app: app } }));
      console.log("[Stash App Drawer] Registered: " + app.id);
      return app;
    } catch (error) {
      var code = "REGISTRATION_ERROR";
      var message = String(error);

      if (error instanceof RegistrationError) {
        code = error.code;
      }
      if (error instanceof Error) {
        message = error.message;
      }

      stashLogError("Registration rejected [" + code + "]: " + message);
      return null;
    }
  }

  function unregister(id) {
    var normalizedId = normalizeText(id);
    if (!normalizedId) {
      return false;
    }

    var removed = state.apps.delete(normalizedId);
    if (removed) {
      renderDrawer();
      window.dispatchEvent(
        new CustomEvent("stash-app-drawer:unregistered", { detail: { id: normalizedId } })
      );
    }
    return removed;
  }

  function getApps() {
    return Array.from(state.apps.values()).map(function (app) {
      return {
        id: app.id,
        name: app.name,
        description: app.description,
        category: app.category,
        Author: app.Author,
        path: app.path
      };
    });
  }

  function getIconMarkup(name) {
    var key = String(name || "apps").toLowerCase();
    if (iconSvgs[key]) {
      return iconSvgs[key];
    }
    return iconSvgs.apps;
  }

  function ensureDrawer() {
    var root = document.getElementById("stash-app-drawer-root");
    if (root) {
      return root;
    }

    root = document.createElement("div");
    root.id = "stash-app-drawer-root";
    root.setAttribute("aria-hidden", "true");
    root.innerHTML =
      '<div class="stash-app-drawer-backdrop" data-stash-app-drawer-close></div>' +
      '<section class="stash-app-drawer-drawer" role="dialog" aria-modal="true" ' +
      'aria-labelledby="stash-app-drawer-title" aria-describedby="stash-app-drawer-subtitle" tabindex="-1">' +
        '<header class="stash-app-drawer-header">' +
          '<div class="stash-app-drawer-heading">' +
            '<span class="stash-app-drawer-heading-icon">' + getIconMarkup("apps") + '</span>' +
            '<div>' +
              '<h2 id="stash-app-drawer-title">Apps</h2>' +
              '<p id="stash-app-drawer-subtitle">Open installed plugin apps from one place.</p>' +
            '</div>' +
          '</div>' +
          '<button type="button" class="stash-app-drawer-close" data-stash-app-drawer-close ' +
          'aria-label="Close Apps">×</button>' +
        '</header>' +
        '<div class="stash-app-drawer-toolbar">' +
          '<label class="stash-app-drawer-search-wrap">' +
            '<span class="stash-app-drawer-search-icon">' + getIconMarkup("search") + '</span>' +
            '<input id="stash-app-drawer-search" type="search" autocomplete="off" ' +
            'placeholder="Search apps..." aria-label="Search apps">' +
          '</label>' +
          '<div id="stash-app-drawer-categories" class="stash-app-drawer-categories" ' +
          'aria-label="App categories"></div>' +
        '</div>' +
        '<main id="stash-app-drawer-content" class="stash-app-drawer-content"></main>' +
      '</section>';

    document.body.appendChild(root);

    var closeElements = root.querySelectorAll("[data-stash-app-drawer-close]");
    var i;
    for (i = 0; i < closeElements.length; i += 1) {
      closeElements[i].addEventListener("click", close);
    }

    var searchInput = root.querySelector("#stash-app-drawer-search");
    searchInput.addEventListener("input", function (event) {
      state.query = event.target.value || "";
      renderDrawer();
    });

    return root;
  }

  function isFocusableTarget(element) {
    if (!element) {
      return false;
    }
    if (typeof element.focus !== "function") {
      return false;
    }
    if (!document.documentElement.contains(element)) {
      return false;
    }
    return true;
  }

  function findNavbarEntry() {
    return document.querySelector(".stash-app-drawer-nav-entry");
  }

  function open(triggerElement) {
    var root = ensureDrawer();
    var returnTarget = triggerElement;

    if (!isFocusableTarget(returnTarget)) {
      returnTarget = document.activeElement;
    }
    if (!isFocusableTarget(returnTarget)) {
      returnTarget = findNavbarEntry();
    }

    state.returnFocusElement = returnTarget;
    state.open = true;
    root.classList.add("is-open");
    root.setAttribute("aria-hidden", "false");
    document.documentElement.classList.add("stash-app-drawer-open");
    renderDrawer();

    requestAnimationFrame(function () {
      var searchInput = root.querySelector("#stash-app-drawer-search");
      var drawer = root.querySelector(".stash-app-drawer-drawer");

      if (searchInput) {
        searchInput.focus();
      } else if (drawer) {
        drawer.focus();
      }
    });

    window.dispatchEvent(new CustomEvent("stash-app-drawer:opened"));
  }

  function restoreFocus() {
    var target = state.returnFocusElement;
    state.returnFocusElement = null;

    if (!isFocusableTarget(target)) {
      target = findNavbarEntry();
    }

    if (isFocusableTarget(target)) {
      requestAnimationFrame(function () {
        target.focus();
      });
    }
  }

  function close(shouldRestoreFocus) {
    var restore = shouldRestoreFocus;
    if (typeof restore !== "boolean") {
      restore = true;
    }

    var wasOpen = state.open;
    var root = document.getElementById("stash-app-drawer-root");
    state.open = false;

    if (root) {
      root.classList.remove("is-open");
      root.setAttribute("aria-hidden", "true");
    }

    document.documentElement.classList.remove("stash-app-drawer-open");

    if (restore) {
      restoreFocus();
    } else {
      state.returnFocusElement = null;
    }

    if (wasOpen) {
      window.dispatchEvent(new CustomEvent("stash-app-drawer:closed"));
    }
  }

  function toggle() {
    if (state.open) {
      close();
    } else {
      open();
    }
  }

  function isHttpUrl(path) {
    var lower = String(path).toLowerCase();
    if (lower.indexOf("http://") === 0) {
      return true;
    }
    if (lower.indexOf("https://") === 0) {
      return true;
    }
    return false;
  }

  function navigate(path) {
    if (!path) {
      return;
    }

    if (isHttpUrl(path)) {
      window.location.assign(path);
      return;
    }

    if (path.indexOf("/") !== 0) {
      window.location.assign(path);
      return;
    }

    if (window.location.pathname === path) {
      close(false);
      return;
    }

    // Stash uses client-side routing. pushState + popstate avoids a full page reload.
    window.history.pushState({}, "", path);
    window.dispatchEvent(new PopStateEvent("popstate"));
  }

  function launch(app) {
    try {
      close(false);

      if (isHttpUrl(app.path)) {
        window.location.assign(app.path);
        return;
      }

      navigate(app.path);
    } catch (error) {
      console.error("[Stash App Drawer] Failed to launch '" + app.id + "':", error);
    }
  }

  function matchesSearch(app, query) {
    if (!query) {
      return true;
    }

    var haystack = (
      app.name + " " +
      app.description + " " +
      app.category + " " +
      app.Author + " " +
      app.id
    ).toLowerCase();

    return haystack.indexOf(query.toLowerCase()) !== -1;
  }

  function renderDrawer() {
    var root = document.getElementById("stash-app-drawer-root");
    if (!root) {
      return;
    }

    var categoriesEl = root.querySelector("#stash-app-drawer-categories");
    var contentEl = root.querySelector("#stash-app-drawer-content");
    if (!categoriesEl || !contentEl) {
      return;
    }

    var apps = Array.from(state.apps.values()).sort(function (a, b) {
      return a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
    });

    var usedCategories = new Set();
    apps.forEach(function (app) {
      usedCategories.add(app.category);
    });

    var categories = ["All"];
    APP_CATEGORIES.forEach(function (category) {
      if (usedCategories.has(category)) {
        categories.push(category);
      }
    });

    if (categories.indexOf(state.activeCategory) === -1) {
      state.activeCategory = "All";
    }

    categoriesEl.replaceChildren();
    categories.forEach(function (category) {
      var button = document.createElement("button");
      button.type = "button";
      button.className = "stash-app-drawer-category";
      if (state.activeCategory === category) {
        button.className += " is-active";
      }

      if (category === "All") {
        button.textContent = "All";
      } else {
        button.textContent = CATEGORY_LABELS[category];
      }

      button.addEventListener("click", function () {
        state.activeCategory = category;
        renderDrawer();
      });
      categoriesEl.appendChild(button);
    });

    var filtered = apps.filter(function (app) {
      var categoryMatch = false;
      if (state.activeCategory === "All" || app.category === state.activeCategory) {
        categoryMatch = true;
      }
      return categoryMatch && matchesSearch(app, state.query.trim());
    });

    if (!apps.length) {
      contentEl.innerHTML =
        '<div class="stash-app-drawer-empty">' +
          '<span class="stash-app-drawer-empty-icon">' + getIconMarkup("apps") + '</span>' +
          '<h3>No apps registered yet</h3>' +
          '<p>Install an app that supports Stash App Drawer, or register one through ' +
          '<code>window.StashAppDrawer.register(...)</code>.</p>' +
        '</div>';
      return;
    }

    if (!filtered.length) {
      contentEl.innerHTML =
        '<div class="stash-app-drawer-empty">' +
          '<span class="stash-app-drawer-empty-icon">' + getIconMarkup("search") + '</span>' +
          '<h3>No matching apps</h3>' +
          '<p>Try another search or category.</p>' +
        '</div>';
      return;
    }

    var fragment = document.createDocumentFragment();
    var categoriesToRender = [];

    if (state.activeCategory === "All") {
      APP_CATEGORIES.forEach(function (category) {
        var found = filtered.some(function (app) {
          return app.category === category;
        });
        if (found) {
          categoriesToRender.push(category);
        }
      });
    } else {
      categoriesToRender.push(state.activeCategory);
    }

    categoriesToRender.forEach(function (category) {
      var categoryApps = filtered.filter(function (app) {
        return app.category === category;
      });

      if (!categoryApps.length) {
        return;
      }

      var section = document.createElement("section");
      section.className = "stash-app-drawer-category-section";
      section.dataset.category = category;

      var heading = document.createElement("h3");
      heading.className = "stash-app-drawer-category-heading";
      heading.textContent = CATEGORY_LABELS[category];

      var grid = document.createElement("div");
      grid.className = "stash-app-drawer-grid";

      categoryApps.forEach(function (app) {
        var card = document.createElement("button");
        card.type = "button";
        card.className = "stash-app-drawer-card";
        card.dataset.appId = app.id;
        card.setAttribute("aria-label", "Open " + app.name + " by " + app.Author);

        var body = document.createElement("span");
        body.className = "stash-app-drawer-card-body";

        var title = document.createElement("span");
        title.className = "stash-app-drawer-card-title";
        title.textContent = app.name;

        var description = document.createElement("span");
        description.className = "stash-app-drawer-card-description";
        description.textContent = app.description;

        var author = document.createElement("span");
        author.className = "stash-app-drawer-card-author";
        author.textContent = "By " + app.Author;

        body.appendChild(title);
        body.appendChild(description);
        body.appendChild(author);
        card.appendChild(body);
        card.addEventListener("click", function () {
          launch(app);
        });
        grid.appendChild(card);
      });

      section.appendChild(heading);
      section.appendChild(grid);
      fragment.appendChild(section);
    });

    contentEl.replaceChildren(fragment);
  }

  function getFocusableElements(root) {
    if (!root) {
      return [];
    }

    var selector = [
      'a[href]',
      'button:not([disabled])',
      'input:not([disabled])',
      'select:not([disabled])',
      'textarea:not([disabled])',
      '[tabindex]:not([tabindex="-1"])'
    ].join(",");

    var nodes = root.querySelectorAll(selector);
    return Array.prototype.filter.call(nodes, function (element) {
      if (element.getAttribute("aria-hidden") === "true") {
        return false;
      }
      return true;
    });
  }

  function trapFocus(event) {
    var root = document.getElementById("stash-app-drawer-root");
    if (!root) {
      return;
    }

    var drawer = root.querySelector(".stash-app-drawer-drawer");
    if (!drawer) {
      return;
    }

    var focusable = getFocusableElements(drawer);
    if (!focusable.length) {
      event.preventDefault();
      drawer.focus();
      return;
    }

    var first = focusable[0];
    var last = focusable[focusable.length - 1];
    var active = document.activeElement;

    if (!drawer.contains(active)) {
      event.preventDefault();
      first.focus();
      return;
    }

    if (event.shiftKey && active === first) {
      event.preventDefault();
      last.focus();
      return;
    }

    if (!event.shiftKey && active === last) {
      event.preventDefault();
      first.focus();
    }
  }

  function handleGlobalKeydown(event) {
    if (!state.open) {
      return;
    }

    if (event.key === "Escape") {
      event.preventDefault();
      close();
      return;
    }

    if (event.key === "Tab") {
      trapFocus(event);
    }
  }

  function installNavbarEntry() {
    var api = window.PluginApi;
    if (!api || !api.patch || typeof api.patch.after !== "function" || !api.React) {
      console.warn("[Stash App Drawer] PluginApi is not ready; navbar entry was not installed.");
      return false;
    }

    var React = api.React;

    try {
      api.patch.after("MainNavBar.MenuItems", function () {
        var args = Array.prototype.slice.call(arguments);
        var result = args[args.length - 1];

        try {
          var appsButton = React.createElement(
            "button",
            {
              key: "stash-app-drawer-navbar-entry",
              type: "button",
              className: "nav-link stash-app-drawer-nav-entry",
              onClick: function (event) {
                event.preventDefault();
                event.stopPropagation();
                open(event.currentTarget);
              },
              title: "Apps",
              "aria-label": "Apps"
            },
            React.createElement("span", {
              className: "stash-app-drawer-nav-icon",
              dangerouslySetInnerHTML: { __html: getIconMarkup("apps") }
            }),
            React.createElement("span", { className: "stash-app-drawer-nav-label" }, "Apps")
          );

          return React.createElement(React.Fragment, null, result, appsButton);
        } catch (error) {
          console.error("[Stash App Drawer] Navbar render failed safely:", error);
          return result;
        }
      });

      return true;
    } catch (error) {
      console.error("[Stash App Drawer] Could not patch MainNavBar.MenuItems:", error);
      return false;
    }
  }

  function drainQueue() {
    var queue = [];
    if (Array.isArray(window[QUEUE_NAME])) {
      queue = window[QUEUE_NAME];
    }

    window[QUEUE_NAME] = [];
    queue.forEach(function (entry) {
      register(entry);
    });
  }

  function init() {
    if (state.initialized) {
      return;
    }
    state.initialized = true;

    window[API_NAME] = Object.freeze({
      register: register,
      unregister: unregister,
      getApps: getApps,
      open: open,
      close: close,
      toggle: toggle
    });

    ensureDrawer();
    drainQueue();
    installNavbarEntry();
    document.addEventListener("keydown", handleGlobalKeydown);

    console.log(
      "[Stash App Drawer] " + SAD_VERSION + " ready. Registered apps: " + state.apps.size
    );
    window.dispatchEvent(
      new CustomEvent("stash-app-drawer:ready", { detail: { api: window[API_NAME] } })
    );
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init, { once: true });
  } else {
    init();
  }
}());
