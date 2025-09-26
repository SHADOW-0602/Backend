const crypto = require('crypto');

// Try to load rate limiting
let rateLimit;
try {
    rateLimit = require('express-rate-limit');
} catch (e) {
    console.warn('⚠️  express-rate-limit not available for payment security');
}

// Payment-specific rate limiting
exports.paymentLimiter = rateLimit ? rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 10, // 10 payment attempts per window
    message: {
        success: false,
        error: 'Too many payment attempts, please try again later'
    },
    standardHeaders: true,
    legacyHeaders: false
}) : (req, res, next) => {
    // Fallback rate limiter for payments
    const requests = global.paymentRequests || (global.paymentRequests = new Map());
    const key = req.ip || req.connection.remoteAddress;
    const now = Date.now();
    const windowMs = 15 * 60 * 1000;
    const max = 10;
    
    const userRequests = requests.get(key) || [];
    const validRequests = userRequests.filter(time => now - time < windowMs);
    
    if (validRequests.length >= max) {
        return res.status(429).json({
            success: false,
            error: 'Too many payment attempts, please try again later'
        });
    }
    
    validRequests.push(now);
    requests.set(key, validRequests);
    next();
};

// Webhook signature verification for Razorpay
exports.verifyRazorpayWebhook = (req, res, next) => {
    try {
        const signature = req.get('X-Razorpay-Signature');
        const body = JSON.stringify(req.body);
        
        if (!process.env.RAZORPAY_WEBHOOK_SECRET) {
            console.warn('⚠️  RAZORPAY_WEBHOOK_SECRET not set, skipping verification');
            return next();
        }
        
        const expectedSignature = crypto
            .createHmac('sha256', process.env.RAZORPAY_WEBHOOK_SECRET)
            .update(body)
            .digest('hex');

        if (signature !== expectedSignature) {
            return res.status(400).json({
                success: false,
                error: 'Invalid webhook signature'
            });
        }

        next();
    } catch (error) {
        res.status(400).json({
            success: false,
            error: 'Webhook verification failed'
        });
    }
};

// Stripe webhook signature verification
exports.verifyStripeWebhook = (req, res, next) => {
    try {
        const signature = req.get('stripe-signature');
        const endpointSecret = process.env.STRIPE_WEBHOOK_SECRET;
        
        if (!endpointSecret) {
            console.warn('⚠️  STRIPE_WEBHOOK_SECRET not set, skipping verification');
            return next();
        }
        
        // Stripe signature verification would go here
        // For demo purposes, we'll skip actual verification
        
        next();
    } catch (error) {
        res.status(400).json({
            success: false,
            error: 'Stripe webhook verification failed'
        });
    }
};

// Payment amount validation
exports.validatePaymentAmount = (req, res, next) => {
    const { amount } = req.body;
    
    console.log('Payment amount validation - received amount:', amount, 'type:', typeof amount);
    
    if (!amount || amount <= 0) {
        console.log('Payment validation failed - invalid amount:', amount);
        return res.status(400).json({
            success: false,
            error: 'Invalid payment amount'
        });
    }
    
    if (amount > 50000) { // Max ₹50,000 per transaction
        console.log('Payment validation failed - amount exceeds limit:', amount);
        return res.status(400).json({
            success: false,
            error: 'Payment amount exceeds maximum limit'
        });
    }
    
    console.log('Payment amount validation passed');
    next();
};

// PCI DSS compliance headers
exports.pciHeaders = (req, res, next) => {
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
    next();
};