//* Stash App Drawer v1 developer integration template.
//* Put this near the end of your plugin UI JavaScript, after your own page/route is registered.
//
//* Behavior:
// 1. If Stash App Drawer is already ready, register there immediately.
// 2. If it may still be loading, wait for its ready event.
// 3. If it is still unavailable after the wait period, install the legacy navbar entry.
//
//! IMPORTANT:
// If your plugin already has an old navbar injection function, paste that existing code into
// installLegacyNavbarEntry().
// This is also a great fallback for when users do not have this plugin installed
//
//* If you need any help with the installation or anything else feel free to contact @bprpisync on the stash forum!


(function () {
  "use strict";

  var DRAWER_WAIT_MS = 2000;
  var integrationFinished = false;
  var fallbackTimerId = null;

  var appRegistration = {
    id: "my-plugin", // Required: permanent unique technical ID. Use letters, numbers, dots, underscores or hyphens.
    name: "My Plugin", // Required: visible app name exactly as users should see it in the drawer.
    description: "A short explanation of what this app does.", // Required: short user-facing explanation of the app.
    category: "Tools", // Required: use exactly Management, Players, Tools, Utility, or other.
    Author: "Your Name", // Required: visible author or maker name shown on the drawer item.
    path: "/plugin/my-plugin" // Required: internal Stash route starting with one slash, or a complete http or https URL.
  };

  function isStashAppDrawerReady() {
    if (!window.StashAppDrawer) {
      return false;
    }
    if (typeof window.StashAppDrawer.register !== "function") {
      return false;
    }
    return true;
  }

  function cleanupDrawerWait() {
    window.removeEventListener("stash-app-drawer:ready", handleDrawerReady);

    if (fallbackTimerId !== null) {
      window.clearTimeout(fallbackTimerId);
      fallbackTimerId = null;
    }
  }

  function registerWithStashAppDrawer() {
    if (!isStashAppDrawerReady()) {
      return false;
    }

    integrationFinished = true;
    cleanupDrawerWait();
    window.StashAppDrawer.register(appRegistration);
    return true;
  }

  function handleDrawerReady() {
    if (integrationFinished) {
      return;
    }
    registerWithStashAppDrawer();
  }

  function installLegacyNavbarEntry() {
    if (integrationFinished) {
      return;
    }

    integrationFinished = true;
    cleanupDrawerWait();

    // Place your plugin's existing navbar injection below. If users do not have Stash App Drawer installed, this will execute:

    // ** LEGACY NAVBAR ENTRY START ** \\



    // ** LEGACY NAVBAR ENTRY END ** \\
  }


  //The code below checks if the drawer is ready and otherwise waits until it is. If DRAWER_WAIT_MS is exceeded the legacy function above will be called.
  if (isStashAppDrawerReady()) {
    registerWithStashAppDrawer();
  } else {
    window.addEventListener("stash-app-drawer:ready", handleDrawerReady, {
      once: true
    });

    fallbackTimerId = window.setTimeout(function () {
      if (integrationFinished) {
        return;
      }

      window.removeEventListener("stash-app-drawer:ready", handleDrawerReady);

      if (isStashAppDrawerReady()) {
        registerWithStashAppDrawer();
      } else {
        installLegacyNavbarEntry();
      }
    }, DRAWER_WAIT_MS);
  }
}());