const isUndefined = e => typeof e === "undefined";

const enableDrag = function () {
  // make vuetify dialogs movable
  const d = {};
  document.addEventListener("mousedown", e => {
    const closestDialog = e.target.closest(
      ".v-dialog.v-dialog--active, .v-application.application-float"
    );
    if (
      (e.button === 0 &&
        closestDialog &&
        (e.target.classList.contains("v-system-bar") ||
          e.target.classList.contains("teneo-systembar-spacer")) &&
        !e.target.classList.contains("leopard-system-bar")) ||
      e.target.classList.contains("v-toolbar__content")
    ) {
      // element which can be used to move element
      d.el = closestDialog; // element which should be moved
      d.what = e.target.classList.contains("v-toolbar__content") ? "chat-window" : "dialog";
      d.mouseStartX = e.clientX;
      d.mouseStartY = e.clientY;
      d.elStartX = d.el.getBoundingClientRect().left;
      d.elStartY = d.el.getBoundingClientRect().top;
      if (d.what === "dialog") {
        d.el.style.left =
          Math.min(
            Math.max(d.elStartX + e.clientX - d.mouseStartX, 0),
            window.innerWidth - d.el.getBoundingClientRect().width
          ) + "px";

        d.el.style.top =
          Math.min(
            Math.max(d.elStartY + e.clientY - d.mouseStartY, 0),
            window.innerHeight - d.el.getBoundingClientRect().height
          ) + "px";
        d.el.style.margin = 0;
      }
      d.el.style.position = "fixed";
      d.oldTransition = d.el.style.transition;
      d.el.style.transition = "none";
    }
  });
  document.addEventListener("mousemove", e => {
    if (!d.el) return;
    if (d.what === "chat-window") {
      const teneo = document.querySelector("#teneo");
      if (!teneo) return;
      d.el.style.left =
        Math.min(
          Math.max(d.elStartX + e.clientX - d.mouseStartX, 0),
          window.innerWidth - teneo.getBoundingClientRect().width
        ) + "px";
    } else {
      d.el.style.left =
        Math.min(
          Math.max(d.elStartX + e.clientX - d.mouseStartX, 0),
          window.innerWidth - d.el.getBoundingClientRect().width
        ) + "px";
    }

    d.el.style.top =
      Math.min(
        Math.max(d.elStartY + e.clientY - d.mouseStartY, 0),
        window.innerHeight - d.el.getBoundingClientRect().height
      ) + "px";
    d.el.style.margin = 0;
  });
  document.addEventListener("mouseup", () => {
    if (isUndefined(d.el) || d.el === null) return;
    d.el.style.transition = d.oldTransition;
    d.el = undefined;
  });
  setInterval(() => {
    // prevent out of bounds
    const dialog = document.querySelector(".v-dialog.v-dialog--active");
    if (!dialog) return;
    dialog.style.left =
      Math.min(
        parseInt(dialog.style.left),
        window.innerWidth - dialog.getBoundingClientRect().width
      ) + "px";
    dialog.style.top =
      Math.min(
        parseInt(dialog.style.top),
        window.innerHeight - dialog.getBoundingClientRect().height
      ) + "px";
  }, 1000);

  setInterval(() => {
    // prevent out of bounds
    const dialog = document.querySelector(".v-application.application-float");
    const teneo = document.querySelector("#teneo");
    if (!dialog || !teneo) return;
    // console.log("setInternal application app");
    dialog.style.left =
      Math.min(
        parseInt(dialog.style.left),
        window.innerWidth - teneo.getBoundingClientRect().width
      ) + "px";
    dialog.style.top =
      Math.min(
        parseInt(dialog.style.top),
        window.innerHeight - teneo.getBoundingClientRect().height
      ) + "px";
  }, 1000);
};

module.exports = enableDrag;
