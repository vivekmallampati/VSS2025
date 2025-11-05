# VSS2025 - Vishwa Sangh Shibir 2025 Web Application

## Overview

Web application for Vishwa Sangh Shibir 2025 with contact form, user authentication, and Firebase integration.

## Setup

### Prerequisites

- Node.js (v14 or higher)
- Firebase account and project
- Gmail account with 2-Step Verification enabled

### Installation

```bash
npm install
```

### Email Configuration (SMTP)

The application uses Gmail SMTP to send contact form emails. You need to configure the following environment variables:

#### For Local Development

1. Copy `.env.example` to `.env.local`:
   ```bash
   cp .env.example .env.local
   ```

2. Edit `.env.local` with your Gmail credentials:
   ```
   SMTP_HOST=smtp.gmail.com
   SMTP_PORT=587
   SMTP_USER=your-email@gmail.com
   SMTP_PASS=your-app-password
   TO_EMAIL=info@vss2025.org
   ```

#### For Vercel Deployment

1. Go to your Vercel project dashboard
2. Navigate to **Settings** → **Environment Variables**
3. Add the following variables:
   - `SMTP_HOST`: `smtp.gmail.com`
   - `SMTP_PORT`: `587` (or `465` for SSL)
   - `SMTP_USER`: Your Gmail address
   - `SMTP_PASS`: Your Gmail App Password (see below)
   - `TO_EMAIL`: `info@vss2025.org` (optional, defaults to this)

#### Getting a Gmail App Password

**Important:** You cannot use your regular Gmail password. You must create an App Password:

1. Enable **2-Step Verification** on your Google Account:
   - Go to https://myaccount.google.com/security
   - Enable 2-Step Verification if not already enabled

2. Generate an App Password:
   - Go to https://myaccount.google.com/apppasswords
   - Select "Mail" as the app
   - Select "Other (Custom name)" as the device
   - Enter "VSS2025" as the name
   - Click "Generate"
   - Copy the 16-character password (spaces don't matter)

3. Use this 16-character password as `SMTP_PASS` in your environment variables

#### Troubleshooting Email Issues

If you see the error: `"Email service not configured. Please contact the administrator."`

1. **Check environment variables are set:**
   - In Vercel: Settings → Environment Variables
   - Locally: Ensure `.env.local` exists and has all required variables

2. **Verify App Password:**
   - Make sure you're using an App Password, not your regular password
   - Ensure 2-Step Verification is enabled

3. **Check SMTP settings:**
   - Port `587` uses TLS (recommended)
   - Port `465` uses SSL (also works)
   - Host should be exactly `smtp.gmail.com`

4. **Test locally:**
   ```bash
   # Check if environment variables are loaded
   node -e "console.log(process.env.SMTP_HOST, process.env.SMTP_USER)"
   ```

## Development

### Run Locally

```bash
# Install dependencies
npm install

# Import data to Firebase (if needed)
npm run import
```

For local development with Vercel serverless functions, use:

```bash
vercel dev
```

## Architecture

- **Frontend**: Vanilla JavaScript, HTML, CSS
- **Backend**: Vercel serverless functions (`api/send-email/`)
- **Database**: Firebase Firestore
- **Authentication**: Firebase Auth
- **Email**: Nodemailer with Gmail SMTP

## API Endpoints

### POST `/api/send-email`

Sends contact form emails via SMTP.

**Request Body:**
```json
{
  "name": "John Doe",
  "email": "john@example.com",
  "category": "General Inquiry",
  "message": "Your message here"
}
```

**Response:**
```json
{
  "success": true,
  "messageId": "...",
  "message": "Email sent successfully"
}
```

## Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `SMTP_HOST` | Yes | - | SMTP server host (e.g., `smtp.gmail.com`) |
| `SMTP_PORT` | No | `587` | SMTP port (587 for TLS, 465 for SSL) |
| `SMTP_USER` | Yes | - | SMTP username (Gmail address) |
| `SMTP_PASS` | Yes | - | SMTP password (Gmail App Password) |
| `TO_EMAIL` | No | `info@vss2025.org` | Recipient email address |

## Testing

The email service validates configuration on each request. Check Vercel function logs for detailed error messages if emails fail to send.

