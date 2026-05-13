/** expo-location mock. */
export const Accuracy = {
    Lowest: 1,
    Low: 2,
    Balanced: 3,
    High: 4,
    Highest: 5,
    BestForNavigation: 6,
};

export async function requestForegroundPermissionsAsync() {
    return { status: 'granted' as const, granted: true, canAskAgain: true };
}

export async function getCurrentPositionAsync(_opts?: any) {
    return {
        coords: {
            latitude: 55.7558,
            longitude: 37.6173,
            altitude: 150,
            accuracy: 5,
            heading: 0,
            speed: 0,
        },
        timestamp: Date.now(),
    };
}
