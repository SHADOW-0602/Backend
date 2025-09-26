const Analytics = require('../models/Analytics');
const Ride = require('../models/Ride');
const User = require('../models/User');
const Driver = require('../models/Driver');

class AnalyticsService {
    static async generateDailyAnalytics(date = new Date()) {
        try {
            const startOfDay = new Date(date);
            startOfDay.setHours(0, 0, 0, 0);
            const endOfDay = new Date(date);
            endOfDay.setHours(23, 59, 59, 999);

            // Get rides for the day
            const dayRides = await Ride.find({
                createdAt: { $gte: startOfDay, $lte: endOfDay }
            });

            const completedRides = dayRides.filter(r => r.status === 'completed');
            const cancelledRides = dayRides.filter(r => r.status === 'cancelled');

            // Calculate metrics
            const totalRevenue = completedRides.reduce((sum, ride) => sum + (ride.fare || 0), 0);
            const totalUsers = await User.countDocuments({ createdAt: { $lte: endOfDay } });
            const totalDrivers = await Driver.countDocuments({ createdAt: { $lte: endOfDay } });
            const activeDrivers = await Driver.countDocuments({ 
                status: 'available',
                createdAt: { $lte: endOfDay }
            });

            // Calculate average rating
            const ridesWithRatings = completedRides.filter(r => r.rating && r.rating > 0);
            const averageRating = ridesWithRatings.length > 0 ? 
                ridesWithRatings.reduce((sum, r) => sum + r.rating, 0) / ridesWithRatings.length : 0;

            // Calculate average distance and fare
            const ridesWithDistance = completedRides.filter(r => r.distance && r.distance > 0);
            const averageRideDistance = ridesWithDistance.length > 0 ?
                ridesWithDistance.reduce((sum, r) => sum + r.distance, 0) / ridesWithDistance.length : 0;

            const averageRideFare = completedRides.length > 0 ?
                totalRevenue / completedRides.length : 0;

            // Peak hours analysis
            const peakHours = Array.from({ length: 24 }, (_, hour) => ({
                hour,
                rideCount: dayRides.filter(r => new Date(r.createdAt).getHours() === hour).length
            })).filter(h => h.rideCount > 0);

            // Payment methods breakdown
            const paymentMethods = {
                cash: completedRides.filter(r => r.payment_method === 'cash').length,
                card: completedRides.filter(r => r.payment_method === 'card').length,
                upi: completedRides.filter(r => r.payment_method === 'upi').length
            };

            // Store analytics
            const analytics = await Analytics.findOneAndUpdate(
                { date: startOfDay },
                {
                    totalRides: dayRides.length,
                    completedRides: completedRides.length,
                    cancelledRides: cancelledRides.length,
                    totalRevenue: Math.round(totalRevenue),
                    totalUsers,
                    totalDrivers,
                    activeDrivers,
                    averageRating: Math.round(averageRating * 10) / 10,
                    averageRideDistance: Math.round(averageRideDistance * 10) / 10,
                    averageRideFare: Math.round(averageRideFare),
                    peakHours,
                    paymentMethods
                },
                { upsert: true, new: true }
            );

            return analytics;
        } catch (error) {
            console.error('Error generating analytics:', error);
            throw error;
        }
    }

    static async getAnalyticsSummary(days = 30) {
        try {
            const endDate = new Date();
            const startDate = new Date();
            startDate.setDate(startDate.getDate() - days);

            const analytics = await Analytics.find({
                date: { $gte: startDate, $lte: endDate }
            }).sort({ date: -1 });

            const summary = {
                totalRides: analytics.reduce((sum, a) => sum + a.totalRides, 0),
                totalRevenue: analytics.reduce((sum, a) => sum + a.totalRevenue, 0),
                averageRating: analytics.length > 0 ? 
                    analytics.reduce((sum, a) => sum + a.averageRating, 0) / analytics.length : 0,
                completionRate: analytics.length > 0 ?
                    (analytics.reduce((sum, a) => sum + a.completedRides, 0) / 
                     analytics.reduce((sum, a) => sum + a.totalRides, 0)) * 100 : 0,
                dailyData: analytics.map(a => ({
                    date: a.date,
                    rides: a.totalRides,
                    revenue: a.totalRevenue,
                    rating: a.averageRating
                }))
            };

            return summary;
        } catch (error) {
            console.error('Error getting analytics summary:', error);
            throw error;
        }
    }
}

module.exports = AnalyticsService;