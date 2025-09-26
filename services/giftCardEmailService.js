const nodemailer = require('nodemailer');

const sendGiftCardEmail = async (giftCardData) => {
    try {
        const transporter = nodemailer.createTransport({
            host: process.env.EMAIL_HOST || 'smtp.gmail.com',
            port: process.env.EMAIL_PORT || 587,
            secure: false,
            auth: {
                user: process.env.EMAIL_USER,
                pass: process.env.EMAIL_PASS
            }
        });

        const mailOptions = {
            from: process.env.EMAIL_USER,
            to: giftCardData.recipientEmail,
            subject: '🎁 Your Car Rental Gift Card is Ready!',
            html: `
                <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                    <h2 style="color: #3b82f6;">🎁 Congratulations! You've received a Gift Card</h2>
                    <p>Dear ${giftCardData.recipientName},</p>
                    <p>You've received a gift card for our Car Rental Service!</p>
                    
                    <div style="background: #f8fafc; padding: 20px; border-radius: 8px; margin: 20px 0;">
                        <h3 style="margin: 0; color: #2d3748;">Gift Card Details:</h3>
                        <p><strong>Code:</strong> <span style="font-size: 18px; color: #3b82f6; font-weight: bold;">${giftCardData.giftCardCode}</span></p>
                        <p><strong>Amount:</strong> ₹${giftCardData.amount}</p>
                        <p><strong>Expires:</strong> ${new Date(giftCardData.expiryDate).toLocaleDateString()}</p>
                    </div>
                    
                    <p>Use this code during checkout to redeem your gift card value.</p>
                    <p>Thank you for choosing our service!</p>
                    
                    <hr style="margin: 30px 0;">
                    <p style="color: #64748b; font-size: 12px;">This is an automated email. Please do not reply.</p>
                </div>
            `
        };

        await transporter.sendMail(mailOptions);
        console.log('Gift card email sent successfully to:', giftCardData.recipientEmail);
        return true;
    } catch (error) {
        console.error('Error sending gift card email:', error);
        return false;
    }
};

module.exports = { sendGiftCardEmail };