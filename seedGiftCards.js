const mongoose = require('mongoose');
const GiftCard = require('./models/GiftCard');
const User = require('./models/User');
require('dotenv').config();

const seedGiftCards = async () => {
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        console.log('Connected to MongoDB');

        // Get first user as purchaser
        const user = await User.findOne();
        if (!user) {
            console.log('No users found. Please create a user first.');
            return;
        }

        const giftCards = [
            {
                code: 'GC50WELCOME',
                amount: 50,
                balance: 50,
                purchaser_id: user._id,
                recipient_email: 'user@example.com',
                recipient_name: 'John Doe',
                status: 'active',
                payment_id: 'pay_demo_001',
                payment_gateway: 'razorpay',
                expires_at: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000)
            },
            {
                code: 'GC100GIFT',
                amount: 100,
                balance: 75,
                purchaser_id: user._id,
                recipient_email: 'jane@example.com',
                recipient_name: 'Jane Smith',
                status: 'active',
                payment_id: 'pay_demo_002',
                payment_gateway: 'stripe',
                expires_at: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
                used_by: [{
                    user_id: user._id,
                    amount: 25,
                    used_at: new Date()
                }]
            },
            {
                code: 'GC200VIP',
                amount: 200,
                balance: 200,
                purchaser_id: user._id,
                recipient_email: 'vip@example.com',
                recipient_name: 'VIP Customer',
                status: 'active',
                payment_id: 'pay_demo_003',
                payment_gateway: 'paypal',
                expires_at: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000)
            },
            {
                code: 'GC25USED',
                amount: 25,
                balance: 0,
                purchaser_id: user._id,
                recipient_email: 'used@example.com',
                recipient_name: 'Used Card',
                status: 'used',
                payment_id: 'pay_demo_004',
                payment_gateway: 'razorpay',
                expires_at: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
                used_by: [{
                    user_id: user._id,
                    amount: 25,
                    used_at: new Date()
                }]
            }
        ];

        await GiftCard.deleteMany({});
        await GiftCard.insertMany(giftCards);
        
        console.log('✅ Gift cards seeded successfully:');
        giftCards.forEach(card => {
            console.log(`- ${card.code}: ₹${card.balance}/₹${card.amount} (${card.status})`);
        });

        process.exit(0);
    } catch (error) {
        console.error('Error seeding gift cards:', error);
        process.exit(1);
    }
};

seedGiftCards();