/** In-memory AsyncStorage mock. Exposes __reset() and __dump() for tests. */
const store: Map<string, string> = new Map();

const AsyncStorage = {
    getItem: async (key: string): Promise<string | null> => {
        return store.has(key) ? store.get(key)! : null;
    },
    setItem: async (key: string, value: string): Promise<void> => {
        store.set(key, value);
    },
    removeItem: async (key: string): Promise<void> => {
        store.delete(key);
    },
    multiRemove: async (keys: string[]): Promise<void> => {
        for (const k of keys) store.delete(k);
    },
    clear: async (): Promise<void> => {
        store.clear();
    },
    getAllKeys: async (): Promise<string[]> => {
        return Array.from(store.keys());
    },
    __reset: (): void => {
        store.clear();
    },
    __dump: (): Record<string, string> => {
        return Object.fromEntries(store);
    },
    __set: (key: string, value: string): void => {
        store.set(key, value);
    },
};

export default AsyncStorage;
