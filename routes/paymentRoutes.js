const express = require('express');
const paymentController = require('../controllers/paymentController');
const webhookController = require('../controllers/webhookController');
const auth = require('../middleware/auth');
const role = require('../middleware/role');
const { paymentLimiter, validatePaymentAmount, pciHeaders, verifyRazorpayWebhook, verifyStripeWebhook } = require('../middleware/paymentSecurity');

const router = express.Router();

// Webhook endpoints (no auth required)
router.post('/webhook/razorpay', express.raw({ type: 'application/json' }), verifyRazorpayWebhook, webhookController.handleRazorpayWebhook);
router.post('/webhook/stripe', express.raw({ type: 'application/json' }), verifyStripeWebhook, webhookController.handleStripeWebhook);

// Apply payment security middleware
router.use(pciHeaders);
router.use(paymentLimiter);

// Initiate payment for completed ride
router.post('/initiate', auth, role(['user']), paymentController.initiatePayment);

// Initiate payment with validation (backup)
router.post('/initiate-validated', auth, role(['user']), validatePaymentAmount, paymentController.initiatePayment);

// Verify and complete payment
router.post('/:paymentId/verify', auth, role(['user']), paymentController.verifyPayment);

// Verify Stripe session
router.post('/verify-stripe-session', auth, role(['user']), paymentController.verifyStripeSession);

// Get payment details
router.get('/:paymentId', auth, role(['user', 'admin']), paymentController.getPayment);

// Get user's payment history
router.get('/user/history', auth, role(['user']), paymentController.getPaymentHistory);

// Process refund (admin only)
router.post('/:paymentId/refund', auth, role(['admin']), role.auditLog('payment_refund', 'payment'), paymentController.processRefund);

// Get payment analytics (admin only)
router.get('/admin/analytics', auth, role(['admin']), paymentController.getPaymentAnalytics);

// Test endpoint to check payment initiation
router.post('/test-initiate', auth, async (req, res) => {
    try {
        const { rideId } = req.body;
        const Ride = require('../models/Ride');
        
        const ride = await Ride.findById(rideId).populate('user_id', 'name email phone');
        
        res.json({
            success: true,
            ride: ride ? {
                id: ride._id,
                status: ride.status,
                payment_status: ride.payment_status,
                user_id: ride.user_id?._id,
                user_name: ride.user_id?.name,
                fare: ride.fare
            } : null,
            requestUserId: req.user.id,
            canPay: ride && ride.user_id._id.toString() === req.user.id && ride.status === 'completed'
        });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Simple payment test without validation
router.post('/test-payment', auth, async (req, res) => {
    try {
        const { rideId, amount, paymentMethod } = req.body;
        console.log('Test payment request:', { rideId, amount, paymentMethod, userId: req.user.id });
        
        res.json({
            success: true,
            message: 'Test payment endpoint working',
            data: { rideId, amount, paymentMethod, userId: req.user.id }
        });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Minimal payment initiate without any middleware
router.post('/initiate-simple', async (req, res) => {
    console.log('Simple payment initiate called');
    console.log('Request body:', req.body);
    res.json({ success: true, message: 'Simple endpoint working' });
});

module.exports = router;