if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/service-worker.js').catch(() => {
      // Offline shell is a progressive enhancement; ignore registration failures.
    });
  });
}
