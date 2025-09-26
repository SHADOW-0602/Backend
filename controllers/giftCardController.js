const GiftCard = require('../models/GiftCard');
const Razorpay = require('razorpay');
const crypto = require('crypto');

// Initialize Razorpay
const razorpay = new Razorpay({
    key_id: process.env.RAZORPAY_KEY_ID,
    key_secret: process.env.RAZORPAY_KEY_SECRET
});

// Initialize Stripe
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

// Create Razorpay order for gift card
exports.createRazorpayGiftCardOrder = async (req, res) => {
    try {
        const { amount, recipient_email, recipient_name } = req.body;
        
        if (!amount || amount < 1000) {
            return res.status(400).json({ success: false, error: 'Minimum amount is ₹10' });
        }
        
        const order = await razorpay.orders.create({
            amount: amount,
            currency: 'INR',
            receipt: `gift_${Date.now()}`,
            notes: {
                type: 'gift_card',
                recipient_email,
                recipient_name
            }
        });
        
        res.json({ success: true, order });
    } catch (error) {
        console.error('Razorpay order creation error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
};

// Verify Razorpay payment and create gift card
exports.verifyRazorpayGiftCard = async (req, res) => {
    try {
        const { razorpay_order_id, razorpay_payment_id, razorpay_signature, amount, recipient_email, recipient_name } = req.body;
        
        // Verify payment signature
        const body = razorpay_order_id + '|' + razorpay_payment_id;
        const expectedSignature = crypto
            .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
            .update(body.toString())
            .digest('hex');
        
        if (expectedSignature !== razorpay_signature) {
            return res.status(400).json({ success: false, error: 'Invalid payment signature' });
        }
        
        const giftCard = new GiftCard({
            amount: amount / 100,
            balance: amount / 100,
            purchaser_id: req.user ? req.user.id : 'anonymous',
            recipient_email,
            recipient_name,
            payment_id: razorpay_payment_id,
            payment_gateway: 'razorpay',
            expires_at: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000)
        });
        
        giftCard.generateCode();
        await giftCard.save();
        
        res.json({ success: true, giftCard });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
};

// Create Stripe checkout session for gift card
exports.createStripeGiftCardIntent = async (req, res) => {
    try {
        const { amount, recipient_email, recipient_name } = req.body;
        
        const session = await stripe.checkout.sessions.create({
            payment_method_types: ['card'],
            line_items: [{
                price_data: {
                    currency: 'usd',
                    product_data: {
                        name: 'Gift Card',
                        description: `Gift card for ${recipient_name}`
                    },
                    unit_amount: Math.round(amount * 100 / 83) // Convert INR to USD cents
                },
                quantity: 1
            }],
            mode: 'payment',
            success_url: `${process.env.FRONTEND_URL || 'http://localhost:3000'}/gift-cards?session_id={CHECKOUT_SESSION_ID}&success=true`,
            cancel_url: `${process.env.FRONTEND_URL || 'http://localhost:3000'}/gift-cards?cancelled=true`,
            metadata: {
                type: 'gift_card',
                recipient_email,
                recipient_name,
                original_amount: amount
            }
        });
        
        res.json({ 
            success: true, 
            session_id: session.id
        });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
};

// Confirm Stripe payment and create gift card
exports.confirmStripeGiftCard = async (req, res) => {
    try {
        const { session_id } = req.body;
        
        const session = await stripe.checkout.sessions.retrieve(session_id);
        
        if (session.payment_status !== 'paid') {
            return res.status(400).json({ success: false, error: 'Payment not completed' });
        }
        
        const giftCard = new GiftCard({
            amount: parseInt(session.metadata.original_amount),
            balance: parseInt(session.metadata.original_amount),
            purchaser_id: req.user ? req.user.id : 'anonymous',
            recipient_email: session.metadata.recipient_email,
            recipient_name: session.metadata.recipient_name,
            payment_id: session.id,
            payment_gateway: 'stripe',
            expires_at: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000)
        });
        
        giftCard.generateCode();
        await giftCard.save();
        
        res.json({ success: true, giftCard });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
};

// Create PayPal order for gift card
exports.createPayPalGiftCardOrder = async (req, res) => {
    try {
        const { amount, recipient_email, recipient_name } = req.body;
        
        // Convert INR to USD (approximate rate: 1 USD = 83 INR)
        const usdAmount = (amount / 83).toFixed(2);
        
        const PayPalService = require('../services/paypalService');
        const paypal = new PayPalService();
        
        const orderResult = await paypal.createOrder(usdAmount, 'USD');
        
        if (orderResult.success) {
            res.json({ 
                success: true, 
                order_id: orderResult.order_id,
                approval_url: orderResult.approval_url,
                usd_amount: usdAmount,
                inr_amount: amount
            });
        } else {
            res.status(400).json({ success: false, error: orderResult.error });
        }
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
};

// Capture PayPal payment and create gift card
exports.capturePayPalGiftCard = async (req, res) => {
    try {
        const { order_id, amount, recipient_email, recipient_name } = req.body;
        
        // Verify PayPal payment
        const PayPalService = require('../services/paypalService');
        const paypal = new PayPalService();
        
        const captureResult = await paypal.captureOrder(order_id);
        
        if (!captureResult.success) {
            return res.status(400).json({ success: false, error: 'Payment not completed or cancelled' });
        }
        
        const giftCard = new GiftCard({
            amount,
            balance: amount,
            purchaser_id: 'anonymous',
            recipient_email,
            recipient_name,
            payment_id: order_id,
            payment_gateway: 'paypal',
            expires_at: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000)
        });
        
        giftCard.generateCode();
        await giftCard.save();
        
        res.json({ success: true, giftCard });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
};

// Get user's gift cards
exports.getUserGiftCards = async (req, res) => {
    try {
        console.log('Getting gift cards for user:', req.user.id);
        
        const giftCards = await GiftCard.find({ purchaser_id: req.user.id })
            .sort({ createdAt: -1 });
        
        console.log('Found gift cards:', giftCards.length);
        res.json({ success: true, giftCards });
    } catch (error) {
        console.error('Get gift cards error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
};

// Apply gift card to ride
exports.applyGiftCard = async (req, res) => {
    try {
        const { code, amount } = req.body;
        
        const giftCard = await GiftCard.findOne({ code, status: 'active' });
        
        if (!giftCard) {
            return res.status(404).json({ success: false, error: 'Invalid gift card code' });
        }
        
        if (giftCard.balance < amount) {
            return res.status(400).json({ success: false, error: 'Insufficient gift card balance' });
        }
        
        if (giftCard.expires_at < new Date()) {
            return res.status(400).json({ success: false, error: 'Gift card has expired' });
        }
        
        giftCard.balance -= amount;
        giftCard.used_by.push({
            user_id: req.user.id,
            amount,
            used_at: new Date()
        });
        
        if (giftCard.balance === 0) {
            giftCard.status = 'used';
        }
        
        await giftCard.save();
        
        res.json({ success: true, remaining_balance: giftCard.balance });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
};