import "@testing-library/jest-dom/vitest";

// jsdom has no matchMedia; report a wide (xl) screen, like the e2e browser.
window.matchMedia = (query: string) => ({ matches: true, media: query }) as MediaQueryList;
