// Service to interact with Razorpay API
const Razorpay = require('razorpay');

const razorpay = new Razorpay({
    key_id: process.env.RAZORPAY_KEY_ID,
    key_secret: process.env.RAZORPAY_KEY_SECRET
});

exports.createOrder = async (amount, currency = 'INR', notes = {}) => {
    try {
        const order = await razorpay.orders.create({
            amount: amount, // Amount should already be in paise
            currency,
            receipt: `receipt_${Date.now()}`,
            notes
        });
        return order;
    } catch (err) {
        throw new Error('Razorpay order creation failed: ' + err.message);
    }
};

exports.verifyPayment = (orderId, paymentId, signature) => {
    try {
        const crypto = require('crypto');
        const body = orderId + '|' + paymentId;
        const expectedSignature = crypto
            .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
            .update(body.toString())
            .digest('hex');
        return expectedSignature === signature;
    } catch (error) {
        console.error('Payment verification error:', error);
        return false;
    }
};