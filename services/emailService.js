const nodemailer = require('nodemailer');
const logger = require('../utils/logger');

class EmailService {
    constructor() {
        this.transporter = nodemailer.createTransport({
            host: 'smtp.gmail.com',
            port: 587,
            secure: false,
            auth: {
                user: process.env.EMAIL_USER,
                pass: process.env.EMAIL_PASS
            },
            tls: {
                rejectUnauthorized: false
            }
        });
    }

    async sendMarketingEmail(to, subject, content) {
        try {
            console.log('=== EMAIL SERVICE SEND ===');
            console.log('To:', to);
            console.log('Subject:', subject);
            console.log('From:', process.env.EMAIL_USER);
            console.log('Transporter configured:', !!this.transporter);
            
            const result = await this.transporter.sendMail({
                from: process.env.EMAIL_USER,
                to,
                subject,
                html: content
            });
            
            console.log('✅ Email sent successfully:', result.messageId);
            return true;
        } catch (error) {
            console.error('❌ Email send failed:', error.message);
            console.error('Error code:', error.code);
            console.error('Error response:', error.response);
            console.error('Full error:', error);
            return false;
        }
    }

    async sendWelcomeEmail(user, role = 'user') {
        try {
            const template = this.getWelcomeTemplate(user.name, role);
            const subject = role === 'driver' ? 'Welcome to UrbanFleet - Driver Portal!' : 'Welcome to UrbanFleet!';
            return await this.sendMarketingEmail(user.email, subject, template);
        } catch (error) {
            logger.error('Failed to send welcome email:', error);
            return false;
        }
    }

    getWelcomeTemplate(userName, role) {
        if (role === 'driver') {
            return `
                <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; max-width: 650px; margin: 0 auto; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); border-radius: 20px; overflow: hidden; box-shadow: 0 20px 40px rgba(0,0,0,0.1);">
                    <div style="background: white; margin: 3px; border-radius: 18px; overflow: hidden;">
                        <div style="background: linear-gradient(135deg, #48bb78 0%, #38a169 100%); padding: 40px 30px; text-align: center; color: white;">
                            <div style="font-size: 60px; margin-bottom: 10px;">🚕</div>
                            <h1 style="margin: 0; font-size: 28px; font-weight: 700;">Welcome to UrbanFleet!</h1>
                            <p style="margin: 10px 0 0 0; font-size: 18px; opacity: 0.9;">Driver Partner Program</p>
                        </div>
                        
                        <div style="padding: 40px 30px;">
                            <h2 style="color: #2d3748; margin: 0 0 20px 0; font-size: 24px;">🎉 Congratulations, ${userName}!</h2>
                            <p style="color: #4a5568; font-size: 16px; line-height: 1.6; margin-bottom: 25px;">You're now part of our elite driver community! Get ready to earn while providing exceptional service.</p>
                            
                            <div style="background: linear-gradient(135deg, #e6fffa 0%, #b2f5ea 100%); border-radius: 15px; padding: 25px; margin: 25px 0; border-left: 5px solid #48bb78;">
                                <h3 style="color: #2d3748; margin: 0 0 15px 0; font-size: 18px;">🚀 Your Driver Benefits:</h3>
                                <div style="display: flex; flex-wrap: wrap; gap: 15px;">
                                    <div style="flex: 1; min-width: 200px;">
                                        <div style="background: white; padding: 15px; border-radius: 10px; text-align: center; box-shadow: 0 2px 10px rgba(0,0,0,0.05);">
                                            <div style="font-size: 24px; margin-bottom: 8px;">💰</div>
                                            <p style="margin: 0; color: #2d3748; font-weight: 600;">Instant Earnings</p>
                                            <p style="margin: 5px 0 0 0; color: #718096; font-size: 14px;">Get paid after each ride</p>
                                        </div>
                                    </div>
                                    <div style="flex: 1; min-width: 200px;">
                                        <div style="background: white; padding: 15px; border-radius: 10px; text-align: center; box-shadow: 0 2px 10px rgba(0,0,0,0.05);">
                                            <div style="font-size: 24px; margin-bottom: 8px;">📱</div>
                                            <p style="margin: 0; color: #2d3748; font-weight: 600;">Smart Dashboard</p>
                                            <p style="margin: 5px 0 0 0; color: #718096; font-size: 14px;">Track performance & earnings</p>
                                        </div>
                                    </div>
                                </div>
                            </div>
                            
                            <div style="background: linear-gradient(135deg, #fed7d7 0%, #feb2b2 100%); border-radius: 15px; padding: 20px; text-align: center; margin: 25px 0;">
                                <h3 style="color: #c53030; margin: 0 0 10px 0; font-size: 20px;">🎁 Welcome Bonus!</h3>
                                <p style="color: #2d3748; font-size: 18px; font-weight: 700; margin: 0;">Earn ₹500 extra on your first 5 rides!</p>
                                <p style="color: #718096; font-size: 14px; margin: 10px 0 0 0;">Use code: <strong>DRIVER500</strong></p>
                            </div>
                            
                            <div style="text-align: center; margin: 30px 0;">
                                <a href="${process.env.FRONTEND_URL || 'https://app.urbanfleet.com'}/driver/dashboard" 
                                   style="background: linear-gradient(135deg, #48bb78 0%, #38a169 100%); color: white; padding: 15px 30px; text-decoration: none; border-radius: 50px; display: inline-block; font-weight: 700; font-size: 16px; box-shadow: 0 10px 20px rgba(72, 187, 120, 0.3); transition: all 0.3s ease;">
                                    🚀 Start Driving Now
                                </a>
                            </div>
                            
                            <div style="border-top: 2px solid #e2e8f0; margin-top: 30px; padding-top: 20px; text-align: center;">
                                <p style="color: #718096; font-size: 14px; margin: 0;">Need help? Contact us at <a href="mailto:driver-support@urbanfleet.com" style="color: #48bb78;">driver-support@urbanfleet.com</a></p>
                                <p style="color: #a0aec0; font-size: 12px; margin: 10px 0 0 0;">Happy driving! 🚗💨</p>
                            </div>
                        </div>
                    </div>
                </div>
            `;
        }
        
        return `
            <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; max-width: 650px; margin: 0 auto; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); border-radius: 20px; overflow: hidden; box-shadow: 0 20px 40px rgba(0,0,0,0.1);">
                <div style="background: white; margin: 3px; border-radius: 18px; overflow: hidden;">
                    <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 40px 30px; text-align: center; color: white;">
                        <div style="font-size: 60px; margin-bottom: 10px;">🚗</div>
                        <h1 style="margin: 0; font-size: 28px; font-weight: 700;">Welcome to UrbanFleet!</h1>
                        <p style="margin: 10px 0 0 0; font-size: 18px; opacity: 0.9;">Premium Car Rental Experience</p>
                    </div>
                    
                    <div style="padding: 40px 30px;">
                        <h2 style="color: #2d3748; margin: 0 0 20px 0; font-size: 24px;">🎉 Hello, ${userName}!</h2>
                        <p style="color: #4a5568; font-size: 16px; line-height: 1.6; margin-bottom: 25px;">Thank you for joining our premium car rental service! Get ready for seamless, luxury travel experiences.</p>
                        
                        <div style="background: linear-gradient(135deg, #e6f3ff 0%, #cce7ff 100%); border-radius: 15px; padding: 25px; margin: 25px 0; border-left: 5px solid #667eea;">
                            <h3 style="color: #2d3748; margin: 0 0 15px 0; font-size: 18px;">✨ What You Can Do:</h3>
                            <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 15px;">
                                <div style="background: white; padding: 15px; border-radius: 10px; text-align: center; box-shadow: 0 2px 10px rgba(0,0,0,0.05);">
                                    <div style="font-size: 24px; margin-bottom: 8px;">⚡</div>
                                    <p style="margin: 0; color: #2d3748; font-weight: 600;">Instant Booking</p>
                                    <p style="margin: 5px 0 0 0; color: #718096; font-size: 14px;">Book rides in seconds</p>
                                </div>
                                <div style="background: white; padding: 15px; border-radius: 10px; text-align: center; box-shadow: 0 2px 10px rgba(0,0,0,0.05);">
                                    <div style="font-size: 24px; margin-bottom: 8px;">🏎️</div>
                                    <p style="margin: 0; color: #2d3748; font-weight: 600;">Luxury Fleet</p>
                                    <p style="margin: 5px 0 0 0; color: #718096; font-size: 14px;">Premium vehicles</p>
                                </div>
                                <div style="background: white; padding: 15px; border-radius: 10px; text-align: center; box-shadow: 0 2px 10px rgba(0,0,0,0.05);">
                                    <div style="font-size: 24px; margin-bottom: 8px;">📍</div>
                                    <p style="margin: 0; color: #2d3748; font-weight: 600;">Live Tracking</p>
                                    <p style="margin: 5px 0 0 0; color: #718096; font-size: 14px;">Real-time updates</p>
                                </div>
                            </div>
                        </div>
                        
                        <div style="background: linear-gradient(135deg, #fef5e7 0%, #fed7aa 100%); border-radius: 15px; padding: 20px; text-align: center; margin: 25px 0;">
                            <h3 style="color: #c05621; margin: 0 0 10px 0; font-size: 20px;">🎁 Welcome Offer!</h3>
                            <p style="color: #2d3748; font-size: 18px; font-weight: 700; margin: 0;">Get 25% OFF your first ride!</p>
                            <div style="background: white; display: inline-block; padding: 10px 20px; border-radius: 25px; margin: 15px 0; border: 2px dashed #c05621;">
                                <p style="color: #c05621; font-size: 16px; font-weight: 700; margin: 0;">Code: WELCOME25</p>
                            </div>
                            <p style="color: #718096; font-size: 14px; margin: 0;">Valid for 7 days</p>
                        </div>
                        
                        <div style="text-align: center; margin: 30px 0;">
                            <a href="${process.env.FRONTEND_URL || 'https://app.urbanfleet.com'}/book-ride" 
                               style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 15px 30px; text-decoration: none; border-radius: 50px; display: inline-block; font-weight: 700; font-size: 16px; box-shadow: 0 10px 20px rgba(102, 126, 234, 0.3); transition: all 0.3s ease;">
                                🚀 Book Your First Ride
                            </a>
                        </div>
                        
                        <div style="border-top: 2px solid #e2e8f0; margin-top: 30px; padding-top: 20px; text-align: center;">
                            <p style="color: #718096; font-size: 14px; margin: 0;">Need assistance? We're here 24/7 at <a href="mailto:support@urbanfleet.com" style="color: #667eea;">support@urbanfleet.com</a></p>
                            <p style="color: #a0aec0; font-size: 12px; margin: 10px 0 0 0;">Happy riding! 🌟</p>
                        </div>
                    </div>
                </div>
            </div>
        `;
    }

    getMarketingTemplate(userName, offerType) {
        const templates = {
            welcome: `
                <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; max-width: 600px; margin: 0 auto; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); border-radius: 15px; overflow: hidden;">
                    <div style="background: white; margin: 2px; border-radius: 13px;">
                        <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 30px; text-align: center; color: white;">
                            <div style="font-size: 50px; margin-bottom: 10px;">🎉</div>
                            <h2 style="margin: 0; font-size: 24px;">Welcome to UrbanFleet, ${userName}!</h2>
                        </div>
                        <div style="padding: 30px; text-align: center;">
                            <p style="color: #4a5568; font-size: 16px; margin-bottom: 20px;">Start your premium journey with us!</p>
                            <div style="background: linear-gradient(135deg, #fef5e7 0%, #fed7aa 100%); padding: 20px; border-radius: 10px; margin: 20px 0;">
                                <p style="color: #c05621; font-size: 18px; font-weight: 700; margin: 0;">20% OFF First Ride</p>
                                <p style="color: #2d3748; font-weight: 600; margin: 10px 0;">Code: WELCOME20</p>
                            </div>
                        </div>
                    </div>
                </div>
            `,
            weekend: `
                <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; max-width: 600px; margin: 0 auto; background: linear-gradient(135deg, #48bb78 0%, #38a169 100%); border-radius: 15px; overflow: hidden;">
                    <div style="background: white; margin: 2px; border-radius: 13px;">
                        <div style="background: linear-gradient(135deg, #48bb78 0%, #38a169 100%); padding: 30px; text-align: center; color: white;">
                            <div style="font-size: 50px; margin-bottom: 10px;">🌟</div>
                            <h2 style="margin: 0; font-size: 24px;">Weekend Special, ${userName}!</h2>
                        </div>
                        <div style="padding: 30px; text-align: center;">
                            <p style="color: #4a5568; font-size: 16px; margin-bottom: 20px;">Make your weekend rides more affordable!</p>
                            <div style="background: linear-gradient(135deg, #e6fffa 0%, #b2f5ea 100%); padding: 20px; border-radius: 10px; margin: 20px 0;">
                                <p style="color: #2d5016; font-size: 18px; font-weight: 700; margin: 0;">15% OFF Weekend Rides</p>
                                <p style="color: #2d3748; font-weight: 600; margin: 10px 0;">Code: WEEKEND15</p>
                            </div>
                        </div>
                    </div>
                </div>
            `,
            loyalty: `
                <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; max-width: 600px; margin: 0 auto; background: linear-gradient(135deg, #ed8936 0%, #dd6b20 100%); border-radius: 15px; overflow: hidden;">
                    <div style="background: white; margin: 2px; border-radius: 13px;">
                        <div style="background: linear-gradient(135deg, #ed8936 0%, #dd6b20 100%); padding: 30px; text-align: center; color: white;">
                            <div style="font-size: 50px; margin-bottom: 10px;">💎</div>
                            <h2 style="margin: 0; font-size: 24px;">Thank you, ${userName}!</h2>
                        </div>
                        <div style="padding: 30px; text-align: center;">
                            <p style="color: #4a5568; font-size: 16px; margin-bottom: 20px;">As our valued customer, enjoy exclusive benefits!</p>
                            <div style="background: linear-gradient(135deg, #fef5e7 0%, #fed7aa 100%); padding: 20px; border-radius: 10px; margin: 20px 0;">
                                <p style="color: #c05621; font-size: 18px; font-weight: 700; margin: 0;">25% OFF Next Booking</p>
                                <p style="color: #2d3748; font-weight: 600; margin: 10px 0;">Code: LOYAL25</p>
                            </div>
                        </div>
                    </div>
                </div>
            `
        };
        return templates[offerType] || templates.welcome;
    }

    async sendVerificationEmail(email, code) {
        const template = `
            <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; max-width: 600px; margin: 0 auto; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); border-radius: 15px; overflow: hidden;">
                <div style="background: white; margin: 2px; border-radius: 13px;">
                    <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 30px; text-align: center; color: white;">
                        <div style="font-size: 50px; margin-bottom: 10px;">🔐</div>
                        <h2 style="margin: 0; font-size: 24px;">Email Verification</h2>
                        <p style="margin: 10px 0 0 0; opacity: 0.9;">Secure your account</p>
                    </div>
                    <div style="padding: 40px 30px; text-align: center;">
                        <p style="color: #4a5568; font-size: 16px; margin-bottom: 25px;">Enter this verification code to complete your registration:</p>
                        <div style="background: linear-gradient(135deg, #e6f3ff 0%, #cce7ff 100%); padding: 25px; border-radius: 15px; margin: 25px 0; border: 3px solid #667eea;">
                            <p style="color: #2d3748; font-size: 14px; margin: 0 0 10px 0; text-transform: uppercase; letter-spacing: 1px;">Verification Code</p>
                            <div style="font-size: 32px; font-weight: 700; color: #667eea; letter-spacing: 8px; font-family: 'Courier New', monospace;">
                                ${code}
                            </div>
                        </div>
                        <div style="background: #fff5f5; border-left: 4px solid #fc8181; padding: 15px; border-radius: 8px; margin: 25px 0;">
                            <p style="color: #c53030; font-size: 14px; margin: 0; font-weight: 600;">⏰ Expires in 10 minutes</p>
                            <p style="color: #718096; font-size: 13px; margin: 5px 0 0 0;">For security reasons, this code will expire soon</p>
                        </div>
                        <p style="color: #718096; font-size: 14px; margin: 20px 0 0 0;">Didn't request this? You can safely ignore this email.</p>
                    </div>
                </div>
            </div>
        `;
        return await this.sendMarketingEmail(email, '🔐 Verify Your Email - UrbanFleet', template);
    }

    async sendSecurityAlert(email, alertData) {
        const template = `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
                <h2 style="color: #e53e3e;">🚨 Security Alert</h2>
                <p>We detected a suspicious login attempt on your account:</p>
                <div style="background: #fed7d7; padding: 15px; border-radius: 8px; margin: 20px 0;">
                    <p><strong>IP Address:</strong> ${alertData.ip}</p>
                    <p><strong>Device:</strong> ${alertData.device}</p>
                    <p><strong>Time:</strong> ${alertData.timestamp.toLocaleString()}</p>
                </div>
                <p>If this was you, you can safely ignore this email. If not, please:</p>
                <ul>
                    <li>Change your password immediately</li>
                    <li>Enable two-factor authentication</li>
                    <li>Review your recent login activity</li>
                </ul>
                <p>Stay safe!</p>
            </div>
        `;
        return await this.sendMarketingEmail(email, 'Security Alert - Suspicious Login Detected', template);
    }

    async sendPasswordResetEmail(email, resetToken) {
        const template = `
            <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; max-width: 600px; margin: 0 auto; background: linear-gradient(135deg, #fc8181 0%, #f56565 100%); border-radius: 15px; overflow: hidden;">
                <div style="background: white; margin: 2px; border-radius: 13px;">
                    <div style="background: linear-gradient(135deg, #fc8181 0%, #f56565 100%); padding: 30px; text-align: center; color: white;">
                        <div style="font-size: 50px; margin-bottom: 10px;">🔑</div>
                        <h2 style="margin: 0; font-size: 24px;">Password Reset Request</h2>
                        <p style="margin: 10px 0 0 0; opacity: 0.9;">Secure your account</p>
                    </div>
                    <div style="padding: 40px 30px;">
                        <p style="color: #4a5568; font-size: 16px; line-height: 1.6; margin-bottom: 25px;">We received a request to reset your password. Click the button below to create a new password:</p>
                        
                        <div style="text-align: center; margin: 30px 0;">
                            <a href="${process.env.FRONTEND_URL}/reset-password?token=${resetToken}" 
                               style="background: linear-gradient(135deg, #fc8181 0%, #f56565 100%); color: white; padding: 15px 30px; text-decoration: none; border-radius: 50px; display: inline-block; font-weight: 700; font-size: 16px; box-shadow: 0 10px 20px rgba(252, 129, 129, 0.3); transition: all 0.3s ease;">
                                🔐 Reset My Password
                            </a>
                        </div>
                        
                        <div style="background: #fff5f5; border-left: 4px solid #fc8181; padding: 15px; border-radius: 8px; margin: 25px 0;">
                            <p style="color: #c53030; font-size: 14px; margin: 0; font-weight: 600;">⏰ Link expires in 1 hour</p>
                            <p style="color: #718096; font-size: 13px; margin: 5px 0 0 0;">For security, this reset link has a limited validity</p>
                        </div>
                        
                        <div style="background: #f7fafc; padding: 20px; border-radius: 10px; margin: 25px 0;">
                            <p style="color: #2d3748; font-size: 14px; margin: 0; font-weight: 600;">🛡️ Security Tips:</p>
                            <ul style="color: #718096; font-size: 13px; margin: 10px 0 0 0; padding-left: 20px;">
                                <li>Use a strong, unique password</li>
                                <li>Don't share your password with anyone</li>
                                <li>Enable two-factor authentication</li>
                            </ul>
                        </div>
                        
                        <p style="color: #718096; font-size: 14px; margin: 20px 0 0 0; text-align: center;">Didn't request this reset? You can safely ignore this email.</p>
                    </div>
                </div>
            </div>
        `;
        return await this.sendMarketingEmail(email, '🔑 Reset Your Password - UrbanFleet', template);
    }

    async sendDriverSuspensionEmail(driver, suspensionData) {
        const { reason, suspensionType, suspensionEndDate } = suspensionData;
        const endDateText = suspensionType === 'permanent' ? 'permanently' : 
            suspensionEndDate ? `until ${new Date(suspensionEndDate).toLocaleDateString()}` : 'temporarily';
        
        const template = `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f9f9f9;">
                <div style="background: white; padding: 30px; border-radius: 10px; box-shadow: 0 2px 10px rgba(0,0,0,0.1);">
                    <div style="text-align: center; margin-bottom: 30px;">
                        <h1 style="color: #2d3748; margin: 0;">UrbanFleet</h1>
                        <p style="color: #718096; margin: 5px 0 0 0;">Driver Portal</p>
                    </div>
                    
                    <h2 style="color: #e53e3e; text-align: center; margin-bottom: 20px;">Account Suspension Notice</h2>
                    
                    <p style="color: #2d3748; font-size: 16px; line-height: 1.6;">Dear ${driver.name},</p>
                    
                    <p style="color: #2d3748; font-size: 16px; line-height: 1.6;">
                        We hope this message finds you well. We are writing to inform you that your driver account has been ${endDateText} suspended from our platform.
                    </p>
                    
                    <div style="background: #fed7d7; border-left: 4px solid #e53e3e; padding: 15px; margin: 20px 0; border-radius: 4px;">
                        <p style="margin: 0; color: #2d3748; font-weight: bold;">Reason for Suspension:</p>
                        <p style="margin: 5px 0 0 0; color: #2d3748;">${reason}</p>
                        ${suspensionEndDate ? `<p style="margin: 10px 0 0 0; color: #2d3748;"><strong>Suspension Period:</strong> Until ${new Date(suspensionEndDate).toLocaleDateString()}</p>` : ''}
                    </div>
                    
                    <p style="color: #2d3748; font-size: 16px; line-height: 1.6;">
                        We understand this may be disappointing, and we want to assure you that this decision was made after careful consideration. 
                        Our primary goal is to maintain a safe and reliable service for all users.
                    </p>
                    
                    <div style="background: #e6fffa; border-left: 4px solid #38b2ac; padding: 15px; margin: 20px 0; border-radius: 4px;">
                        <p style="margin: 0; color: #2d3748; font-weight: bold;">What happens next:</p>
                        <ul style="margin: 10px 0 0 0; color: #2d3748; padding-left: 20px;">
                            <li>Your account access is temporarily restricted</li>
                            <li>You will not be able to accept new ride requests</li>
                            <li>Any pending rides will be handled appropriately</li>
                            ${suspensionType === 'temporary' ? '<li>You can appeal this decision by contacting our support team</li>' : ''}
                        </ul>
                    </div>
                    
                    ${suspensionType === 'temporary' ? `
                    <p style="color: #2d3748; font-size: 16px; line-height: 1.6;">
                        If you believe this suspension was issued in error or if you have additional information that might help resolve this matter, 
                        please don't hesitate to contact our support team. We are committed to fair and transparent processes.
                    </p>
                    ` : ''}
                    
                    <div style="text-align: center; margin: 30px 0;">
                        <a href="mailto:support@urbanfleet.com" 
                           style="background: #667eea; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block; font-weight: bold;">
                            Contact Support
                        </a>
                    </div>
                    
                    <p style="color: #2d3748; font-size: 16px; line-height: 1.6;">
                        We appreciate your understanding and cooperation. We value all our drivers and hope to resolve this matter promptly.
                    </p>
                    
                    <p style="color: #2d3748; font-size: 16px; line-height: 1.6;">
                        Thank you for your service to our community.
                    </p>
                    
                    <div style="border-top: 1px solid #e2e8f0; margin-top: 30px; padding-top: 20px; text-align: center;">
                        <p style="color: #718096; font-size: 14px; margin: 0;">Best regards,</p>
                        <p style="color: #2d3748; font-weight: bold; margin: 5px 0;">The UrbanFleet Team</p>
                        <p style="color: #718096; font-size: 12px; margin: 10px 0 0 0;">
                            This is an automated message. Please do not reply to this email.
                        </p>
                    </div>
                </div>
            </div>
        `;
        
        try {
            await this.sendMarketingEmail(driver.email, 'Important: Account Suspension Notice - UrbanFleet', template);
            return true;
        } catch (error) {
            logger.error('Failed to send suspension email:', error);
            return false;
        }
    }

    async sendRideConfirmationEmail(user, rideDetails, role = 'user') {
        const template = role === 'driver' ? this.getDriverRideTemplate(user, rideDetails) : this.getUserRideTemplate(user, rideDetails);
        const subject = role === 'driver' ? '🚗 New Ride Request - UrbanFleet' : '✅ Ride Confirmed - UrbanFleet';
        
        try {
            return await this.sendMarketingEmail(user.email, subject, template);
        } catch (error) {
            logger.error('Failed to send ride confirmation email:', error);
            return false;
        }
    }

    getUserRideTemplate(user, rideDetails) {
        return `
            <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; max-width: 650px; margin: 0 auto; background: linear-gradient(135deg, #48bb78 0%, #38a169 100%); border-radius: 15px; overflow: hidden;">
                <div style="background: white; margin: 2px; border-radius: 13px;">
                    <div style="background: linear-gradient(135deg, #48bb78 0%, #38a169 100%); padding: 30px; text-align: center; color: white;">
                        <div style="font-size: 50px; margin-bottom: 10px;">✅</div>
                        <h2 style="margin: 0; font-size: 24px;">Ride Confirmed!</h2>
                        <p style="margin: 10px 0 0 0; opacity: 0.9;">Your journey awaits</p>
                    </div>
                    <div style="padding: 30px;">
                        <h3 style="color: #2d3748; margin: 0 0 20px 0;">Hi ${user.name}! 👋</h3>
                        <p style="color: #4a5568; margin-bottom: 25px;">Great news! Your ride has been confirmed and your driver is on the way.</p>
                        
                        <div style="background: #f7fafc; border-radius: 12px; padding: 20px; margin: 20px 0;">
                            <h4 style="color: #2d3748; margin: 0 0 15px 0; font-size: 16px;">📍 Trip Details</h4>
                            <div style="display: grid; gap: 10px;">
                                <div style="display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid #e2e8f0;">
                                    <span style="color: #718096;">Pickup:</span>
                                    <span style="color: #2d3748; font-weight: 600;">${rideDetails.pickup || 'Your Location'}</span>
                                </div>
                                <div style="display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid #e2e8f0;">
                                    <span style="color: #718096;">Destination:</span>
                                    <span style="color: #2d3748; font-weight: 600;">${rideDetails.destination || 'Destination'}</span>
                                </div>
                                <div style="display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid #e2e8f0;">
                                    <span style="color: #718096;">Vehicle:</span>
                                    <span style="color: #2d3748; font-weight: 600;">${rideDetails.vehicleType || 'Economy'}</span>
                                </div>
                                <div style="display: flex; justify-content: space-between; padding: 8px 0;">
                                    <span style="color: #718096;">Fare:</span>
                                    <span style="color: #48bb78; font-weight: 700; font-size: 18px;">₹${rideDetails.fare || '0'}</span>
                                </div>
                            </div>
                        </div>
                        
                        <div style="text-align: center; margin: 25px 0;">
                            <a href="${process.env.FRONTEND_URL || 'https://app.urbanfleet.com'}/track-ride/${rideDetails.rideId || ''}" 
                               style="background: linear-gradient(135deg, #48bb78 0%, #38a169 100%); color: white; padding: 12px 25px; text-decoration: none; border-radius: 25px; display: inline-block; font-weight: 600; margin: 0 10px;">
                                📍 Track Live
                            </a>
                            <a href="tel:${rideDetails.driverPhone || ''}" 
                               style="background: #667eea; color: white; padding: 12px 25px; text-decoration: none; border-radius: 25px; display: inline-block; font-weight: 600; margin: 0 10px;">
                                📞 Call Driver
                            </a>
                        </div>
                        
                        <p style="color: #718096; font-size: 14px; text-align: center; margin: 20px 0 0 0;">Have a safe journey! 🚗✨</p>
                    </div>
                </div>
            </div>
        `;
    }

    getDriverRideTemplate(driver, rideDetails) {
        return `
            <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; max-width: 650px; margin: 0 auto; background: linear-gradient(135deg, #ed8936 0%, #dd6b20 100%); border-radius: 15px; overflow: hidden;">
                <div style="background: white; margin: 2px; border-radius: 13px;">
                    <div style="background: linear-gradient(135deg, #ed8936 0%, #dd6b20 100%); padding: 30px; text-align: center; color: white;">
                        <div style="font-size: 50px; margin-bottom: 10px;">🚗</div>
                        <h2 style="margin: 0; font-size: 24px;">New Ride Request!</h2>
                        <p style="margin: 10px 0 0 0; opacity: 0.9;">Earning opportunity</p>
                    </div>
                    <div style="padding: 30px;">
                        <h3 style="color: #2d3748; margin: 0 0 20px 0;">Hello ${driver.name}! 👋</h3>
                        <p style="color: #4a5568; margin-bottom: 25px;">You have a new ride request! Here are the trip details:</p>
                        
                        <div style="background: #fef5e7; border-radius: 12px; padding: 20px; margin: 20px 0; border-left: 4px solid #ed8936;">
                            <h4 style="color: #2d3748; margin: 0 0 15px 0; font-size: 16px;">📍 Trip Information</h4>
                            <div style="display: grid; gap: 10px;">
                                <div style="display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid #fed7aa;">
                                    <span style="color: #c05621;">Passenger:</span>
                                    <span style="color: #2d3748; font-weight: 600;">${rideDetails.passengerName || 'Customer'}</span>
                                </div>
                                <div style="display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid #fed7aa;">
                                    <span style="color: #c05621;">Pickup:</span>
                                    <span style="color: #2d3748; font-weight: 600;">${rideDetails.pickup || 'Pickup Location'}</span>
                                </div>
                                <div style="display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid #fed7aa;">
                                    <span style="color: #c05621;">Destination:</span>
                                    <span style="color: #2d3748; font-weight: 600;">${rideDetails.destination || 'Drop Location'}</span>
                                </div>
                                <div style="display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid #fed7aa;">
                                    <span style="color: #c05621;">Distance:</span>
                                    <span style="color: #2d3748; font-weight: 600;">${rideDetails.distance || '0'} km</span>
                                </div>
                                <div style="display: flex; justify-content: space-between; padding: 8px 0;">
                                    <span style="color: #c05621;">Earnings:</span>
                                    <span style="color: #38a169; font-weight: 700; font-size: 18px;">₹${rideDetails.driverEarnings || '0'}</span>
                                </div>
                            </div>
                        </div>
                        
                        <div style="text-align: center; margin: 25px 0;">
                            <a href="${process.env.FRONTEND_URL || 'https://app.urbanfleet.com'}/driver/ride/${rideDetails.rideId || ''}" 
                               style="background: linear-gradient(135deg, #48bb78 0%, #38a169 100%); color: white; padding: 15px 25px; text-decoration: none; border-radius: 25px; display: inline-block; font-weight: 700; margin: 0 10px; font-size: 16px;">
                                ✅ Accept Ride
                            </a>
                        </div>
                        
                        <div style="background: #e6fffa; padding: 15px; border-radius: 8px; margin: 20px 0;">
                            <p style="color: #2d5016; font-size: 14px; margin: 0; text-align: center;">
                                💰 <strong>Bonus:</strong> Complete this ride to maintain your 5-star rating streak!
                            </p>
                        </div>
                        
                        <p style="color: #718096; font-size: 14px; text-align: center; margin: 20px 0 0 0;">Drive safe and earn more! 🚗💪</p>
                    </div>
                </div>
            </div>
        `;
    }

    async sendAdminAlertEmail(adminEmail, alertData) {
        const template = `
            <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; max-width: 650px; margin: 0 auto; background: linear-gradient(135deg, #e53e3e 0%, #c53030 100%); border-radius: 15px; overflow: hidden;">
                <div style="background: white; margin: 2px; border-radius: 13px;">
                    <div style="background: linear-gradient(135deg, #e53e3e 0%, #c53030 100%); padding: 30px; text-align: center; color: white;">
                        <div style="font-size: 50px; margin-bottom: 10px;">🚨</div>
                        <h2 style="margin: 0; font-size: 24px;">System Alert</h2>
                        <p style="margin: 10px 0 0 0; opacity: 0.9;">Requires immediate attention</p>
                    </div>
                    <div style="padding: 30px;">
                        <h3 style="color: #2d3748; margin: 0 0 20px 0;">Admin Dashboard Alert 📊</h3>
                        <p style="color: #4a5568; margin-bottom: 25px;">The following system event requires your attention:</p>
                        
                        <div style="background: #fed7d7; border-radius: 12px; padding: 20px; margin: 20px 0; border-left: 4px solid #e53e3e;">
                            <h4 style="color: #c53030; margin: 0 0 15px 0; font-size: 16px;">⚠️ Alert Details</h4>
                            <div style="display: grid; gap: 10px;">
                                <div style="display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid #feb2b2;">
                                    <span style="color: #c53030;">Type:</span>
                                    <span style="color: #2d3748; font-weight: 600;">${alertData.type || 'System Alert'}</span>
                                </div>
                                <div style="display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid #feb2b2;">
                                    <span style="color: #c53030;">Priority:</span>
                                    <span style="color: #2d3748; font-weight: 600;">${alertData.priority || 'High'}</span>
                                </div>
                                <div style="display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid #feb2b2;">
                                    <span style="color: #c53030;">Time:</span>
                                    <span style="color: #2d3748; font-weight: 600;">${alertData.timestamp || new Date().toLocaleString()}</span>
                                </div>
                                <div style="padding: 8px 0;">
                                    <span style="color: #c53030;">Message:</span>
                                    <p style="color: #2d3748; font-weight: 600; margin: 5px 0 0 0;">${alertData.message || 'System requires attention'}</p>
                                </div>
                            </div>
                        </div>
                        
                        <div style="text-align: center; margin: 25px 0;">
                            <a href="${process.env.FRONTEND_URL || 'https://app.urbanfleet.com'}/admin/dashboard" 
                               style="background: linear-gradient(135deg, #e53e3e 0%, #c53030 100%); color: white; padding: 15px 25px; text-decoration: none; border-radius: 25px; display: inline-block; font-weight: 700; font-size: 16px;">
                                📊 View Dashboard
                            </a>
                        </div>
                        
                        <p style="color: #718096; font-size: 14px; text-align: center; margin: 20px 0 0 0;">This is an automated system alert. Please take appropriate action.</p>
                    </div>
                </div>
            </div>
        `;
        
        try {
            return await this.sendMarketingEmail(adminEmail, '🚨 System Alert - UrbanFleet Admin', template);
        } catch (error) {
            logger.error('Failed to send admin alert email:', error);
            return false;
        }
    }

    async sendDriverUnsuspensionEmail(driver) {
        const template = `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f9f9f9;">
                <div style="background: white; padding: 30px; border-radius: 10px; box-shadow: 0 2px 10px rgba(0,0,0,0.1);">
                    <div style="text-align: center; margin-bottom: 30px;">
                        <h1 style="color: #2d3748; margin: 0;">UrbanFleet</h1>
                        <p style="color: #718096; margin: 5px 0 0 0;">Driver Portal</p>
                    </div>
                    
                    <h2 style="color: #38a169; text-align: center; margin-bottom: 20px;">🎉 Account Reactivated!</h2>
                    
                    <p style="color: #2d3748; font-size: 16px; line-height: 1.6;">Dear ${driver.name},</p>
                    
                    <p style="color: #2d3748; font-size: 16px; line-height: 1.6;">
                        Great news! Your driver account has been successfully reactivated and you can now resume providing rides on our platform.
                    </p>
                    
                    <div style="background: #c6f6d5; border-left: 4px solid #38a169; padding: 15px; margin: 20px 0; border-radius: 4px;">
                        <p style="margin: 0; color: #2d3748; font-weight: bold;">✅ Your account is now active</p>
                        <p style="margin: 5px 0 0 0; color: #2d3748;">You can immediately start accepting ride requests</p>
                    </div>
                    
                    <div style="text-align: center; margin: 30px 0;">
                        <a href="${process.env.FRONTEND_URL || 'https://app.urbanfleet.com'}/driver/dashboard" 
                           style="background: #38a169; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block; font-weight: bold;">
                            Go to Dashboard
                        </a>
                    </div>
                    
                    <div style="border-top: 1px solid #e2e8f0; margin-top: 30px; padding-top: 20px; text-align: center;">
                        <p style="color: #718096; font-size: 14px; margin: 0;">Welcome back!</p>
                        <p style="color: #2d3748; font-weight: bold; margin: 5px 0;">The UrbanFleet Team</p>
                    </div>
                </div>
            </div>
        `;
        
        try {
            await this.sendMarketingEmail(driver.email, 'Welcome Back! Your Account Has Been Reactivated - UrbanFleet', template);
            return true;
        } catch (error) {
            logger.error('Failed to send unsuspension email:', error);
            return false;
        }
    }
    
    async sendPromotionalEmail(user, promoData, role = 'user') {
        const template = role === 'driver' ? this.getDriverPromoTemplate(user, promoData) : this.getUserPromoTemplate(user, promoData);
        const subject = role === 'driver' ? `💰 Exclusive Driver Bonus - ${promoData.title}` : `🎁 Special Offer - ${promoData.title}`;
        
        try {
            return await this.sendMarketingEmail(user.email, subject, template);
        } catch (error) {
            logger.error('Failed to send promotional email:', error);
            return false;
        }
    }

    getUserPromoTemplate(user, promoData) {
        return `
            <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; max-width: 650px; margin: 0 auto; background: linear-gradient(135deg, #9f7aea 0%, #805ad5 100%); border-radius: 15px; overflow: hidden;">
                <div style="background: white; margin: 2px; border-radius: 13px;">
                    <div style="background: linear-gradient(135deg, #9f7aea 0%, #805ad5 100%); padding: 30px; text-align: center; color: white;">
                        <div style="font-size: 50px; margin-bottom: 10px;">🎁</div>
                        <h2 style="margin: 0; font-size: 24px;">${promoData.title || 'Special Offer'}</h2>
                        <p style="margin: 10px 0 0 0; opacity: 0.9;">Limited time only</p>
                    </div>
                    <div style="padding: 30px; text-align: center;">
                        <h3 style="color: #2d3748; margin: 0 0 20px 0;">Hey ${user.name}! 🌟</h3>
                        <p style="color: #4a5568; margin-bottom: 25px; font-size: 16px;">${promoData.description || 'Don\'t miss out on this amazing deal!'}</p>
                        
                        <div style="background: linear-gradient(135deg, #faf5ff 0%, #e9d8fd 100%); border-radius: 15px; padding: 25px; margin: 25px 0; border: 2px solid #9f7aea;">
                            <div style="font-size: 36px; font-weight: 700; color: #9f7aea; margin-bottom: 10px;">${promoData.discount || '30%'} OFF</div>
                            <p style="color: #2d3748; font-size: 18px; font-weight: 600; margin: 0;">${promoData.subtitle || 'On your next ride'}</p>
                            <div style="background: white; display: inline-block; padding: 10px 20px; border-radius: 25px; margin: 15px 0; border: 2px dashed #9f7aea;">
                                <p style="color: #9f7aea; font-size: 16px; font-weight: 700; margin: 0;">Code: ${promoData.code || 'SAVE30'}</p>
                            </div>
                        </div>
                        
                        <div style="text-align: center; margin: 25px 0;">
                            <a href="${process.env.FRONTEND_URL || 'https://app.urbanfleet.com'}/book-ride?promo=${promoData.code || ''}" 
                               style="background: linear-gradient(135deg, #9f7aea 0%, #805ad5 100%); color: white; padding: 15px 30px; text-decoration: none; border-radius: 50px; display: inline-block; font-weight: 700; font-size: 16px; box-shadow: 0 10px 20px rgba(159, 122, 234, 0.3);">
                                🚀 Book Now
                            </a>
                        </div>
                        
                        <p style="color: #718096; font-size: 14px; margin: 20px 0 0 0;">Offer valid until ${promoData.validUntil || 'limited time'} ⏰</p>
                    </div>
                </div>
            </div>
        `;
    }

    getDriverPromoTemplate(driver, promoData) {
        return `
            <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; max-width: 650px; margin: 0 auto; background: linear-gradient(135deg, #38b2ac 0%, #319795 100%); border-radius: 15px; overflow: hidden;">
                <div style="background: white; margin: 2px; border-radius: 13px;">
                    <div style="background: linear-gradient(135deg, #38b2ac 0%, #319795 100%); padding: 30px; text-align: center; color: white;">
                        <div style="font-size: 50px; margin-bottom: 10px;">💰</div>
                        <h2 style="margin: 0; font-size: 24px;">${promoData.title || 'Driver Bonus'}</h2>
                        <p style="margin: 10px 0 0 0; opacity: 0.9;">Exclusive for drivers</p>
                    </div>
                    <div style="padding: 30px; text-align: center;">
                        <h3 style="color: #2d3748; margin: 0 0 20px 0;">Hello ${driver.name}! 🚗</h3>
                        <p style="color: #4a5568; margin-bottom: 25px; font-size: 16px;">${promoData.description || 'Boost your earnings with this exclusive driver bonus!'}</p>
                        
                        <div style="background: linear-gradient(135deg, #e6fffa 0%, #b2f5ea 100%); border-radius: 15px; padding: 25px; margin: 25px 0; border: 2px solid #38b2ac;">
                            <div style="font-size: 36px; font-weight: 700; color: #38b2ac; margin-bottom: 10px;">₹${promoData.bonusAmount || '500'}</div>
                            <p style="color: #2d3748; font-size: 18px; font-weight: 600; margin: 0;">${promoData.subtitle || 'Bonus per completed ride'}</p>
                            <p style="color: #718096; font-size: 14px; margin: 10px 0 0 0;">${promoData.condition || 'Complete 10 rides to unlock'}</p>
                        </div>
                        
                        <div style="text-align: center; margin: 25px 0;">
                            <a href="${process.env.FRONTEND_URL || 'https://app.urbanfleet.com'}/driver/dashboard" 
                               style="background: linear-gradient(135deg, #38b2ac 0%, #319795 100%); color: white; padding: 15px 30px; text-decoration: none; border-radius: 50px; display: inline-block; font-weight: 700; font-size: 16px; box-shadow: 0 10px 20px rgba(56, 178, 172, 0.3);">
                                💪 Start Earning
                            </a>
                        </div>
                        
                        <p style="color: #718096; font-size: 14px; margin: 20px 0 0 0;">Bonus valid until ${promoData.validUntil || 'end of month'} ⏰</p>
                    </div>
                </div>
            </div>
        `;
    }
}

module.exports = new EmailService();