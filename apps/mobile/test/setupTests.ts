/**
 * Global jest setup:
 *   - define `__DEV__` (React Native sets this at bundle time)
 *   - silence noisy deprecation warnings from react-test-renderer under React 19
 *     (RNTL 13 still uses it internally; informational and out of our control)
 */
(globalThis as any).__DEV__ = true;
const originalError = console.error;
console.error = (...args: unknown[]) => {
    const msg = String(args[0] ?? '');
    if (
        msg.includes('react-test-renderer is deprecated') ||
        msg.includes('An update to') && msg.includes('inside a test was not wrapped in act')
    ) {
        return;
    }
    originalError(...args);
};
