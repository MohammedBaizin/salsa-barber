/**
 * Locks page scrolling behind a full-screen panel without the page jumping (iOS Safari safe):
 * the body is fixed at the current scroll position and restored afterwards. Nested locks are counted.
 */
let locks = 0;
let savedY = 0;

export function lockScroll(): () => void {
  if (typeof document === "undefined") return () => {};
  if (locks++ === 0) {
    savedY = window.scrollY;
    const body = document.body.style;
    const scrollbar = window.innerWidth - document.documentElement.clientWidth;
    body.position = "fixed";
    body.top = `-${savedY}px`;
    body.left = "0";
    body.right = "0";
    body.width = "100%";
    if (scrollbar > 0) body.paddingRight = `${scrollbar}px`;
  }
  let released = false;
  return () => {
    if (released) return;
    released = true;
    if (--locks === 0) {
      const body = document.body.style;
      body.position = body.top = body.left = body.right = body.width = body.paddingRight = "";
      window.scrollTo(0, savedY);
    }
  };
}
