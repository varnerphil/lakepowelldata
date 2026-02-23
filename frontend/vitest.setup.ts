import '@testing-library/jest-dom'

// Recharts (and other chart libs) use ResizeObserver; jsdom does not provide it.
if (typeof globalThis.ResizeObserver === 'undefined') {
  globalThis.ResizeObserver = class ResizeObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
}






