const express = require('express');
const router = express.Router();
const nodemailer = require('nodemailer');
const SupportTicket = require('../models/SupportTicket');
const SupportFeedback = require('../models/SupportFeedback');
const auth = require('../middleware/auth');

// Email transporter configuration
const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
    }
});

// Escalate to admin
router.post('/escalate', auth, async (req, res) => {
    try {
        const { userId, userEmail, userName, category, issue, sessionId, messages } = req.body;

        // Create support ticket
        const supportTicket = new SupportTicket({
            userId,
            userEmail,
            userName,
            category,
            issue,
            sessionId,
            messages,
            status: 'escalated',
            priority: 'medium',
            createdAt: new Date()
        });

        await supportTicket.save();

        // Send email notification to user
        const userEmailOptions = {
            from: process.env.EMAIL_USER,
            to: userEmail,
            subject: 'Support Request Escalated - Car Rental System',
            html: `
                <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                    <h2 style="color: #667eea;">Support Request Escalated</h2>
                    <p>Dear ${userName},</p>
                    <p>Your support request has been escalated to our admin team. Here are the details:</p>
                    
                    <div style="background-color: #f8fafc; padding: 20px; border-radius: 8px; margin: 20px 0;">
                        <p><strong>Ticket ID:</strong> ${supportTicket._id}</p>
                        <p><strong>Category:</strong> ${category}</p>
                        <p><strong>Issue:</strong> ${issue}</p>
                        <p><strong>Session ID:</strong> ${sessionId}</p>
                        <p><strong>Status:</strong> Escalated</p>
                    </div>
                    
                    <p>Our admin team will review your case and respond within 2-4 hours during business hours.</p>
                    <p>For urgent matters, please call our support line: <strong>+1 (555) 123-4567</strong></p>
                    
                    <p>Thank you for your patience.</p>
                    <p>Best regards,<br>Car Rental System Support Team</p>
                </div>
            `
        };

        // Send email notification to admin team
        const adminEmailOptions = {
            from: process.env.EMAIL_USER,
            to: process.env.EMAIL_USER, // Admin email
            subject: `New Support Escalation - ${category}`,
            html: `
                <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                    <h2 style="color: #ef4444;">New Support Escalation</h2>
                    <p>A new support request has been escalated and requires admin attention.</p>
                    
                    <div style="background-color: #fef2f2; padding: 20px; border-radius: 8px; margin: 20px 0;">
                        <p><strong>Ticket ID:</strong> ${supportTicket._id}</p>
                        <p><strong>User:</strong> ${userName} (${userEmail})</p>
                        <p><strong>Category:</strong> ${category}</p>
                        <p><strong>Issue:</strong> ${issue}</p>
                        <p><strong>Session ID:</strong> ${sessionId}</p>
                        <p><strong>User ID:</strong> ${userId}</p>
                    </div>
                    
                    <h3>Conversation History:</h3>
                    <div style="background-color: #f8fafc; padding: 15px; border-radius: 8px;">
                        ${messages.map(msg => `
                            <div style="margin-bottom: 10px; padding: 10px; border-left: 3px solid ${msg.senderType === 'user' ? '#667eea' : '#22c55e'};">
                                <strong>${msg.sender}:</strong> ${msg.text}
                                <br><small style="color: #64748b;">${new Date(msg.timestamp).toLocaleString()}</small>
                            </div>
                        `).join('')}
                    </div>
                    
                    <p>Please respond to this escalation promptly.</p>
                </div>
            `
        };

        await transporter.sendMail(userEmailOptions);
        await transporter.sendMail(adminEmailOptions);

        res.status(200).json({
            success: true,
            message: 'Support request escalated successfully',
            ticketId: supportTicket._id
        });

    } catch (error) {
        console.error('Escalation error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to escalate support request'
        });
    }
});

// Submit feedback
router.post('/feedback', auth, async (req, res) => {
    try {
        const { userId, sessionId, category, issue, rating, comment } = req.body;

        const feedback = new SupportFeedback({
            userId,
            sessionId,
            category,
            issue,
            rating,
            comment,
            createdAt: new Date()
        });

        await feedback.save();

        res.status(200).json({
            success: true,
            message: 'Feedback submitted successfully'
        });

    } catch (error) {
        console.error('Feedback error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to submit feedback'
        });
    }
});

// Get support tickets (admin only)
router.get('/tickets', auth, async (req, res) => {
    try {
        // Add admin check here if needed
        const tickets = await SupportTicket.find()
            .sort({ createdAt: -1 })
            .limit(50);

        res.status(200).json({
            success: true,
            tickets
        });

    } catch (error) {
        console.error('Get tickets error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch support tickets'
        });
    }
});

// Update ticket status (admin only)
router.patch('/tickets/:ticketId', auth, async (req, res) => {
    try {
        const { ticketId } = req.params;
        const { status, adminResponse } = req.body;

        const ticket = await SupportTicket.findByIdAndUpdate(
            ticketId,
            { 
                status, 
                adminResponse,
                updatedAt: new Date()
            },
            { new: true }
        );

        if (!ticket) {
            return res.status(404).json({
                success: false,
                message: 'Ticket not found'
            });
        }

        res.status(200).json({
            success: true,
            ticket
        });

    } catch (error) {
        console.error('Update ticket error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to update ticket'
        });
    }
});

module.exports = router;