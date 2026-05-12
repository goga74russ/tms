/** NetInfo mock — captures the listener so tests can fire connectivity events. */
type Listener = (state: { isConnected: boolean; isInternetReachable: boolean }) => void;

const listeners: Listener[] = [];

const NetInfo = {
    addEventListener: (fn: Listener): (() => void) => {
        listeners.push(fn);
        return () => {
            const i = listeners.indexOf(fn);
            if (i >= 0) listeners.splice(i, 1);
        };
    },
    fetch: async () => ({ isConnected: true, isInternetReachable: true }),
    __emit: (state: { isConnected: boolean; isInternetReachable: boolean }): void => {
        for (const l of listeners) l(state);
    },
    __reset: (): void => {
        listeners.length = 0;
    },
};

export default NetInfo;
