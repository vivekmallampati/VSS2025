// Vercel serverless function to send contact form emails
// Environment variables required:
// - SMTP_HOST (e.g., smtp.gmail.com)
// - SMTP_PORT (e.g., 587)
// - SMTP_USER (your email address)
// - SMTP_PASS (your email password or app password)
// - TO_EMAIL (default: info@vss2025.org)

const nodemailer = require('nodemailer');

module.exports = async (req, res) => {
  // Only allow POST requests
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // CORS headers for cross-origin requests
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  // Handle preflight requests
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  try {
    // Get form data from request body
    const { name, email, category, message } = req.body;

    // Validate required fields
    if (!name || !email || !category || !message) {
      return res.status(400).json({ 
        error: 'Missing required fields: name, email, category, and message are required' 
      });
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({ error: 'Invalid email format' });
    }

    // Get SMTP configuration from environment variables
    const smtpHost = process.env.SMTP_HOST;
    const smtpPort = parseInt(process.env.SMTP_PORT || '587', 10);
    const smtpUser = process.env.SMTP_USER;
    const smtpPass = process.env.SMTP_PASS;
    const toEmail = process.env.TO_EMAIL || 'info@vss2025.org';

    // Check if SMTP is configured
    if (!smtpHost || !smtpUser || !smtpPass) {
      console.error('SMTP configuration missing. Required: SMTP_HOST, SMTP_USER, SMTP_PASS');
      return res.status(500).json({ 
        error: 'Email service not configured. Please contact the administrator.' 
      });
    }

    // Create transporter
    const transporter = nodemailer.createTransport({
      host: smtpHost,
      port: smtpPort,
      secure: smtpPort === 465, // true for 465, false for other ports
      auth: {
        user: smtpUser,
        pass: smtpPass,
      },
    });

    // Verify transporter configuration
    await transporter.verify();

    // Email content
    const subject = `VSS2025 Contact Form: ${category}`;
    const htmlBody = `
      <h2>New Contact Form Submission</h2>
      <p><strong>From:</strong> ${name} (${email})</p>
      <p><strong>Category:</strong> ${category}</p>
      <p><strong>Message:</strong></p>
      <p>${message.replace(/\n/g, '<br>')}</p>
      <hr>
      <p><em>This email was sent from the VSS2025 contact form.</em></p>
    `;

    const textBody = `
New Contact Form Submission

From: ${name} (${email})
Category: ${category}

Message:
${message}

---
This email was sent from the VSS2025 contact form.
    `;

    // Send email
    const info = await transporter.sendMail({
      from: `"VSS2025 Contact Form" <${smtpUser}>`,
      to: toEmail,
      replyTo: email,
      subject: subject,
      text: textBody,
      html: htmlBody,
    });

    console.log('Email sent successfully:', info.messageId);

    return res.status(200).json({ 
      success: true, 
      messageId: info.messageId,
      message: 'Email sent successfully' 
    });

  } catch (error) {
    console.error('Error sending email:', error);
    
    // Don't expose internal error details to client
    return res.status(500).json({ 
      error: 'Failed to send email. Please try again later or contact us directly at info@vss2025.org' 
    });
  }
};

