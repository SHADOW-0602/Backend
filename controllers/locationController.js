const { updateDriverLocationInFile, findNearbyDrivers } = require('../services/locationService');

// Update driver location and status
exports.updateDriverLocation = async (req, res) => {
    try {
        const { latitude, longitude, address, status = 'available' } = req.body;
        const driverId = req.user.id;
        
        if (!latitude || !longitude) {
            return res.status(400).json({
                success: false,
                error: 'Latitude and longitude are required'
            });
        }
        
        const location = { latitude, longitude, address: address || 'Unknown Location' };
        
        // Update location in file
        const success = await updateDriverLocationInFile(driverId, location, status);
        
        if (success) {
            // Emit real-time update
            const io = req.app.get('io');
            if (io) {
                io.emit('driverLocationUpdate', {
                    driverId,
                    latitude,
                    longitude,
                    address: location.address,
                    status,
                    timestamp: new Date()
                });
            }
            
            res.json({
                success: true,
                message: 'Location updated successfully',
                location,
                status
            });
        } else {
            res.status(500).json({
                success: false,
                error: 'Failed to update location'
            });
        }
    } catch (error) {
        console.error('Location update error:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
};

// Get nearby drivers for testing
exports.getNearbyDrivers = async (req, res) => {
    try {
        const { latitude, longitude, vehicle_type, radius = 5 } = req.query;
        
        if (!latitude || !longitude) {
            return res.status(400).json({
                success: false,
                error: 'Latitude and longitude are required'
            });
        }
        
        const pickup_location = {
            latitude: parseFloat(latitude),
            longitude: parseFloat(longitude)
        };
        
        const nearbyDrivers = await findNearbyDrivers(pickup_location, vehicle_type, radius);
        
        res.json({
            success: true,
            drivers: nearbyDrivers,
            count: nearbyDrivers.length,
            searchRadius: radius
        });
    } catch (error) {
        console.error('Error finding nearby drivers:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
};

// Get driver status
exports.getDriverStatus = async (req, res) => {
    try {
        const driverId = req.user.id;
        
        // Read current driver data from file
        const { parseDriverLocationFile } = require('../services/locationService');
        const drivers = await parseDriverLocationFile();
        const driver = drivers.find(d => d.driverId === driverId);
        
        if (driver) {
            res.json({
                success: true,
                driver: {
                    id: driver.driverId,
                    location: {
                        latitude: driver.latitude,
                        longitude: driver.longitude,
                        address: driver.address
                    },
                    status: driver.status,
                    vehicleType: driver.vehicleType,
                    lastUpdated: driver.timestamp
                }
            });
        } else {
            res.json({
                success: true,
                driver: null,
                message: 'Driver location not found'
            });
        }
    } catch (error) {
        console.error('Error getting driver status:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
};