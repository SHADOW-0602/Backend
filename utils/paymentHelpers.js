// Payment utility functions

// Format currency for display
exports.formatCurrency = (amount, currency = 'INR') => {
    const formatters = {
        INR: new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }),
        USD: new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }),
        EUR: new Intl.NumberFormat('en-EU', { style: 'currency', currency: 'EUR' })
    };
    
    return formatters[currency]?.format(amount) || `${currency} ${amount}`;
};

// Calculate payment processing fee
exports.calculateProcessingFee = (amount, paymentMethod) => {
    const feeRates = {
        razorpay: 0.02, // 2%
        stripe: 0.029, // 2.9%
        paypal: 0.035, // 3.5%
        wallet: 0, // No fee
        cash: 0 // No fee
    };
    
    const rate = feeRates[paymentMethod] || 0.02;
    return Math.round(amount * rate * 100) / 100;
};

// Generate payment receipt data
exports.generateReceiptData = (payment, ride, user) => {
    return {
        receipt_number: `RCP-${payment._id.toString().slice(-8).toUpperCase()}`,
        date: payment.transaction_details.completed_at || payment.createdAt,
        customer: {
            name: user.name,
            email: user.email,
            phone: user.phone
        },
        trip: {
            from: ride.pickup_location?.address,
            to: ride.drop_location?.address,
            distance: ride.distance,
            duration: ride.duration,
            date: ride.createdAt
        },
        payment: {
            method: payment.payment_method,
            amount: payment.amount,
            currency: payment.currency,
            transaction_id: payment.gateway_details.payment_id || payment.gateway_details.order_id,
            status: payment.status
        },
        processing_fee: this.calculateProcessingFee(payment.amount, payment.payment_method)
    };
};

// Validate payment method availability
exports.isPaymentMethodAvailable = (method) => {
    const availableMethods = {
        razorpay: !!process.env.RAZORPAY_KEY_ID,
        stripe: !!process.env.STRIPE_SECRET_KEY,
        paypal: !!process.env.PAYPAL_CLIENT_ID,
        wallet: true, // Always available
        cash: true // Always available
    };
    
    return availableMethods[method] || false;
};

// Get supported payment methods
exports.getSupportedPaymentMethods = () => {
    const methods = [];
    
    if (process.env.RAZORPAY_KEY_ID) {
        methods.push({
            id: 'razorpay',
            name: 'Razorpay',
            description: 'Credit/Debit Cards, UPI, Net Banking',
            fee_rate: 0.02,
            currencies: ['INR']
        });
    }
    
    if (process.env.STRIPE_SECRET_KEY) {
        methods.push({
            id: 'stripe',
            name: 'Stripe',
            description: 'Credit/Debit Cards',
            fee_rate: 0.029,
            currencies: ['INR', 'USD', 'EUR']
        });
    }
    
    if (process.env.PAYPAL_CLIENT_ID) {
        methods.push({
            id: 'paypal',
            name: 'PayPal',
            description: 'PayPal Account',
            fee_rate: 0.035,
            currencies: ['USD', 'EUR']
        });
    }
    
    methods.push({
        id: 'wallet',
        name: 'Wallet',
        description: 'Digital Wallet Balance',
        fee_rate: 0,
        currencies: ['INR']
    });
    
    methods.push({
        id: 'cash',
        name: 'Cash',
        description: 'Pay with Cash',
        fee_rate: 0,
        currencies: ['INR']
    });
    
    return methods;
};

// Payment status messages
exports.getPaymentStatusMessage = (status) => {
    const messages = {
        pending: 'Payment is pending',
        processing: 'Payment is being processed',
        completed: 'Payment completed successfully',
        failed: 'Payment failed',
        refunded: 'Payment has been refunded',
        cancelled: 'Payment was cancelled'
    };
    
    return messages[status] || 'Unknown payment status';
};