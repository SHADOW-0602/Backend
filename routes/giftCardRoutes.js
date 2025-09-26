const express = require('express');
const router = express.Router();
const giftCardController = require('../controllers/giftCardController');
const { cookieAuth: auth } = require('../middleware/cookieAuth');

// Razorpay routes
router.post('/razorpay/create-order', giftCardController.createRazorpayGiftCardOrder);
router.post('/razorpay/verify', giftCardController.verifyRazorpayGiftCard);

// Stripe routes
router.post('/stripe/create-intent', giftCardController.createStripeGiftCardIntent);
router.post('/stripe/confirm', giftCardController.confirmStripeGiftCard);

// PayPal routes
router.post('/paypal/create-order', giftCardController.createPayPalGiftCardOrder);
router.post('/paypal/capture', giftCardController.capturePayPalGiftCard);

// Gift card management
router.get('/my-cards', auth, giftCardController.getUserGiftCards);
router.post('/apply', auth, giftCardController.applyGiftCard);

module.exports = router;