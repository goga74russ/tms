export function getMockCoordinatesForVehicle(plateNumber: string, status: string): { lat: number, lon: number } | null {
    // Generate deterministic coordinates near Moscow based on plate string characters
    const hash = plateNumber.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
    
    // Base Moscow coordinates: 55.751, 37.617
    // Dispersion: ~0.2 degrees (~20km)
    
    const latOffset = ((hash % 100) / 100) * 0.4 - 0.2; // -0.2 to +0.2
    const lonOffset = (((hash * 13) % 100) / 100) * 0.4 - 0.2; // -0.2 to +0.2

    let baseLat = 55.751;
    let baseLon = 37.617;

    if (status === 'in_trip') {
        // Spread wider for trips
        baseLat += latOffset * 2;
        baseLon += lonOffset * 2;
    } else if (status === 'available') {
        // Group available vehicles closer to centers
        baseLat += latOffset * 0.5;
        baseLon += lonOffset * 0.5;
    } else {
        baseLat += latOffset;
        baseLon += lonOffset;
    }

    return {
        lat: Number(baseLat.toFixed(4)),
        lon: Number(baseLon.toFixed(4))
    };
}

export function mockGeocodeAddress(address: string): { lat: number, lon: number } {
    const hash = address.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
    const latOffset = ((hash % 100) / 100) * 2 - 1; 
    const lonOffset = (((hash * 13) % 100) / 100) * 2 - 1; 

    return {
        lat: Number((55.751 + latOffset).toFixed(4)),
        lon: Number((37.617 + lonOffset).toFixed(4))
    };
}
