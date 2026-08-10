(function () {
  "use strict";

  var args = {};
  var operation = "";
  var message = "";

  if (input && input.args) {
    args = input.args;
  }
  if (typeof args.operation === "string") {
    operation = args.operation;
  }
  if (typeof args.message === "string") {
    message = args.message.trim();
  }

  if (operation !== "log_error") {
    log.Error("[Stash App Drawer] Invalid internal logging operation.");
    return { output: false };
  }

  if (!message) {
    log.Error("[Stash App Drawer] Internal logging operation received an empty message.");
    return { output: false };
  }

  log.Error("[Stash App Drawer] " + message);
  return { output: true };
}());
