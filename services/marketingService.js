const User = require('../models/User');
const emailService = require('./emailService');
const cron = require('node-cron');

class MarketingService {
    constructor() {
        this.startScheduler();
    }

    startScheduler() {
        // Send weekly marketing emails every Monday at 9 AM
        cron.schedule('0 9 * * 1', () => {
            this.sendWeeklyMarketingEmails();
        });

        // Send weekend specials every Friday at 10 AM
        cron.schedule('0 10 * * 5', () => {
            this.sendWeekendSpecials();
        });

        // Send driver bonus emails every Wednesday at 2 PM
        cron.schedule('0 14 * * 3', () => {
            this.sendDriverBonusEmails();
        });
    }

    async sendWeeklyMarketingEmails() {
        try {
            const users = await User.find({
                'settings.marketingEmails': true,
                'settings.emailNotifications': true
            }).select('name email');

            for (const user of users) {
                const promoData = {
                    title: 'Weekly Special Offer',
                    description: 'Your weekly dose of savings is here! Enjoy exclusive discounts on all rides.',
                    discount: '25%',
                    subtitle: 'On all rides this week',
                    code: 'WEEKLY25',
                    validUntil: 'Sunday midnight'
                };
                await emailService.sendPromotionalEmail(user, promoData, 'user');
            }
            console.log(`📧 Enhanced marketing emails sent to ${users.length} users`);
        } catch (error) {
            console.error('Marketing email batch failed:', error);
        }
    }

    async sendWeekendSpecials() {
        try {
            const users = await User.find({
                'settings.marketingEmails': true,
                'settings.emailNotifications': true
            }).select('name email');

            for (const user of users) {
                const promoData = {
                    title: 'Weekend Getaway Special',
                    description: 'Make your weekend rides more affordable with our exclusive weekend discount!',
                    discount: '20%',
                    subtitle: 'On weekend rides',
                    code: 'WEEKEND20',
                    validUntil: 'Sunday 11:59 PM'
                };
                await emailService.sendPromotionalEmail(user, promoData, 'user');
            }
            console.log(`🎆 Enhanced weekend specials sent to ${users.length} users`);
        } catch (error) {
            console.error('Weekend specials batch failed:', error);
        }
    }

    async sendWelcomeEmail(user, role = 'user') {
        if (user.settings?.marketingEmails && user.settings?.emailNotifications) {
            await emailService.sendWelcomeEmail(user, role);
        }
    }

    async sendDriverBonusEmails() {
        try {
            const Driver = require('../models/Driver');
            const drivers = await Driver.find({
                status: 'active',
                'settings.emailNotifications': true
            }).select('name email');

            for (const driver of drivers) {
                const promoData = {
                    title: 'Driver Earnings Boost',
                    description: 'Complete more rides and earn bonus rewards! Your dedication deserves extra rewards.',
                    bonusAmount: '200',
                    subtitle: 'Extra bonus per ride',
                    condition: 'Complete 15 rides this week',
                    validUntil: 'end of this week'
                };
                await emailService.sendPromotionalEmail(driver, promoData, 'driver');
            }
            console.log(`🚗 Driver bonus emails sent to ${drivers.length} drivers`);
        } catch (error) {
            console.error('Driver bonus email batch failed:', error);
        }
    }
}

module.exports = new MarketingService();