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
 * Send Email Verification OTP
 * @param {string} email - Recipient email
 * @param {string} name - User name
 * @param {string} otp - 6-digit OTP
 * @param {string} userType - 'patient' or 'doctor'
 */
const sendVerificationOTP = async (email, name, otp, userType = 'patient') => {
    const html = `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Email Verification - MediSlot</title>
    </head>
    <body style="margin: 0; padding: 0; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #F8FAFC;">
      <table width="100%" cellpadding="0" cellspacing="0" style="max-width: 600px; margin: 0 auto; padding: 40px 20px;">
        <tr>
          <td>
            <table width="100%" cellpadding="0" cellspacing="0" style="background: #FFFFFF; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 20px rgba(0,0,0,0.1);">
              <tr>
                <td style="padding: 40px 30px 20px; text-align: center; background: linear-gradient(135deg, #4DD0E1 0%, #2563EB 100%);">
                  <h1 style="color: #ffffff; margin: 0; font-size: 28px; font-weight: 700;">🏥 MediSlot</h1>
                  <p style="color: rgba(255,255,255,0.9); margin: 8px 0 0; font-size: 14px;">Email Verification Code</p>
                </td>
              </tr>
              <tr>
                <td style="padding: 40px 30px;">
                  <h2 style="color: #0F172A; margin: 0 0 16px; font-size: 22px; font-weight: 600;">Verify Your Email</h2>
                  <p style="color: #475569; margin: 0 0 24px; font-size: 15px; line-height: 1.6;">
                    Hello <strong style="color: #4DD0E1;">${name}</strong>,
                  </p>
                  <p style="color: #475569; margin: 0 0 32px; font-size: 15px; line-height: 1.6;">
                    Your verification code is below. This code expires in <strong style="color: #EF4444;">10 minutes</strong>.
                  </p>
                  <table width="100%" cellpadding="0" cellspacing="0">
                    <tr>
                      <td style="text-align: center; padding: 0 0 32px;">
                        <div style="display: inline-block; background: linear-gradient(135deg, #4DD0E1 0%, #2563EB 100%); padding: 20px 40px; border-radius: 12px;">
                          <p style="margin: 0; font-size: 14px; color: rgba(255,255,255,0.9); font-weight: 500; letter-spacing: 1px;">VERIFICATION CODE</p>
                          <p style="margin: 8px 0 0; font-size: 36px; color: #ffffff; font-weight: 700; letter-spacing: 8px; font-family: 'Courier New', monospace;">${otp}</p>
                        </div>
                      </td>
                    </tr>
                  </table>
                  <div style="background: #EFF6FF; border-left: 4px solid #2563EB; padding: 16px; border-radius: 8px; margin-bottom: 24px;">
                    <p style="color: #1E40AF; margin: 0; font-size: 14px; line-height: 1.6;">
                      <strong>💡 Tip:</strong> Open the MediSlot app and enter this code on the verification screen.
                    </p>
                  </div>
                  <hr style="border: none; border-top: 1px solid #E2E8F0; margin: 24px 0;">
                  <p style="color: #94A3B8; margin: 0; font-size: 12px; line-height: 1.6;">
                    If you didn't create an account, please ignore this email.
                  </p>
                </td>
              </tr>
              <tr>
                <td style="padding: 20px 30px; text-align: center; background: #F8FAFC;">
                  <p style="color: #94A3B8; margin: 0; font-size: 12px;">© ${new Date().getFullYear()} MediSlot. All rights reserved.</p>
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
        subject: '✅ Your MediSlot Verification Code',
        html,
        text: `Hello ${name}, Your MediSlot verification code is: ${otp}. This code expires in 10 minutes.`,
    });
};

/**
 * Send Password Reset OTP
 * @param {string} email - Recipient email
 * @param {string} name - User name
 * @param {string} otp - 6-digit OTP
 * @param {string} userType - 'patient' or 'doctor'
 */
const sendPasswordResetOTP = async (email, name, otp, userType = 'patient') => {
    const html = `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Password Reset - MediSlot</title>
    </head>
    <body style="margin: 0; padding: 0; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #F8FAFC;">
      <table width="100%" cellpadding="0" cellspacing="0" style="max-width: 600px; margin: 0 auto; padding: 40px 20px;">
        <tr>
          <td>
            <table width="100%" cellpadding="0" cellspacing="0" style="background: #FFFFFF; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 20px rgba(0,0,0,0.1);">
              <tr>
                <td style="padding: 40px 30px 20px; text-align: center; background: linear-gradient(135deg, #FF6B6B 0%, #EE5A6F 100%);">
                  <h1 style="color: #ffffff; margin: 0; font-size: 28px; font-weight: 700;">🏥 MediSlot</h1>
                  <p style="color: rgba(255,255,255,0.9); margin: 8px 0 0; font-size: 14px;">Password Reset Code</p>
                </td>
              </tr>
              <tr>
                <td style="padding: 40px 30px;">
                  <h2 style="color: #0F172A; margin: 0 0 16px; font-size: 22px; font-weight: 600;">Reset Your Password</h2>
                  <p style="color: #475569; margin: 0 0 24px; font-size: 15px; line-height: 1.6;">
                    Hello <strong style="color: #FF6B6B;">${name}</strong>,
                  </p>
                  <p style="color: #475569; margin: 0 0 32px; font-size: 15px; line-height: 1.6;">
                    Your password reset code is below. This code expires in <strong style="color: #EF4444;">10 minutes</strong>.
                  </p>
                  <table width="100%" cellpadding="0" cellspacing="0">
                    <tr>
                      <td style="text-align: center; padding: 0 0 32px;">
                        <div style="display: inline-block; background: linear-gradient(135deg, #FF6B6B 0%, #EE5A6F 100%); padding: 20px 40px; border-radius: 12px;">
                          <p style="margin: 0; font-size: 14px; color: rgba(255,255,255,0.9); font-weight: 500; letter-spacing: 1px;">RESET CODE</p>
                          <p style="margin: 8px 0 0; font-size: 36px; color: #ffffff; font-weight: 700; letter-spacing: 8px; font-family: 'Courier New', monospace;">${otp}</p>
                        </div>
                      </td>
                    </tr>
                  </table>
                  <div style="background: #FEF2F2; border-left: 4px solid #EF4444; padding: 16px; border-radius: 8px; margin-bottom: 24px;">
                    <p style="color: #991B1B; margin: 0; font-size: 14px; line-height: 1.6;">
                      <strong>⚠️ Security:</strong> If you didn't request this, please ignore this email and your password will remain unchanged.
                    </p>
                  </div>
                  <hr style="border: none; border-top: 1px solid #E2E8F0; margin: 24px 0;">
                  <p style="color: #94A3B8; margin: 0; font-size: 12px; line-height: 1.6;">
                    This code will expire in 10 minutes for security reasons.
                  </p>
                </td>
              </tr>
              <tr>
                <td style="padding: 20px 30px; text-align: center; background: #F8FAFC;">
                  <p style="color: #94A3B8; margin: 0; font-size: 12px;">© ${new Date().getFullYear()} MediSlot. All rights reserved.</p>
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
        subject: '🔐 Your MediSlot Password Reset Code',
        html,
        text: `Hello ${name}, Your MediSlot password reset code is: ${otp}. This code expires in 10 minutes. If you didn't request this, please ignore this email.`,
    });
};


// Legacy token-based functions kept for backward compatibility
const sendVerificationEmail = async (email, name, token, userType = 'patient') => {
    const backendUrl = process.env.BACKEND_URL || `http://localhost:${process.env.PORT || 5000}`;
    let verificationUrl;
    if (userType === 'admin') {
        verificationUrl = `${process.env.ADMIN_PANEL_URL || 'http://localhost:5173'}/verify-email?token=${token}&type=${userType}`;
    } else {
        const apiEndpoint = userType === 'doctor' ? '/api/doctor/auth/verify-email-direct' : '/api/auth/verify-email-direct';
        verificationUrl = `${backendUrl}${apiEndpoint}?token=${token}`;
    }
    const html = `<!DOCTYPE html><html><body style="font-family: Arial; padding: 20px;"><h2>Verify Your Email</h2><p>Hello ${name},</p><p>Click the link below to verify your email:</p><a href="${verificationUrl}" style="display: inline-block; padding: 12px 24px; background: #4DD0E1; color: white; text-decoration: none; border-radius: 8px;">Verify Email</a></body></html>`;
    return await sendEmail({ to: email, subject: '✅ Verify Your Email - Medi Slot', html, text: `Hello ${name}, Verify your email: ${verificationUrl}` });
};

const sendPasswordResetEmail = async (email, name, token, userType = 'patient') => {
    const backendUrl = process.env.BACKEND_URL || `http://localhost:${process.env.PORT || 5000}`;
    let resetUrl;
    if (userType === 'admin') {
        resetUrl = `${process.env.ADMIN_PANEL_URL || 'http://localhost:5173'}/reset-password?token=${token}`;
    } else {
        const apiEndpoint = userType === 'doctor' ? '/api/doctor/auth/reset-password-direct' : '/api/auth/reset-password-direct';
        resetUrl = `${backendUrl}${apiEndpoint}?token=${token}`;
    }
    const html = `<!DOCTYPE html><html><body style="font-family: Arial; padding: 20px;"><h2>Reset Your Password</h2><p>Hello ${name},</p><p>Click the link below to reset your password:</p><a href="${resetUrl}" style="display: inline-block; padding: 12px 24px; background: #FF6B6B; color: white; text-decoration: none; border-radius: 8px;">Reset Password</a></body></html>`;
    return await sendEmail({ to: email, subject: '🔐 Password Reset - Medi Slot', html, text: `Hello ${name}, Reset your password: ${resetUrl}` });
};

const sendDoctorVerificationStatusEmail = async (email, name, status, reason = '') => {
    const isApproved = status === 'approved';
    const appUrl = process.env.PRODUCTION_APP_URL ? `${process.env.PRODUCTION_APP_URL}/doctor-dashboard` : `${process.env.APP_URL || 'medislot://'}doctor-dashboard`;
    const html = `<!DOCTYPE html><html><body style="font-family: Arial; padding: 20px;"><h2>${isApproved ? 'Congratulations!' : 'Verification Update'}</h2><p>Hello Dr. ${name},</p><p>${isApproved ? 'Your profile has been approved!' : `Your profile verification was not approved. ${reason ? `Reason: ${reason}` : ''}`}</p><a href="${appUrl}" style="display: inline-block; padding: 12px 24px; background: ${isApproved ? '#00BFA6' : '#FF6B6B'}; color: white; text-decoration: none; border-radius: 8px;">${isApproved ? 'Open App' : 'Update Profile'}</a></body></html>`;
    return await sendEmail({ to: email, subject: isApproved ? '🎉 Profile Approved - Medi Slot' : '📋 Verification Update - Medi Slot', html, text: `Dr. ${name}, ${isApproved ? 'Your profile is approved!' : 'Please update your profile.'}` });
};

module.exports = {
    sendEmail,
    sendVerificationOTP,
    sendPasswordResetOTP,
    sendVerificationEmail,
    sendPasswordResetEmail,
    sendDoctorVerificationStatusEmail,
};
