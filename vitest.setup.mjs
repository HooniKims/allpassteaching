import '@testing-library/jest-dom/vitest';

if (typeof window !== 'undefined' && !window.localStorage) {
    const values = new Map();
    Object.defineProperty(window, 'localStorage', {
        value: {
            clear: () => values.clear(),
            getItem: key => values.get(key) ?? null,
            removeItem: key => values.delete(key),
            setItem: (key, value) => values.set(key, String(value)),
        },
    });
}
