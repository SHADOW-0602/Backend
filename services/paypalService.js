const axios = require('axios');

class PayPalService {
    constructor() {
        this.clientId = process.env.PAYPAL_CLIENT_ID;
        this.clientSecret = process.env.PAYPAL_CLIENT_SECRET;
        this.mode = process.env.PAYPAL_MODE || 'sandbox';
        this.baseURL = this.mode === 'sandbox' 
            ? 'https://api-m.sandbox.paypal.com'
            : 'https://api-m.paypal.com';
    }

    async getAccessToken() {
        try {
            const auth = Buffer.from(`${this.clientId}:${this.clientSecret}`).toString('base64');
            
            const response = await axios.post(`${this.baseURL}/v1/oauth2/token`, 
                'grant_type=client_credentials',
                {
                    headers: {
                        'Authorization': `Basic ${auth}`,
                        'Content-Type': 'application/x-www-form-urlencoded'
                    }
                }
            );
            
            return response.data.access_token;
        } catch (error) {
            throw new Error(`PayPal authentication failed: ${error.message}`);
        }
    }

    async createOrder(amount, currency = 'USD') {
        try {
            const accessToken = await this.getAccessToken();
            
            const orderData = {
                intent: 'CAPTURE',
                purchase_units: [{
                    amount: {
                        currency_code: currency,
                        value: amount.toString()
                    }
                }],
                application_context: {
                    return_url: `${process.env.FRONTEND_URL || 'http://localhost:3000'}/payment/success`,
                    cancel_url: `${process.env.FRONTEND_URL || 'http://localhost:3000'}/payment/cancel`
                }
            };

            const response = await axios.post(`${this.baseURL}/v2/checkout/orders`, orderData, {
                headers: {
                    'Authorization': `Bearer ${accessToken}`,
                    'Content-Type': 'application/json'
                }
            });

            const order = response.data;
            const approvalUrl = order.links.find(link => link.rel === 'approve')?.href;

            return {
                success: true,
                order_id: order.id,
                approval_url: approvalUrl,
                amount,
                currency
            };
        } catch (error) {
            return {
                success: false,
                error: error.response?.data?.message || error.message
            };
        }
    }

    async captureOrder(orderId) {
        try {
            const accessToken = await this.getAccessToken();
            
            const response = await axios.post(
                `${this.baseURL}/v2/checkout/orders/${orderId}/capture`,
                {},
                {
                    headers: {
                        'Authorization': `Bearer ${accessToken}`,
                        'Content-Type': 'application/json'
                    }
                }
            );

            const captureData = response.data;
            
            return {
                success: captureData.status === 'COMPLETED',
                status: captureData.status,
                capture_id: captureData.purchase_units[0]?.payments?.captures[0]?.id,
                payer_id: captureData.payer?.payer_id
            };
        } catch (error) {
            return {
                success: false,
                error: error.response?.data?.message || error.message
            };
        }
    }

    async refundCapture(captureId, amount, currency = 'USD') {
        try {
            const accessToken = await this.getAccessToken();
            
            const refundData = {
                amount: {
                    currency_code: currency,
                    value: amount.toString()
                }
            };

            const response = await axios.post(
                `${this.baseURL}/v2/payments/captures/${captureId}/refund`,
                refundData,
                {
                    headers: {
                        'Authorization': `Bearer ${accessToken}`,
                        'Content-Type': 'application/json'
                    }
                }
            );

            return {
                success: true,
                refund_id: response.data.id,
                status: response.data.status,
                amount: response.data.amount.value
            };
        } catch (error) {
            return {
                success: false,
                error: error.response?.data?.message || error.message
            };
        }
    }
}

module.exports = PayPalService;