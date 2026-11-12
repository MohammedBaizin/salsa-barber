// Testing Library cleans up after each test by itself (globals: true in vitest.config.mts).
import "@testing-library/jest-dom/vitest";

// jsdom has no matchMedia; default to "no preference" (tests can override it with vi.stubGlobal).
if (typeof window !== "undefined" && !window.matchMedia) {
  window.matchMedia = (query: string) =>
    ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    }) as MediaQueryList;
}
