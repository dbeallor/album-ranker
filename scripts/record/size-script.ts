/** Wait this long after the last `resize` event before reporting, so a drag gives one report. */
export const RESIZE_DEBOUNCE_MS = 250;

/**
 * The init script that reports the page size to the `__albumRecorderViewport` binding: once when a top-level http(s)
 * page starts and again after each burst of `resize` events. It is separate from `recorderScript` so the Playwright
 * recorder and the event list stay as they are.
 */
export function sizeScript(): string {
  return `(function () {
  if (window !== window.top || !/^https?:$/.test(location.protocol)) { return; }
  function report() {
    try {
      Promise.resolve(window.__albumRecorderViewport({ ts: Date.now(), width: window.innerWidth, height: window.innerHeight })).catch(function () {});
    } catch (error) {}
  }
  var timer;
  window.addEventListener("resize", function () {
    clearTimeout(timer);
    timer = setTimeout(report, ${RESIZE_DEBOUNCE_MS});
  });
  report();
})();`;
}
