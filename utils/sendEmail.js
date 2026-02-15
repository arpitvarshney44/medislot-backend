const nodemailer = require('nodemailer');

/**
 * Create reusable transporter
 */
const createTransporter = () => {
    return nodemailer.createTransport({
        host: process.env.SMTP_HOST,
        port: parseInt(process.env.SMTP_PORT) || 587,
        secure: parseInt(process.env.SMTP_PORT) === 465,
        auth: {
            user: process.env.SMTP_USER,
            pass: process.env.SMTP_PASS,
        },
        tls: {
            rejectUnauthorized: false,
        },
    });
};

/**
 * Send Email
 * @param {Object} options - Email options
 * @param {string} options.to - Recipient email
 * @param {string} options.subject - Email subject
 * @param {string} options.html - Email HTML body
 * @param {string} [options.text] - Plain text fallback
 */
const sendEmail = async ({ to, subject, html, text }) => {
    try {
        const transporter = createTransporter();

        const mailOptions = {
            from: `"${process.env.FROM_NAME || 'Medi Slot'}" <${process.env.FROM_EMAIL || process.env.SMTP_USER}>`,
            to,
            subject,
            html,
            text: text || '',
        };

        const info = await transporter.sendMail(mailOptions);
        console.log(`📧 Email sent to ${to}: ${info.messageId}`);
        return { success: true, messageId: info.messageId };
    } catch (error) {
        console.error(`❌ Email sending failed to ${to}:`, error.message);
        return { success: false, error: error.message };
    }
};

/**
 * Send Email Verification Mail
 * @param {string} email - Recipient email
 * @param {string} name - User name
 * @param {string} token - Verification token
 * @param {string} userType - 'patient' or 'doctor'
 */
const sendVerificationEmail = async (email, name, token, userType = 'patient') => {
    // Construct the backend API URL for email verification
    const backendUrl = process.env.BACKEND_URL || `http://localhost:${process.env.PORT || 5000}`;
    
    let verificationUrl;
    if (userType === 'admin') {
        // Admin verification goes to admin panel
        verificationUrl = `${process.env.ADMIN_PANEL_URL || 'http://localhost:5173'}/verify-email?token=${token}&type=${userType}`;
    } else {
        // Patient/Doctor verification goes to backend API which will handle the verification
        // and redirect to the app with success/error message
        const apiEndpoint = userType === 'doctor' ? '/api/doctor/auth/verify-email' : '/api/auth/verify-email';
        verificationUrl = `${backendUrl}${apiEndpoint}?token=${token}`;
    }

    const html = `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Email Verification - Medi Slot</title>
    </head>
    <body style="margin: 0; padding: 0; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #0B1426;">
      <table width="100%" cellpadding="0" cellspacing="0" style="max-width: 600px; margin: 0 auto; padding: 40px 20px;">
        <tr>
          <td>
            <table width="100%" cellpadding="0" cellspacing="0" style="background: linear-gradient(135deg, #162139 0%, #1E2D4A 100%); border-radius: 16px; overflow: hidden; box-shadow: 0 20px 60px rgba(0,0,0,0.3);">
              <!-- Header -->
              <tr>
                <td style="padding: 40px 30px 20px; text-align: center; background: linear-gradient(135deg, #00BFA6 0%, #6C63FF 100%);">
                  <h1 style="color: #ffffff; margin: 0; font-size: 28px; font-weight: 700; letter-spacing: -0.5px;">
                    🏥 Medi Slot
                  </h1>
                  <p style="color: rgba(255,255,255,0.9); margin: 8px 0 0; font-size: 14px;">
                    Doctor Appointment & Consultation Platform
                  </p>
                </td>
              </tr>
              
              <!-- Body -->
              <tr>
                <td style="padding: 40px 30px;">
                  <h2 style="color: #ffffff; margin: 0 0 16px; font-size: 22px; font-weight: 600;">
                    Verify Your Email Address
                  </h2>
                  <p style="color: #8B9DC3; margin: 0 0 24px; font-size: 15px; line-height: 1.6;">
                    Hello <strong style="color: #00BFA6;">${name}</strong>,
                  </p>
                  <p style="color: #8B9DC3; margin: 0 0 32px; font-size: 15px; line-height: 1.6;">
                    Thank you for registering with Medi Slot! Please verify your email address by clicking the button below. This link will expire in <strong style="color: #FF6584;">24 hours</strong>.
                  </p>
                  
                  <!-- CTA Button -->
                  <table width="100%" cellpadding="0" cellspacing="0">
                    <tr>
                      <td style="text-align: center; padding: 0 0 32px;">
                        <a href="${verificationUrl}" style="display: inline-block; padding: 16px 48px; background: linear-gradient(135deg, #00BFA6 0%, #00D9BF 100%); color: #0B1426; font-size: 16px; font-weight: 700; text-decoration: none; border-radius: 12px; letter-spacing: 0.5px;">
                          ✅ Verify Email
                        </a>
                      </td>
                    </tr>
                  </table>
                  
                  <p style="color: #8B9DC3; margin: 0 0 16px; font-size: 13px; line-height: 1.6;">
                    If the button doesn't work, copy and paste this link into your browser:
                  </p>
                  <p style="color: #6C63FF; margin: 0 0 24px; font-size: 12px; word-break: break-all; background: rgba(108,99,255,0.1); padding: 12px; border-radius: 8px;">
                    ${verificationUrl}
                  </p>
                  
                  <hr style="border: none; border-top: 1px solid rgba(139,157,195,0.2); margin: 24px 0;">
                  
                  <p style="color: #5A6A8A; margin: 0; font-size: 12px; line-height: 1.6;">
                    If you didn't create an account with Medi Slot, please ignore this email.
                  </p>
                </td>
              </tr>
              
              <!-- Footer -->
              <tr>
                <td style="padding: 20px 30px; text-align: center; background: rgba(0,0,0,0.2);">
                  <p style="color: #5A6A8A; margin: 0; font-size: 12px;">
                    © ${new Date().getFullYear()} Medi Slot. All rights reserved.
                  </p>
                </td>
              </tr>
            </table>
          </td>
        </tr>
      </table>
    </body>
    </html>
  `;

    return await sendEmail({
        to: email,
        subject: '✅ Verify Your Email - Medi Slot',
        html,
        text: `Hello ${name}, Please verify your email by visiting: ${verificationUrl}. This link expires in 24 hours.`,
    });
};

/**
 * Send Password Reset Email
 * @param {string} email - Recipient email
 * @param {string} name - User name
 * @param {string} token - Reset token
 * @param {string} userType - 'patient', 'doctor', or 'admin'
 */
const sendPasswordResetEmail = async (email, name, token, userType = 'patient') => {
    let resetUrl;
    if (userType === 'admin') {
        resetUrl = `${process.env.ADMIN_PANEL_URL || 'http://localhost:5173'}/reset-password?token=${token}`;
    } else {
        // Use production URL if available, fallback to deep link
        resetUrl = process.env.PRODUCTION_APP_URL 
            ? `${process.env.PRODUCTION_APP_URL}/reset-password?token=${token}&type=${userType}`
            : `${process.env.APP_URL || 'medislot://'}reset-password?token=${token}&type=${userType}`;
    }

    const html = `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Password Reset - Medi Slot</title>
    </head>
    <body style="margin: 0; padding: 0; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #0B1426;">
      <table width="100%" cellpadding="0" cellspacing="0" style="max-width: 600px; margin: 0 auto; padding: 40px 20px;">
        <tr>
          <td>
            <table width="100%" cellpadding="0" cellspacing="0" style="background: linear-gradient(135deg, #162139 0%, #1E2D4A 100%); border-radius: 16px; overflow: hidden; box-shadow: 0 20px 60px rgba(0,0,0,0.3);">
              <!-- Header -->
              <tr>
                <td style="padding: 40px 30px 20px; text-align: center; background: linear-gradient(135deg, #FF6584 0%, #FF8A65 100%);">
                  <h1 style="color: #ffffff; margin: 0; font-size: 28px; font-weight: 700; letter-spacing: -0.5px;">
                    🏥 Medi Slot
                  </h1>
                  <p style="color: rgba(255,255,255,0.9); margin: 8px 0 0; font-size: 14px;">
                    Password Reset Request
                  </p>
                </td>
              </tr>
              
              <!-- Body -->
              <tr>
                <td style="padding: 40px 30px;">
                  <h2 style="color: #ffffff; margin: 0 0 16px; font-size: 22px; font-weight: 600;">
                    Reset Your Password
                  </h2>
                  <p style="color: #8B9DC3; margin: 0 0 24px; font-size: 15px; line-height: 1.6;">
                    Hello <strong style="color: #FF6584;">${name}</strong>,
                  </p>
                  <p style="color: #8B9DC3; margin: 0 0 16px; font-size: 15px; line-height: 1.6;">
                    We received a request to reset your password. Click the button below to set a new password. This link will expire in <strong style="color: #FF6584;">1 hour</strong>.
                  </p>
                  
                  <!-- CTA Button -->
                  <table width="100%" cellpadding="0" cellspacing="0">
                    <tr>
                      <td style="text-align: center; padding: 24px 0 32px;">
                        <a href="${resetUrl}" style="display: inline-block; padding: 16px 48px; background: linear-gradient(135deg, #FF6584 0%, #FF8A65 100%); color: #ffffff; font-size: 16px; font-weight: 700; text-decoration: none; border-radius: 12px; letter-spacing: 0.5px;">
                          🔐 Reset Password
                        </a>
                      </td>
                    </tr>
                  </table>
                  
                  <p style="color: #8B9DC3; margin: 0 0 16px; font-size: 13px; line-height: 1.6;">
                    If the button doesn't work, copy and paste this link:
                  </p>
                  <p style="color: #FF6584; margin: 0 0 24px; font-size: 12px; word-break: break-all; background: rgba(255,101,132,0.1); padding: 12px; border-radius: 8px;">
                    ${resetUrl}
                  </p>
                  
                  <hr style="border: none; border-top: 1px solid rgba(139,157,195,0.2); margin: 24px 0;">
                  
                  <p style="color: #5A6A8A; margin: 0; font-size: 12px; line-height: 1.6;">
                    ⚠️ If you didn't request a password reset, please ignore this email. Your password will remain unchanged.
                  </p>
                </td>
              </tr>
              
              <!-- Footer -->
              <tr>
                <td style="padding: 20px 30px; text-align: center; background: rgba(0,0,0,0.2);">
                  <p style="color: #5A6A8A; margin: 0; font-size: 12px;">
                    © ${new Date().getFullYear()} Medi Slot. All rights reserved.
                  </p>
                </td>
              </tr>
            </table>
          </td>
        </tr>
      </table>
    </body>
    </html>
  `;

    return await sendEmail({
        to: email,
        subject: '🔐 Password Reset - Medi Slot',
        html,
        text: `Hello ${name}, Reset your password by visiting: ${resetUrl}. This link expires in 1 hour.`,
    });
};

/**
 * Send Doctor Verification Status Email
 * @param {string} email - Doctor email
 * @param {string} name - Doctor name
 * @param {string} status - 'approved' or 'rejected'
 * @param {string} reason - Reason for rejection (if rejected)
 */
const sendDoctorVerificationStatusEmail = async (email, name, status, reason = '') => {
    const isApproved = status === 'approved';
    
    // Create app open link
    const appUrl = process.env.PRODUCTION_APP_URL 
        ? `${process.env.PRODUCTION_APP_URL}/doctor-dashboard`
        : `${process.env.APP_URL || 'medislot://'}doctor-dashboard`;

    const html = `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Verification Status - Medi Slot</title>
    </head>
    <body style="margin: 0; padding: 0; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #0B1426;">
      <table width="100%" cellpadding="0" cellspacing="0" style="max-width: 600px; margin: 0 auto; padding: 40px 20px;">
        <tr>
          <td>
            <table width="100%" cellpadding="0" cellspacing="0" style="background: linear-gradient(135deg, #162139 0%, #1E2D4A 100%); border-radius: 16px; overflow: hidden; box-shadow: 0 20px 60px rgba(0,0,0,0.3);">
              <!-- Header -->
              <tr>
                <td style="padding: 40px 30px 20px; text-align: center; background: linear-gradient(135deg, ${isApproved ? '#00BFA6' : '#FF6584'} 0%, ${isApproved ? '#6C63FF' : '#FF8A65'} 100%);">
                  <h1 style="color: #ffffff; margin: 0; font-size: 28px; font-weight: 700;">
                    🏥 Medi Slot
                  </h1>
                  <p style="color: rgba(255,255,255,0.9); margin: 8px 0 0; font-size: 14px;">
                    Doctor Verification ${isApproved ? 'Approved' : 'Update'}
                  </p>
                </td>
              </tr>
              
              <!-- Body -->
              <tr>
                <td style="padding: 40px 30px;">
                  <h2 style="color: #ffffff; margin: 0 0 16px; font-size: 22px; font-weight: 600;">
                    ${isApproved ? '🎉 Congratulations!' : '📋 Verification Update'}
                  </h2>
                  <p style="color: #8B9DC3; margin: 0 0 24px; font-size: 15px; line-height: 1.6;">
                    Hello <strong style="color: ${isApproved ? '#00BFA6' : '#FF6584'};">Dr. ${name}</strong>,
                  </p>
                  ${isApproved ? `
                    <p style="color: #8B9DC3; margin: 0 0 24px; font-size: 15px; line-height: 1.6;">
                      Your profile has been <strong style="color: #00BFA6;">approved</strong>! You can now start accepting appointments and providing consultations through Medi Slot.
                    </p>
                    <div style="background: rgba(0,191,166,0.1); border: 1px solid rgba(0,191,166,0.3); border-radius: 12px; padding: 20px; margin-bottom: 24px;">
                      <p style="color: #00BFA6; margin: 0 0 8px; font-size: 14px; font-weight: 600;">✅ What's Next?</p>
                      <ul style="color: #8B9DC3; margin: 0; padding-left: 20px; font-size: 14px; line-height: 2;">
                        <li>Set up your availability & time slots</li>
                        <li>Complete your public profile</li>
                        <li>Add your clinic details</li>
                        <li>Start receiving appointments!</li>
                      </ul>
                    </div>
                    
                    <!-- CTA Button for Approved -->
                    <table width="100%" cellpadding="0" cellspacing="0">
                      <tr>
                        <td style="text-align: center; padding: 24px 0 32px;">
                          <a href="${appUrl}" style="display: inline-block; padding: 16px 48px; background: linear-gradient(135deg, #00BFA6 0%, #00D9BF 100%); color: #0B1426; font-size: 16px; font-weight: 700; text-decoration: none; border-radius: 12px; letter-spacing: 0.5px;">
                            🚀 Open MediSlot App
                          </a>
                        </td>
                      </tr>
                    </table>
                  ` : `
                    <p style="color: #8B9DC3; margin: 0 0 24px; font-size: 15px; line-height: 1.6;">
                      Unfortunately, your profile verification was <strong style="color: #FF6584;">not approved</strong> at this time.
                    </p>
                    ${reason ? `
                      <div style="background: rgba(255,101,132,0.1); border: 1px solid rgba(255,101,132,0.3); border-radius: 12px; padding: 20px; margin-bottom: 24px;">
                        <p style="color: #FF6584; margin: 0 0 8px; font-size: 14px; font-weight: 600;">📝 Reason:</p>
                        <p style="color: #8B9DC3; margin: 0; font-size: 14px; line-height: 1.6;">${reason}</p>
                      </div>
                    ` : ''}
                    <p style="color: #8B9DC3; margin: 0 0 24px; font-size: 15px; line-height: 1.6;">
                      You can update your profile and documents, then request re-verification through the app.
                    </p>
                    
                    <!-- CTA Button for Rejected -->
                    <table width="100%" cellpadding="0" cellspacing="0">
                      <tr>
                        <td style="text-align: center; padding: 24px 0 32px;">
                          <a href="${appUrl}" style="display: inline-block; padding: 16px 48px; background: linear-gradient(135deg, #FF6584 0%, #FF8A65 100%); color: #ffffff; font-size: 16px; font-weight: 700; text-decoration: none; border-radius: 12px; letter-spacing: 0.5px;">
                            📱 Update Profile
                          </a>
                        </td>
                      </tr>
                    </table>
                  `}
                  
                  <hr style="border: none; border-top: 1px solid rgba(139,157,195,0.2); margin: 24px 0;">
                  
                  <p style="color: #5A6A8A; margin: 0; font-size: 12px; line-height: 1.6;">
                    If you have any questions, please contact our support team.
                  </p>
                </td>
              </tr>
              
              <!-- Footer -->
              <tr>
                <td style="padding: 20px 30px; text-align: center; background: rgba(0,0,0,0.2);">
                  <p style="color: #5A6A8A; margin: 0; font-size: 12px;">
                    © ${new Date().getFullYear()} Medi Slot. All rights reserved.
                  </p>
                </td>
              </tr>
            </table>
          </td>
        </tr>
      </table>
    </body>
    </html>
  `;

    return await sendEmail({
        to: email,
        subject: isApproved
            ? '🎉 Your Doctor Profile is Approved - Medi Slot'
            : '📋 Verification Update - Medi Slot',
        html,
        text: isApproved
            ? `Dear Dr. ${name}, Your profile has been approved! You can now start accepting appointments on Medi Slot. Open the app: ${appUrl}`
            : `Dear Dr. ${name}, Your profile verification was not approved. ${reason ? `Reason: ${reason}` : ''} Please update your profile and try again. Open the app: ${appUrl}`,
    });
};

module.exports = {
    sendEmail,
    sendVerificationEmail,
    sendPasswordResetEmail,
    sendDoctorVerificationStatusEmail,
};
