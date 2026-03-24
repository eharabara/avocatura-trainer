let deferredInstallPrompt = null;

function registerServiceWorker() {
  if (!("serviceWorker" in navigator)) {
    return;
  }

  navigator.serviceWorker.register("./sw.js").catch(() => {
    // Ignore registration failures in unsupported local contexts.
  });
}

window.addEventListener("beforeinstallprompt", (event) => {
  event.preventDefault();
  deferredInstallPrompt = event;
});

window.addEventListener("appinstalled", () => {
  deferredInstallPrompt = null;
});

window.addEventListener("DOMContentLoaded", () => {
  registerServiceWorker();
});
