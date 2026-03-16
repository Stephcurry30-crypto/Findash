import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import nodemailer from "nodemailer";
import dotenv from "dotenv";

dotenv.config();

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // API route for sending confirmation email
  app.post("/api/send-confirmation-email", async (req, res) => {
    const { email, name } = req.body;

    if (!email) {
      return res.status(400).json({ error: "Email is required" });
    }

    const emailUser = process.env.EMAIL_USER;
    const emailPass = process.env.EMAIL_PASS;

    if (!emailUser || !emailPass) {
      console.error("Email credentials not configured");
      return res.status(500).json({ error: "Email service not configured" });
    }

    try {
      const transporter = nodemailer.createTransport({
        service: "gmail",
        auth: {
          user: emailUser,
          pass: emailPass,
        },
      });

      const mailOptions = {
        from: `"FinDash Team" <${emailUser}>`,
        to: email,
        subject: "Welcome to FinDash - Your Financial Command Center",
        text: `Hey, ${name || 'there'}\n\nThank you for signing up for FinDash! We are thrilled to have you join our community of savvy financial managers.\n\nFinDash is more than just a scanner; it's your personal financial command center. Our platform is designed to bring immense value to your business or personal finances by:\n- Automating the scanning of receipts and invoices.\n- Providing real-time reconciliation of your sales and expenses.\n- Offering deep insights through our summary and analytics dashboard.\n- Helping you stay organized and ready for tax season without the stress.\n\nWe are committed to helping you take full control of your financial data with ease and precision.\n\nShould you have any concerns please reach out to 09524835569 for urgent concerns but for general concerns reach out to taranarciso@gmail.com.\n\nWelcome aboard!\n\nBest regards,\nThe FinDash Team`,
        html: `
          <!DOCTYPE html>
          <html>
          <head>
            <meta charset="utf-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Welcome to FinDash</title>
            <style>
              body {
                margin: 0;
                padding: 0;
                background-color: #000000;
                font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
                color: #ffffff;
              }
              .container {
                max-width: 600px;
                margin: 0 auto;
                background-color: #1c1c1e;
                border-radius: 24px;
                overflow: hidden;
                border: 1px solid rgba(255, 255, 255, 0.1);
                margin-top: 40px;
                margin-bottom: 40px;
              }
              .header {
                padding: 60px 20px;
                text-align: center;
                background: linear-gradient(135deg, #000000 0%, #1c1c1e 100%);
              }
              .logo {
                font-size: 48px;
                font-weight: 800;
                letter-spacing: -2px;
                margin: 0;
                /* Fallback for email clients that don't support background-clip: text */
                color: #0a84ff;
              }
              .logo-gradient {
                background: linear-gradient(to right, #0a84ff, #64d2ff);
                -webkit-background-clip: text;
                -webkit-text-fill-color: transparent;
                display: inline-block;
              }
              .content {
                padding: 40px;
              }
              .greeting {
                font-size: 28px;
                font-weight: 700;
                margin-bottom: 20px;
                color: #ffffff;
              }
              .text {
                font-size: 16px;
                line-height: 1.6;
                color: #a1a1a6;
                margin-bottom: 30px;
              }
              .feature-card {
                background-color: rgba(255, 255, 255, 0.05);
                border-radius: 16px;
                padding: 24px;
                margin-bottom: 30px;
                border: 1px solid rgba(255, 255, 255, 0.05);
              }
              .feature-title {
                font-size: 18px;
                font-weight: 600;
                color: #0a84ff;
                margin-bottom: 12px;
              }
              .feature-list {
                margin: 0;
                padding: 0;
                list-style: none;
              }
              .feature-item {
                font-size: 14px;
                color: #d1d1d6;
                margin-bottom: 8px;
                display: flex;
                align-items: center;
              }
              .feature-item::before {
                content: "•";
                color: #0a84ff;
                font-weight: bold;
                display: inline-block;
                width: 1em;
                margin-left: 0;
              }
              .button {
                display: inline-block;
                padding: 16px 32px;
                background-color: #0a84ff;
                color: #ffffff;
                text-decoration: none;
                border-radius: 12px;
                font-weight: 600;
                font-size: 16px;
                margin-top: 10px;
              }
              .footer {
                padding: 40px;
                text-align: center;
                background-color: #121214;
                border-top: 1px solid rgba(255, 255, 255, 0.05);
              }
              .contact-info {
                font-size: 13px;
                color: #636366;
                margin-bottom: 20px;
              }
              .copyright {
                font-size: 12px;
                color: #48484a;
              }
              a {
                color: #0a84ff;
                text-decoration: none;
              }
            </style>
          </head>
          <body>
            <div class="container">
              <div class="header">
                <h1 class="logo"><span class="logo-gradient">FinDash</span></h1>
                <p style="color: #636366; margin-top: 10px; font-size: 14px; letter-spacing: 1px; text-transform: uppercase;">Command Center</p>
              </div>
              
              <div class="content">
                <h2 class="greeting">Welcome, ${name || 'there'}!</h2>
                
                <p class="text">
                  We're excited to have you on board. FinDash is designed to simplify your financial workflow, giving you more time to focus on what really matters.
                </p>
                
                <div class="feature-card">
                  <h3 class="feature-title">Why FinDash?</h3>
                  <div class="feature-list">
                    <div class="feature-item">Automated Receipt & Invoice Scanning</div>
                    <div class="feature-item">Real-time Sales & Expense Reconciliation</div>
                    <div class="feature-item">Interactive Financial Summary Dashboard</div>
                    <div class="feature-item">AI-Powered Financial Insights</div>
                  </div>
                </div>
                
                <p class="text">
                  Your account is now active and ready. Start by uploading your first receipt or connecting your sales data.
                </p>
                
                <div style="text-align: center;">
                  <a href="${process.env.APP_URL || 'https://ais-dev-kr2akqvkxpwndfaznrvgrg-19338263043.us-east1.run.app'}" class="button">Launch Dashboard</a>
                </div>
              </div>
              
              <div class="footer">
                <div class="contact-info">
                  <p><strong>Urgent Support:</strong> <a href="tel:09524835569">09524835569</a></p>
                  <p><strong>General Inquiries:</strong> <a href="mailto:taranarciso@gmail.com">taranarciso@gmail.com</a></p>
                </div>
                <p class="copyright">
                  &copy; 2026 FinDash Team. All rights reserved.<br>
                  Smart Financial Scanning & Reconciliation
                </p>
              </div>
            </div>
          </body>
          </html>
        `,
      };

      await transporter.sendMail(mailOptions);
      res.json({ success: true });
    } catch (error) {
      console.error("Error sending email:", error);
      res.status(500).json({ error: "Failed to send email" });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*all", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
