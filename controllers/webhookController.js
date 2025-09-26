const Payment = require('../models/Payment');
const Ride = require('../models/Ride');

// Razorpay webhook handler
exports.handleRazorpayWebhook = async (req, res) => {
    try {
        const { event, payload } = req.body;
        
        switch (event) {
            case 'payment.captured':
                await handlePaymentCaptured(payload.payment.entity);
                break;
                
            case 'payment.failed':
                await handlePaymentFailed(payload.payment.entity);
                break;
                
            case 'refund.processed':
                await handleRefundProcessed(payload.refund.entity);
                break;
                
            default:
                console.log(`Unhandled Razorpay event: ${event}`);
        }
        
        res.status(200).json({ success: true });
    } catch (error) {
        console.error('Razorpay webhook error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
};

// Stripe webhook handler
exports.handleStripeWebhook = async (req, res) => {
    try {
        const { type, data } = req.body;
        
        switch (type) {
            case 'payment_intent.succeeded':
                await handleStripePaymentSucceeded(data.object);
                break;
                
            case 'payment_intent.payment_failed':
                await handleStripePaymentFailed(data.object);
                break;
                
            case 'charge.dispute.created':
                await handleStripeDispute(data.object);
                break;
                
            default:
                console.log(`Unhandled Stripe event: ${type}`);
        }
        
        res.status(200).json({ success: true });
    } catch (error) {
        console.error('Stripe webhook error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
};

// Helper functions
async function handlePaymentCaptured(paymentData) {
    const payment = await Payment.findOne({
        'gateway_details.order_id': paymentData.order_id
    });
    
    if (payment) {
        payment.status = 'completed';
        payment.gateway_details.payment_id = paymentData.id;
        payment.transaction_details.completed_at = new Date();
        await payment.save();
        
        // Update ride payment status
        await Ride.findByIdAndUpdate(payment.ride_id, {
            payment_status: 'paid',
            'payment_details.transaction_id': paymentData.id
        });
        
        console.log(`Payment completed: ${payment._id}`);
    }
}

async function handlePaymentFailed(paymentData) {
    const payment = await Payment.findOne({
        'gateway_details.order_id': paymentData.order_id
    });
    
    if (payment) {
        payment.status = 'failed';
        payment.transaction_details.failed_at = new Date();
        payment.transaction_details.failure_reason = paymentData.error_description;
        await payment.save();
        
        console.log(`Payment failed: ${payment._id}`);
    }
}

async function handleRefundProcessed(refundData) {
    const payment = await Payment.findOne({
        'gateway_details.payment_id': refundData.payment_id
    });
    
    if (payment) {
        payment.status = 'refunded';
        payment.transaction_details.refund_amount = refundData.amount / 100;
        payment.transaction_details.refunded_at = new Date();
        await payment.save();
        
        console.log(`Refund processed: ${payment._id}`);
    }
}

async function handleStripePaymentSucceeded(paymentIntent) {
    const payment = await Payment.findOne({
        'gateway_details.order_id': paymentIntent.id
    });
    
    if (payment) {
        payment.status = 'completed';
        payment.transaction_details.completed_at = new Date();
        await payment.save();
        
        await Ride.findByIdAndUpdate(payment.ride_id, {
            payment_status: 'paid',
            'payment_details.transaction_id': paymentIntent.id
        });
        
        console.log(`Stripe payment completed: ${payment._id}`);
    }
}

async function handleStripePaymentFailed(paymentIntent) {
    const payment = await Payment.findOne({
        'gateway_details.order_id': paymentIntent.id
    });
    
    if (payment) {
        payment.status = 'failed';
        payment.transaction_details.failed_at = new Date();
        payment.transaction_details.failure_reason = paymentIntent.last_payment_error?.message;
        await payment.save();
        
        console.log(`Stripe payment failed: ${payment._id}`);
    }
}

async function handleStripeDispute(dispute) {
    console.log(`Stripe dispute created: ${dispute.id}`);
    // Handle dispute logic here
}