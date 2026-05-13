/** expo-notifications mock. */
export async function getPermissionsAsync() {
    return { status: 'granted' as const, canAskAgain: true, granted: true };
}

export async function requestPermissionsAsync() {
    return { status: 'granted' as const, canAskAgain: true, granted: true };
}

export async function scheduleNotificationAsync(_n: any) {
    return 'mock-notification-id';
}
