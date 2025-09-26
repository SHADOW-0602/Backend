const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');

// Analytics Operation Schema
const analyticsOperationSchema = new mongoose.Schema({
    userId: { type: String, required: true },
    userEmail: { type: String, required: true },
    userName: { type: String, required: true },
    userRole: { type: String, required: true },
    operation: { type: String, required: true },
    details: { type: Object, default: {} },
    metadata: {
        timestamp: { type: Date, default: Date.now },
        userAgent: String,
        url: String,
        sessionId: String,
        ip: String
    },
    timestamp: { type: Date, default: Date.now }
});

const AnalyticsOperation = mongoose.model('AnalyticsOperation', analyticsOperationSchema);

// Track operation endpoint
router.post('/track', async (req, res) => {
    try {
        const { userId, userEmail, userName, userRole, operation, details, metadata } = req.body;
        
        const analyticsData = new AnalyticsOperation({
            userId: userId || 'anonymous',
            userEmail: userEmail || 'anonymous',
            userName: userName || 'Anonymous User',
            userRole: userRole || 'user',
            operation,
            details: details || {},
            metadata: {
                ...metadata,
                ip: req.ip || req.connection.remoteAddress,
                timestamp: new Date()
            }
        });

        await analyticsData.save();
        
        // Emit to admin socket for real-time updates
        if (req.app.get('io')) {
            req.app.get('io').to('admin').emit('new_analytics_event', {
                operation,
                userName,
                userRole,
                timestamp: new Date(),
                details
            });
        }

        res.json({ success: true, message: 'Operation tracked successfully' });
    } catch (error) {
        console.error('Analytics tracking error:', error);
        res.status(500).json({ success: false, error: 'Failed to track operation' });
    }
});

// Get operations with filters
router.get('/operations', async (req, res) => {
    try {
        const { timeRange = '24h', operationType = 'all', userRole = 'all' } = req.query;
        
        // Build time filter
        let timeFilter = {};
        const now = new Date();
        switch (timeRange) {
            case '1h':
                timeFilter = { timestamp: { $gte: new Date(now - 60 * 60 * 1000) } };
                break;
            case '24h':
                timeFilter = { timestamp: { $gte: new Date(now - 24 * 60 * 60 * 1000) } };
                break;
            case '7d':
                timeFilter = { timestamp: { $gte: new Date(now - 7 * 24 * 60 * 60 * 1000) } };
                break;
            case '30d':
                timeFilter = { timestamp: { $gte: new Date(now - 30 * 24 * 60 * 60 * 1000) } };
                break;
        }

        // Build operation type filter
        let operationFilter = {};
        if (operationType !== 'all') {
            switch (operationType) {
                case 'booking':
                    operationFilter = { 
                        operation: { 
                            $in: [
                                'PICKUP_LOCATION_SELECTED', 
                                'DESTINATION_LOCATION_SELECTED', 
                                'VEHICLE_SELECTED', 
                                'PAYMENT_METHOD_SELECTED', 
                                'RIDE_BOOKING_SUCCESS'
                            ] 
                        } 
                    };
                    break;
                case 'auth':
                    operationFilter = { 
                        operation: { 
                            $in: ['LOGIN_SUCCESS', 'LOGOUT', 'SIGNUP_SUCCESS', 'SESSION_START'] 
                        } 
                    };
                    break;
                case 'navigation':
                    operationFilter = { 
                        operation: { 
                            $in: ['TAB_SWITCHED', 'PAGE_VISITED', 'RIDE_HISTORY_VIEWED'] 
                        } 
                    };
                    break;
            }
        }

        // Build user role filter
        let roleFilter = {};
        if (userRole !== 'all') {
            roleFilter = { userRole };
        }

        // Combine filters
        const filter = { ...timeFilter, ...operationFilter, ...roleFilter };

        // Get operations
        const operations = await AnalyticsOperation.find(filter)
            .sort({ timestamp: -1 })
            .limit(1000)
            .lean();

        // Calculate stats
        const totalOperations = operations.length;
        const uniqueUsers = [...new Set(operations.map(op => op.userId))].length;
        
        // Top operations
        const operationCounts = {};
        operations.forEach(op => {
            operationCounts[op.operation] = (operationCounts[op.operation] || 0) + 1;
        });
        
        const topOperations = Object.entries(operationCounts)
            .map(([operation, count]) => ({ operation, count }))
            .sort((a, b) => b.count - a.count)
            .slice(0, 10);

        // Hourly activity (last 24 hours)
        const hourlyActivity = Array.from({ length: 24 }, (_, i) => {
            const hour = new Date(now - (23 - i) * 60 * 60 * 1000).getHours();
            const hourStart = new Date(now - (23 - i) * 60 * 60 * 1000);
            hourStart.setMinutes(0, 0, 0);
            const hourEnd = new Date(hourStart.getTime() + 60 * 60 * 1000);
            
            const count = operations.filter(op => 
                new Date(op.timestamp) >= hourStart && new Date(op.timestamp) < hourEnd
            ).length;
            
            return { hour, count };
        });

        const stats = {
            totalOperations,
            uniqueUsers,
            topOperations,
            hourlyActivity
        };

        res.json({ 
            success: true, 
            operations, 
            stats 
        });
    } catch (error) {
        console.error('Failed to get operations:', error);
        res.status(500).json({ success: false, error: 'Failed to retrieve operations' });
    }
});

// Get analytics summary
router.get('/summary', async (req, res) => {
    try {
        const now = new Date();
        const last24h = new Date(now - 24 * 60 * 60 * 1000);
        const last7d = new Date(now - 7 * 24 * 60 * 60 * 1000);

        const [
            totalOperations,
            operations24h,
            operations7d,
            uniqueUsers24h,
            topOperationsToday
        ] = await Promise.all([
            AnalyticsOperation.countDocuments(),
            AnalyticsOperation.countDocuments({ timestamp: { $gte: last24h } }),
            AnalyticsOperation.countDocuments({ timestamp: { $gte: last7d } }),
            AnalyticsOperation.distinct('userId', { timestamp: { $gte: last24h } }),
            AnalyticsOperation.aggregate([
                { $match: { timestamp: { $gte: last24h } } },
                { $group: { _id: '$operation', count: { $sum: 1 } } },
                { $sort: { count: -1 } },
                { $limit: 5 }
            ])
        ]);

        res.json({
            success: true,
            summary: {
                totalOperations,
                operations24h,
                operations7d,
                uniqueUsers24h: uniqueUsers24h.length,
                topOperationsToday: topOperationsToday.map(op => ({
                    operation: op._id,
                    count: op.count
                }))
            }
        });
    } catch (error) {
        console.error('Failed to get analytics summary:', error);
        res.status(500).json({ success: false, error: 'Failed to retrieve summary' });
    }
});

module.exports = router;