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
    // Trim whitespace in case there are accidental spaces
    const smtpHost = process.env.SMTP_HOST?.trim();
    const smtpPort = parseInt(process.env.SMTP_PORT?.trim() || '587', 10);
    const smtpUser = process.env.SMTP_USER?.trim();
    const smtpPass = process.env.SMTP_PASS?.trim();
    const toEmail = process.env.TO_EMAIL?.trim() || 'info@vss2025.org';

    // Debug: Log what we found (without exposing sensitive data)
    console.log('Environment variables check:');
    console.log(`SMTP_HOST: ${smtpHost ? '✓ Set (' + smtpHost.length + ' chars)' : '✗ Missing'}`);
    console.log(`SMTP_PORT: ${process.env.SMTP_PORT || 'Not set (using default 587)'}`);
    console.log(`SMTP_USER: ${smtpUser ? '✓ Set (' + smtpUser.length + ' chars)' : '✗ Missing'}`);
    console.log(`SMTP_PASS: ${smtpPass ? '✓ Set (' + smtpPass.length + ' chars)' : '✗ Missing'}`);
    console.log(`TO_EMAIL: ${toEmail}`);
    
    // List all SMTP-related env vars for debugging
    const allEnvVars = Object.keys(process.env).filter(key => key.includes('SMTP') || key.includes('EMAIL'));
    console.log('All SMTP/EMAIL env vars found:', allEnvVars.join(', ') || 'None');

    // Check if SMTP is configured
    if (!smtpHost || !smtpUser || !smtpPass) {
      const missing = [];
      if (!smtpHost) missing.push('SMTP_HOST');
      if (!smtpUser) missing.push('SMTP_USER');
      if (!smtpPass) missing.push('SMTP_PASS');
      
      console.error('SMTP configuration missing:', missing.join(', '));
      console.error('Required environment variables: SMTP_HOST, SMTP_USER, SMTP_PASS');
      console.error('Optional: SMTP_PORT (default: 587), TO_EMAIL (default: info@vss2025.org)');
      console.error('Troubleshooting:');
      console.error('1. Check Vercel Dashboard → Settings → Environment Variables');
      console.error('2. Ensure variables are set for Production, Preview, AND Development environments');
      console.error('3. Redeploy after adding variables');
      console.error('4. Check for typos in variable names (case-sensitive)');
      
      return res.status(500).json({ 
        error: 'Email service not configured. Please contact the administrator.',
        details: `Missing: ${missing.join(', ')}`,
        debug: {
          foundEnvVars: allEnvVars,
          tip: 'Check Vercel Dashboard → Settings → Environment Variables. Ensure variables are set for all environments and redeploy.'
        }
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

