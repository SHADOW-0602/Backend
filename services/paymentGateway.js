const Razorpay = require('razorpay');
const stripe = require('stripe');
const crypto = require('crypto');
const PayPalService = require('./paypalService');

class PaymentGateway {
    constructor() {
        // Initialize Razorpay
        this.razorpay = new Razorpay({
            key_id: process.env.RAZORPAY_KEY_ID,
            key_secret: process.env.RAZORPAY_KEY_SECRET
        });

        // Initialize Stripe
        this.stripe = stripe(process.env.STRIPE_SECRET_KEY);
        
        // Initialize PayPal
        this.paypal = new PayPalService();
    }

    // Razorpay Integration
    async createRazorpayOrder(amount, currency = 'INR', receipt) {
        try {
            console.log('Creating Razorpay order:', { amount, currency, receipt });
            console.log('Razorpay keys:', { key_id: process.env.RAZORPAY_KEY_ID, key_secret: process.env.RAZORPAY_KEY_SECRET ? 'SET' : 'NOT SET' });
            
            if (!process.env.RAZORPAY_KEY_ID || !process.env.RAZORPAY_KEY_SECRET) {
                throw new Error('Razorpay credentials not configured');
            }
            
            const options = {
                amount: amount * 100, // Convert to paise
                currency,
                receipt,
                payment_capture: 1
            };

            const order = await this.razorpay.orders.create(options);
            console.log('Razorpay order created:', order);
            
            return {
                success: true,
                order_id: order.id,
                amount: order.amount,
                currency: order.currency,
                key_id: process.env.RAZORPAY_KEY_ID
            };
        } catch (error) {
            console.error('Razorpay order creation failed:', error);
            return {
                success: false,
                error: error.message || 'Razorpay order creation failed'
            };
        }
    }

    async verifyRazorpayPayment(paymentId, orderId, signature) {
        try {
            const body = orderId + '|' + paymentId;
            const expectedSignature = crypto
                .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
                .update(body.toString())
                .digest('hex');

            return expectedSignature === signature;
        } catch (error) {
            return false;
        }
    }

    async getRazorpayPayment(paymentId) {
        try {
            return await this.razorpay.payments.fetch(paymentId);
        } catch (error) {
            throw new Error(`Razorpay payment fetch failed: ${error.message}`);
        }
    }

    // Stripe Integration
    async createStripeCheckoutSession(amount, currency = 'inr', metadata = {}) {
        try {
            const session = await this.stripe.checkout.sessions.create({
                payment_method_types: ['card'],
                line_items: [{
                    price_data: {
                        currency,
                        product_data: {
                            name: 'Ride Payment',
                            description: 'Car rental ride payment'
                        },
                        unit_amount: Math.round(amount * 100)
                    },
                    quantity: 1
                }],
                mode: 'payment',
                success_url: `${process.env.FRONTEND_URL || 'http://localhost:3000'}/payment-success?session_id={CHECKOUT_SESSION_ID}`,
                cancel_url: `${process.env.FRONTEND_URL || 'http://localhost:3000'}/payment-cancel`,
                metadata
            });

            return {
                success: true,
                session_id: session.id
            };
        } catch (error) {
            return {
                success: false,
                error: error.message
            };
        }
    }

    async confirmStripeSession(sessionId) {
        try {
            const session = await this.stripe.checkout.sessions.retrieve(sessionId);
            return {
                success: session.payment_status === 'paid',
                status: session.payment_status
            };
        } catch (error) {
            return {
                success: false,
                error: error.message
            };
        }
    }

    async confirmStripePayment(paymentIntentId) {
        try {
            const paymentIntent = await this.stripe.paymentIntents.retrieve(paymentIntentId);
            return {
                success: paymentIntent.status === 'succeeded',
                status: paymentIntent.status,
                payment_method: paymentIntent.payment_method
            };
        } catch (error) {
            return {
                success: false,
                error: error.message
            };
        }
    }

    // PayPal Integration
    async createPayPalOrder(amount, currency = 'USD') {
        try {
            return await this.paypal.createOrder(amount, currency);
        } catch (error) {
            return {
                success: false,
                error: error.message
            };
        }
    }

    async verifyPayPalPayment(orderId, payerId) {
        try {
            return await this.paypal.captureOrder(orderId);
        } catch (error) {
            return {
                success: false,
                error: error.message
            };
        }
    }

    // Refund Methods
    async processRefund(paymentMethod, paymentId, amount, reason = 'Customer request') {
        try {
            switch (paymentMethod) {
                case 'razorpay':
                    return await this.razorpayRefund(paymentId, amount, reason);
                case 'stripe':
                    return await this.stripeRefund(paymentId, amount, reason);
                case 'paypal':
                    return await this.paypalRefund(paymentId, amount, reason);
                default:
                    throw new Error('Unsupported payment method for refund');
            }
        } catch (error) {
            return {
                success: false,
                error: error.message
            };
        }
    }

    async razorpayRefund(paymentId, amount, reason) {
        try {
            const refund = await this.razorpay.payments.refund(paymentId, {
                amount: amount * 100,
                notes: { reason }
            });

            return {
                success: true,
                refund_id: refund.id,
                amount: refund.amount / 100,
                status: refund.status
            };
        } catch (error) {
            return {
                success: false,
                error: error.message
            };
        }
    }

    async stripeRefund(paymentIntentId, amount, reason) {
        try {
            const refund = await this.stripe.refunds.create({
                payment_intent: paymentIntentId,
                amount: amount * 100,
                reason: 'requested_by_customer',
                metadata: { reason }
            });

            return {
                success: true,
                refund_id: refund.id,
                amount: refund.amount / 100,
                status: refund.status
            };
        } catch (error) {
            return {
                success: false,
                error: error.message
            };
        }
    }

    async paypalRefund(captureId, amount, reason) {
        try {
            return await this.paypal.refundCapture(captureId, amount, 'USD');
        } catch (error) {
            return {
                success: false,
                error: error.message
            };
        }
    }
}

module.exports = PaymentGateway;