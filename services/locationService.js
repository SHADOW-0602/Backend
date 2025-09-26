const fs = require('fs').promises;
const path = require('path');
const Driver = require('../models/Driver');
const { calculateDistance } = require('../utils/haversine');

// Parse GPS coordinates file
exports.parseLocationFile = async (filename) => {
    const filePath = path.join(__dirname, '..', filename);
    const data = await fs.readFile(filePath, 'utf8');

    return data
        .trim()
        .split('\n')
        .map(line => {
            const [lat, lon, driverId, timestamp] = line.split(',');
            return {
                latitude: parseFloat(lat),
                longitude: parseFloat(lon),
                driverId: driverId.trim(),
                timestamp: new Date(timestamp.trim())
            };
        });
};

// Parse structured driver location file
exports.parseDriverLocationFile = async () => {
    const filePath = path.join(__dirname, '..', 'location-data', 'drivers.txt');
    const data = await fs.readFile(filePath, 'utf8');

    return data
        .trim()
        .split('\n')
        .map(line => {
            const [driverId, lat, lon, address, vehicleType, status, timestamp] = line.split(',');
            return {
                driverId: driverId.trim(),
                latitude: parseFloat(lat),
                longitude: parseFloat(lon),
                address: address.trim(),
                vehicleType: vehicleType.trim(),
                status: status.trim(),
                timestamp: new Date(timestamp.trim())
            };
        });
};

// Parse zone data file
exports.parseZoneFile = async () => {
    const filePath = path.join(__dirname, '..', 'location-data', 'zones.txt');
    const data = await fs.readFile(filePath, 'utf8');

    return data
        .trim()
        .split('\n')
        .map(line => {
            const [zoneId, zoneName, lat, lon, radius] = line.split(',');
            return {
                zoneId: zoneId.trim(),
                zoneName: zoneName.trim(),
                latitude: parseFloat(lat),
                longitude: parseFloat(lon),
                radius: parseFloat(radius)
            };
        });
};

// Find nearby drivers using Haversine formula
exports.findNearbyDrivers = async (pickup_location, vehicle_type, radius = 5) => {
    try {
        // Read from structured driver file
        const fileDrivers = await this.parseDriverLocationFile();
        
        // Filter available drivers
        const availableDrivers = fileDrivers.filter(driver => 
            driver.status === 'available' &&
            (!vehicle_type || driver.vehicleType === vehicle_type)
        );

        const nearbyDrivers = [];

        for (const fileDriver of availableDrivers) {
            // Calculate distance using Haversine formula
            const distance = calculateDistance(
                pickup_location.latitude,
                pickup_location.longitude,
                fileDriver.latitude,
                fileDriver.longitude
            );

            if (distance <= radius) {
                // Get additional driver info from database
                const dbDriver = await Driver.findOne({ 
                    $or: [
                        { _id: fileDriver.driverId },
                        { email: { $regex: fileDriver.driverId, $options: 'i' } }
                    ]
                }).select('name phone rating driverInfo');

                nearbyDrivers.push({
                    driver_id: fileDriver.driverId,
                    name: dbDriver?.name || `Driver ${fileDriver.driverId}`,
                    phone: dbDriver?.phone || 'N/A',
                    rating: dbDriver?.rating || 4.0,
                    vehicleType: fileDriver.vehicleType,
                    distance: Math.round(distance * 100) / 100,
                    location: {
                        latitude: fileDriver.latitude,
                        longitude: fileDriver.longitude,
                        address: fileDriver.address
                    },
                    status: fileDriver.status,
                    estimatedArrival: Math.ceil(distance * 3), // 3 minutes per km
                    lastUpdated: fileDriver.timestamp
                });
            }
        }

        // Sort by distance (nearest first)
        return nearbyDrivers.sort((a, b) => a.distance - b.distance);

    } catch (error) {
        console.error('Error finding nearby drivers:', error);
        return [];
    }
};

// Find drivers within specific zone
exports.findDriversInZone = async (pickup_location) => {
    try {
        const zones = await this.parseZoneFile();
        const drivers = await this.parseDriverLocationFile();

        for (const zone of zones) {
            const distanceToZone = calculateDistance(
                pickup_location.latitude,
                pickup_location.longitude,
                zone.latitude,
                zone.longitude
            );

            if (distanceToZone <= zone.radius) {
                const zoneDrivers = drivers.filter(driver => {
                    const driverToZone = calculateDistance(
                        driver.latitude,
                        driver.longitude,
                        zone.latitude,
                        zone.longitude
                    );
                    return driverToZone <= zone.radius && driver.status === 'available';
                });

                return {
                    zone: zone.zoneName,
                    drivers: zoneDrivers,
                    count: zoneDrivers.length
                };
            }
        }

        return { zone: 'Unknown', drivers: [], count: 0 };
    } catch (error) {
        console.error('Error finding drivers in zone:', error);
        return { zone: 'Error', drivers: [], count: 0 };
    }
};

// Update driver location in file
exports.updateDriverLocationInFile = async (driverId, location, status = 'available') => {
    try {
        const filePath = path.join(__dirname, '..', 'location-data', 'drivers.txt');
        const drivers = await this.parseDriverLocationFile();
        
        // Find and update driver
        const driverIndex = drivers.findIndex(d => d.driverId === driverId);
        
        if (driverIndex !== -1) {
            drivers[driverIndex] = {
                ...drivers[driverIndex],
                latitude: location.latitude,
                longitude: location.longitude,
                address: location.address || drivers[driverIndex].address,
                status: status,
                timestamp: new Date()
            };
        } else {
            // Add new driver entry
            drivers.push({
                driverId,
                latitude: location.latitude,
                longitude: location.longitude,
                address: location.address || 'Unknown Location',
                vehicleType: 'sedan',
                status: status,
                timestamp: new Date()
            });
        }

        // Write back to file
        const fileContent = drivers.map(d => 
            `${d.driverId},${d.latitude},${d.longitude},${d.address},${d.vehicleType},${d.status},${d.timestamp.toISOString()}`
        ).join('\n');

        await fs.writeFile(filePath, fileContent);
        return true;
    } catch (error) {
        console.error('Error updating driver location in file:', error);
        return false;
    }
};

// Get distance matrix for multiple locations
exports.getDistanceMatrix = async (origins, destinations) => {
    const matrix = [];
    
    for (const origin of origins) {
        const row = [];
        for (const destination of destinations) {
            const distance = calculateDistance(
                origin.latitude,
                origin.longitude,
                destination.latitude,
                destination.longitude
            );
            row.push({
                distance: Math.round(distance * 100) / 100,
                duration: Math.ceil(distance * 3) // 3 minutes per km
            });
        }
        matrix.push(row);
    }
    
    return matrix;
};

// Legacy support - update driver location
exports.updateDriverLocation = async (driverId, location) => {
    try {
        // Update in database
        await Driver.findByIdAndUpdate(driverId, { location });
        
        // Update in file
        await this.updateDriverLocationInFile(driverId, location);
        
        // Also append to GPS file for backup
        const gpsEntry = `${location.latitude},${location.longitude},${driverId},${new Date().toISOString()}\n`;
        const gpsFilePath = path.join(__dirname, '..', 'location-data', 'gps.txt');
        await fs.appendFile(gpsFilePath, gpsEntry);
        
        return true;
    } catch (error) {
        console.error('Error updating driver location:', error);
        return false;
    }
};