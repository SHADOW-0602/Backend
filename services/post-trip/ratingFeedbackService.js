const Rating = require('../../models/Rating');
const Ride = require('../../models/Ride');
const User = require('../../models/User');
const Driver = require('../../models/Driver');

class RatingFeedbackService {
    constructor() {
        this.ratingCategories = {
            driver: ['punctuality', 'driving_skill', 'vehicle_condition', 'behavior'],
            user: ['politeness', 'punctuality', 'cleanliness', 'payment']
        };
    }

    async submitRating(rideId, raterId, raterType, ratingData) {
        const { rating, feedback, categories, tip = 0, compliments = [] } = ratingData;

        // Validate rating
        if (rating < 1 || rating > 5) {
            throw new Error('Rating must be between 1 and 5 stars');
        }

        // Check if ride exists and is completed
        const ride = await Ride.findById(rideId).populate('user_id driver_id');
        if (!ride || ride.status !== 'completed') {
            throw new Error('Can only rate completed rides');
        }

        // Check authorization
        const isAuthorized = (raterType === 'user' && ride.user_id._id.toString() === raterId) ||
                           (raterType === 'driver' && ride.driver_id._id.toString() === raterId);
        
        if (!isAuthorized) {
            throw new Error('Unauthorized to rate this ride');
        }

        // Check if already rated
        const existingRating = await Rating.findOne({ 
            ride_id: rideId, 
            rater_id: raterId,
            rater_type: raterType 
        });

        if (existingRating) {
            throw new Error('You have already rated this ride');
        }

        // Create rating record
        const newRating = await Rating.create({
            ride_id: rideId,
            rater_id: raterId,
            rater_type: raterType,
            rated_id: raterType === 'user' ? ride.driver_id._id : ride.user_id._id,
            rated_type: raterType === 'user' ? 'driver' : 'user',
            rating,
            feedback,
            categories: categories || {},
            tip,
            compliments,
            created_at: new Date()
        });

        // Update overall ratings
        await this.updateOverallRating(
            raterType === 'user' ? ride.driver_id._id : ride.user_id._id,
            raterType === 'user' ? 'driver' : 'user'
        );

        // Process tip if provided
        if (tip > 0 && raterType === 'user') {
            await this.processTip(ride.driver_id._id, tip, rideId);
        }

        // Send notifications
        await this.sendRatingNotifications(ride, newRating, raterType);

        return {
            success: true,
            rating: newRating,
            message: 'Rating submitted successfully'
        };
    }

    async updateOverallRating(userId, userType) {
        const Model = userType === 'driver' ? Driver : User;
        
        // Calculate new average rating
        const ratings = await Rating.find({
            rated_id: userId,
            rated_type: userType
        }).select('rating');

        if (ratings.length === 0) return;

        const averageRating = ratings.reduce((sum, r) => sum + r.rating, 0) / ratings.length;
        const roundedRating = Math.round(averageRating * 10) / 10;

        // Update user/driver record
        await Model.findByIdAndUpdate(userId, {
            rating: roundedRating,
            totalRatings: ratings.length,
            lastRatedAt: new Date()
        });

        // Update rating distribution
        const distribution = this.calculateRatingDistribution(ratings);
        await Model.findByIdAndUpdate(userId, {
            ratingDistribution: distribution
        });
    }

    calculateRatingDistribution(ratings) {
        const distribution = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
        
        ratings.forEach(rating => {
            distribution[rating.rating] = (distribution[rating.rating] || 0) + 1;
        });

        const total = ratings.length;
        Object.keys(distribution).forEach(key => {
            distribution[key] = Math.round((distribution[key] / total) * 100);
        });

        return distribution;
    }

    async processTip(driverId, tipAmount, rideId) {
        // Update driver's tip earnings
        await Driver.findByIdAndUpdate(driverId, {
            $inc: { 
                'earnings.tips': tipAmount,
                'earnings.total': tipAmount
            }
        });

        // Record tip transaction
        // This would integrate with payment system in real implementation
        console.log(`Tip of ₹${tipAmount} processed for driver ${driverId} from ride ${rideId}`);
    }

    async sendRatingNotifications(ride, rating, raterType) {
        // This would send push notifications or emails
        const recipientId = raterType === 'user' ? ride.driver_id._id : ride.user_id._id;
        const raterName = raterType === 'user' ? ride.user_id.name : ride.driver_id.name;

        console.log(`Rating notification: ${raterName} rated ${rating.rating} stars`);
        
        // In real implementation, this would use notification service
        // await notificationService.send(recipientId, {
        //     type: 'rating_received',
        //     message: `You received a ${rating.rating}-star rating from ${raterName}`,
        //     rating: rating.rating,
        //     feedback: rating.feedback
        // });
    }

    async getRatingsSummary(userId, userType) {
        const ratings = await Rating.find({
            rated_id: userId,
            rated_type: userType
        }).populate('rater_id', 'name').sort({ created_at: -1 });

        const summary = {
            averageRating: 0,
            totalRatings: ratings.length,
            distribution: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 },
            recentRatings: ratings.slice(0, 10),
            categoryAverages: {},
            totalTips: 0,
            commonCompliments: {}
        };

        if (ratings.length === 0) return summary;

        // Calculate averages
        const totalRating = ratings.reduce((sum, r) => sum + r.rating, 0);
        summary.averageRating = Math.round((totalRating / ratings.length) * 10) / 10;

        // Distribution
        ratings.forEach(rating => {
            summary.distribution[rating.rating]++;
        });

        // Category averages
        const categories = this.ratingCategories[userType] || [];
        categories.forEach(category => {
            const categoryRatings = ratings
                .filter(r => r.categories && r.categories[category])
                .map(r => r.categories[category]);
            
            if (categoryRatings.length > 0) {
                summary.categoryAverages[category] = 
                    Math.round((categoryRatings.reduce((a, b) => a + b, 0) / categoryRatings.length) * 10) / 10;
            }
        });

        // Tips (for drivers)
        if (userType === 'driver') {
            summary.totalTips = ratings.reduce((sum, r) => sum + (r.tip || 0), 0);
        }

        // Common compliments
        const complimentCounts = {};
        ratings.forEach(rating => {
            if (rating.compliments) {
                rating.compliments.forEach(compliment => {
                    complimentCounts[compliment] = (complimentCounts[compliment] || 0) + 1;
                });
            }
        });

        summary.commonCompliments = Object.entries(complimentCounts)
            .sort(([,a], [,b]) => b - a)
            .slice(0, 5)
            .reduce((obj, [key, value]) => ({ ...obj, [key]: value }), {});

        return summary;
    }

    async canRate(rideId, userId) {
        const ride = await Ride.findById(rideId);
        if (!ride) {
            return { canRate: false, reason: 'Ride not found' };
        }

        if (ride.status !== 'completed') {
            return { canRate: false, reason: 'Can only rate completed rides' };
        }

        // Check if user is part of this ride
        const isUser = ride.user_id.toString() === userId;
        const isDriver = ride.driver_id && ride.driver_id.toString() === userId;

        if (!isUser && !isDriver) {
            return { canRate: false, reason: 'Not authorized to rate this ride' };
        }

        // Check if already rated
        const raterType = isUser ? 'user' : 'driver';
        const existingRating = await Rating.findOne({
            ride_id: rideId,
            rater_id: userId,
            rater_type: raterType
        });

        if (existingRating) {
            return { canRate: false, reason: 'Already rated this ride' };
        }

        // Check time limit (e.g., 7 days after ride completion)
        const completedAt = ride.timestamps.completed_at;
        const daysSinceCompletion = (new Date() - completedAt) / (1000 * 60 * 60 * 24);
        
        if (daysSinceCompletion > 7) {
            return { canRate: false, reason: 'Rating period has expired' };
        }

        return { canRate: true };
    }

    async getComplimentOptions() {
        return {
            driver: [
                'Great driving',
                'Friendly',
                'Clean car',
                'On time',
                'Safe driver',
                'Good music',
                'Helpful',
                'Professional'
            ],
            user: [
                'Polite',
                'On time',
                'Easy to find',
                'Respectful',
                'Clean',
                'Good conversation',
                'Quiet',
                'Friendly'
            ]
        };
    }

    async generateRatingInsights(userId, userType, period = '30d') {
        const startDate = new Date();
        startDate.setDate(startDate.getDate() - (period === '30d' ? 30 : 7));

        const ratings = await Rating.find({
            rated_id: userId,
            rated_type: userType,
            created_at: { $gte: startDate }
        });

        const insights = {
            period,
            totalRatings: ratings.length,
            averageRating: 0,
            trend: 'stable',
            improvementAreas: [],
            strengths: [],
            ratingTrend: []
        };

        if (ratings.length === 0) return insights;

        // Calculate average
        insights.averageRating = ratings.reduce((sum, r) => sum + r.rating, 0) / ratings.length;

        // Analyze trends
        const weeklyAverages = this.calculateWeeklyAverages(ratings);
        insights.ratingTrend = weeklyAverages;

        if (weeklyAverages.length >= 2) {
            const recent = weeklyAverages[weeklyAverages.length - 1].average;
            const previous = weeklyAverages[weeklyAverages.length - 2].average;
            
            if (recent > previous + 0.2) insights.trend = 'improving';
            else if (recent < previous - 0.2) insights.trend = 'declining';
        }

        // Identify improvement areas and strengths
        const categoryAnalysis = this.analyzeCategoryRatings(ratings, userType);
        insights.improvementAreas = categoryAnalysis.weakAreas;
        insights.strengths = categoryAnalysis.strongAreas;

        return insights;
    }

    calculateWeeklyAverages(ratings) {
        const weeks = {};
        
        ratings.forEach(rating => {
            const weekStart = new Date(rating.created_at);
            weekStart.setDate(weekStart.getDate() - weekStart.getDay());
            const weekKey = weekStart.toISOString().split('T')[0];
            
            if (!weeks[weekKey]) {
                weeks[weekKey] = { ratings: [], total: 0 };
            }
            weeks[weekKey].ratings.push(rating.rating);
            weeks[weekKey].total += rating.rating;
        });

        return Object.entries(weeks).map(([week, data]) => ({
            week,
            average: Math.round((data.total / data.ratings.length) * 10) / 10,
            count: data.ratings.length
        })).sort((a, b) => new Date(a.week) - new Date(b.week));
    }

    analyzeCategoryRatings(ratings, userType) {
        const categories = this.ratingCategories[userType] || [];
        const categoryAverages = {};

        categories.forEach(category => {
            const categoryRatings = ratings
                .filter(r => r.categories && r.categories[category])
                .map(r => r.categories[category]);
            
            if (categoryRatings.length > 0) {
                categoryAverages[category] = 
                    categoryRatings.reduce((a, b) => a + b, 0) / categoryRatings.length;
            }
        });

        const sortedCategories = Object.entries(categoryAverages)
            .sort(([,a], [,b]) => b - a);

        return {
            strongAreas: sortedCategories.slice(0, 2).map(([cat]) => cat),
            weakAreas: sortedCategories.slice(-2).map(([cat]) => cat)
        };
    }
}

module.exports = RatingFeedbackService;