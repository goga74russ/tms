/** expo-secure-store mock — in-memory key/value store. */
const store: Map<string, string> = new Map();

export async function setItemAsync(key: string, value: string): Promise<void> {
    store.set(key, value);
}

export async function getItemAsync(key: string): Promise<string | null> {
    return store.has(key) ? store.get(key)! : null;
}

export async function deleteItemAsync(key: string): Promise<void> {
    store.delete(key);
}

export function __reset(): void {
    store.clear();
}

export function __set(key: string, value: string): void {
    store.set(key, value);
}
