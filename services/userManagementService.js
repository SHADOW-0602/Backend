const User = require('../models/User');
const Driver = require('../models/Driver');
const Ride = require('../models/Ride');
const Payment = require('../models/Payment');
const emailService = require('./emailService');

class UserManagementService {
    // Calculate user activity score
    static async calculateActivityScore(userId) {
        try {
            const user = await User.findById(userId);
            if (!user) return 0;

            let score = 0;
            
            // Profile completion (0-25 points)
            score += (user.profileCompletion.percentage / 100) * 25;
            
            // Verification status (0-20 points)
            const verifications = Object.values(user.verification || {});
            const verifiedCount = verifications.filter(v => v).length;
            score += (verifiedCount / verifications.length) * 20;
            
            // Recent activity (0-25 points)
            const daysSinceLastActivity = Math.floor(
                (Date.now() - new Date(user.analytics.lastActivityAt)) / (1000 * 60 * 60 * 24)
            );
            if (daysSinceLastActivity <= 7) score += 25;
            else if (daysSinceLastActivity <= 30) score += 15;
            else if (daysSinceLastActivity <= 90) score += 5;
            
            // Total rides (0-15 points)
            const rideScore = Math.min(user.analytics.totalRides * 2, 15);
            score += rideScore;
            
            // Rating (0-15 points)
            if (user.analytics.averageRating > 0) {
                score += (user.analytics.averageRating / 5) * 15;
            }
            
            return Math.round(score);
        } catch (error) {
            console.error('Error calculating activity score:', error);
            return 0;
        }
    }

    // Award badges based on user activity
    static async awardBadges(userId) {
        try {
            const user = await User.findById(userId);
            if (!user) return;

            const badges = [];
            const existingBadges = user.badges.map(b => b.type);

            // Profile completion badge
            if (user.profileCompletion.percentage >= 100 && !existingBadges.includes('profile_complete')) {
                badges.push({
                    type: 'profile_complete',
                    name: 'Profile Master',
                    description: 'Completed 100% of profile information',
                    icon: '✅'
                });
            }

            // Verification badges
            if (user.verification.email && user.verification.phone && !existingBadges.includes('verified_user')) {
                badges.push({
                    type: 'verified_user',
                    name: 'Verified User',
                    description: 'Email and phone verified',
                    icon: '🔒'
                });
            }

            // Ride count badges
            if (user.analytics.totalRides >= 10 && !existingBadges.includes('frequent_rider')) {
                badges.push({
                    type: 'frequent_rider',
                    name: 'Frequent Rider',
                    description: 'Completed 10+ rides',
                    icon: '🚗'
                });
            }

            if (user.analytics.totalRides >= 50 && !existingBadges.includes('super_rider')) {
                badges.push({
                    type: 'super_rider',
                    name: 'Super Rider',
                    description: 'Completed 50+ rides',
                    icon: '⭐'
                });
            }

            // High rating badge
            if (user.analytics.averageRating >= 4.5 && user.analytics.totalRides >= 5 && !existingBadges.includes('top_rated')) {
                badges.push({
                    type: 'top_rated',
                    name: 'Top Rated',
                    description: 'Maintained 4.5+ star rating',
                    icon: '🌟'
                });
            }

            // Security badge
            if (user.twoFactorEnabled && !existingBadges.includes('security_conscious')) {
                badges.push({
                    type: 'security_conscious',
                    name: 'Security Conscious',
                    description: 'Enabled two-factor authentication',
                    icon: '🛡️'
                });
            }

            if (badges.length > 0) {
                await User.findByIdAndUpdate(userId, {
                    $push: { badges: { $each: badges } }
                });
            }

            return badges;
        } catch (error) {
            console.error('Error awarding badges:', error);
            return [];
        }
    }

    // Update user analytics after ride completion
    static async updateUserAnalytics(userId, rideData) {
        try {
            const updates = {
                $inc: {
                    'analytics.totalRides': 1,
                    'analytics.totalSpent': rideData.fare || 0
                },
                $set: {
                    'analytics.lastActivityAt': new Date()
                }
            };

            // Update average rating if provided
            if (rideData.rating) {
                const user = await User.findById(userId);
                const currentTotal = user.analytics.averageRating * (user.analytics.totalRides || 0);
                const newAverage = (currentTotal + rideData.rating) / ((user.analytics.totalRides || 0) + 1);
                updates.$set['analytics.averageRating'] = Math.round(newAverage * 10) / 10;
            }

            // Update favorite locations
            if (rideData.destination) {
                const user = await User.findById(userId);
                const existingLocation = user.analytics.favoriteLocations.find(
                    loc => loc.name === rideData.destination.name
                );

                if (existingLocation) {
                    updates.$inc = {
                        ...updates.$inc,
                        'analytics.favoriteLocations.$.frequency': 1
                    };
                } else {
                    updates.$push = {
                        'analytics.favoriteLocations': {
                            name: rideData.destination.name,
                            coordinates: rideData.destination.coordinates,
                            frequency: 1
                        }
                    };
                }
            }

            await User.findByIdAndUpdate(userId, updates);

            // Update activity score and award badges
            const activityScore = await this.calculateActivityScore(userId);
            await User.findByIdAndUpdate(userId, {
                'analytics.activityScore': activityScore
            });

            await this.awardBadges(userId);

        } catch (error) {
            console.error('Error updating user analytics:', error);
        }
    }

    // Detect suspicious login activity
    static async detectSuspiciousActivity(userId, loginData) {
        try {
            const user = await User.findById(userId);
            if (!user) return false;

            const recentLogins = user.loginHistory.slice(0, 10);
            let suspiciousFlags = 0;

            // Check for multiple failed attempts
            const recentFailures = recentLogins.filter(
                login => !login.success && 
                Date.now() - login.timestamp < 30 * 60 * 1000 // Last 30 minutes
            );
            if (recentFailures.length >= 3) suspiciousFlags++;

            // Check for unusual location
            const recentSuccessfulLogins = recentLogins.filter(login => login.success);
            if (recentSuccessfulLogins.length > 0) {
                const usualIPs = [...new Set(recentSuccessfulLogins.map(login => login.ip))];
                if (!usualIPs.includes(loginData.ip)) suspiciousFlags++;
            }

            // Check for unusual device
            const usualDevices = user.devices.map(d => d.deviceId);
            const currentDeviceId = `${loginData.deviceInfo.browser}_${loginData.deviceInfo.os}_${loginData.ip}`.replace(/\s+/g, '_');
            if (!usualDevices.includes(currentDeviceId)) suspiciousFlags++;

            // If suspicious, send alert email
            if (suspiciousFlags >= 2) {
                await emailService.sendSecurityAlert(user.email, {
                    ip: loginData.ip,
                    device: `${loginData.deviceInfo.browser} on ${loginData.deviceInfo.os}`,
                    timestamp: new Date()
                });
                return true;
            }

            return false;
        } catch (error) {
            console.error('Error detecting suspicious activity:', error);
            return false;
        }
    }

    // Clean up inactive sessions and devices
    static async cleanupInactiveDevices(userId) {
        try {
            const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
            
            await User.findByIdAndUpdate(userId, {
                $pull: {
                    devices: {
                        lastUsed: { $lt: thirtyDaysAgo },
                        isTrusted: false
                    }
                }
            });
        } catch (error) {
            console.error('Error cleaning up inactive devices:', error);
        }
    }

    // Generate user insights
    static async generateUserInsights(userId) {
        try {
            const user = await User.findById(userId);
            if (!user) return null;

            const insights = {
                profileStrength: user.profileCompletion.percentage,
                securityScore: 0,
                activityLevel: 'low',
                recommendations: []
            };

            // Calculate security score
            let securityScore = 0;
            if (user.twoFactorEnabled) securityScore += 30;
            if (user.verification.email) securityScore += 20;
            if (user.verification.phone) securityScore += 20;
            if (user.devices.some(d => d.isTrusted)) securityScore += 15;
            if (user.accountStatus.loginAttempts === 0) securityScore += 15;
            insights.securityScore = securityScore;

            // Determine activity level
            const daysSinceLastActivity = Math.floor(
                (Date.now() - new Date(user.analytics.lastActivityAt)) / (1000 * 60 * 60 * 24)
            );
            if (daysSinceLastActivity <= 7) insights.activityLevel = 'high';
            else if (daysSinceLastActivity <= 30) insights.activityLevel = 'medium';

            // Generate recommendations
            if (user.profileCompletion.percentage < 100) {
                insights.recommendations.push('Complete your profile to unlock more features');
            }
            if (!user.twoFactorEnabled) {
                insights.recommendations.push('Enable two-factor authentication for better security');
            }
            if (!user.verification.email) {
                insights.recommendations.push('Verify your email address');
            }
            if (user.analytics.totalRides === 0) {
                insights.recommendations.push('Book your first ride to start earning badges');
            }

            return insights;
        } catch (error) {
            console.error('Error generating user insights:', error);
            return null;
        }
    }
}

module.exports = UserManagementService;