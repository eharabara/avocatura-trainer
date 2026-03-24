let deferredInstallPrompt = null;

function showInstallButton() {
  const installButton = document.getElementById("install-app");
  if (!installButton) {
    return;
  }

  installButton.hidden = false;
  installButton.onclick = async () => {
    if (!deferredInstallPrompt) {
      return;
    }

    deferredInstallPrompt.prompt();
    await deferredInstallPrompt.userChoice;
    deferredInstallPrompt = null;
    installButton.hidden = true;
  };
}

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
  showInstallButton();
});

window.addEventListener("appinstalled", () => {
  deferredInstallPrompt = null;
  const installButton = document.getElementById("install-app");
  if (installButton) {
    installButton.hidden = true;
  }
});

window.addEventListener("DOMContentLoaded", () => {
  registerServiceWorker();
  if (window.matchMedia && window.matchMedia("(display-mode: standalone)").matches) {
    const installButton = document.getElementById("install-app");
    if (installButton) {
      installButton.hidden = true;
    }
  }
});
