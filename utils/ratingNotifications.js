// Simple rating notification system
class RatingNotifications {
    static async sendRatingReminder(io, rideId, userId, userType) {
        const message = {
            type: 'rating_reminder',
            title: 'Rate Your Trip',
            message: 'Please rate your recent trip experience',
            rideId,
            timestamp: new Date()
        };

        // Send to specific user
        io.to(`user_${userId}`).emit('notification', message);
    }

    static async sendRatingReceived(io, ratedUserId, rating, raterName) {
        const message = {
            type: 'rating_received',
            title: 'New Rating Received',
            message: `${raterName} rated you ${rating}/5 stars`,
            rating,
            timestamp: new Date()
        };

        // Send to rated user
        io.to(`user_${ratedUserId}`).emit('notification', message);
    }

    static async sendMutualRatingComplete(io, rideId, userIds) {
        const message = {
            type: 'mutual_rating_complete',
            title: 'Trip Ratings Complete',
            message: 'Both parties have rated this trip',
            rideId,
            timestamp: new Date()
        };

        // Send to both users
        userIds.forEach(userId => {
            io.to(`user_${userId}`).emit('notification', message);
        });
    }
}

module.exports = RatingNotifications;