import nodemailer from 'nodemailer';
import imaps from 'imap-simple';
import { env } from '../config/env';

// In-memory store for approvals (Prod use Redis/DB)
const pendingApprovals = new Map<string, { context: any, timestamp: number, status: string }>();

class EmailService {
    private transporter;
    private config;

    constructor() {
        this.config = {
            user: env.EMAIL_USER,
            pass: env.EMAIL_PASS,
            host: env.EMAIL_HOST,
            imapHost: 'imap.gmail.com' // Should be in env, hacking for now
        };

        if (this.config.user && this.config.pass) {
            this.transporter = nodemailer.createTransport({
                host: this.config.host,
                port: 587,
                secure: false, // Upgrade later with STARTTLS
                auth: {
                    user: this.config.user,
                    pass: this.config.pass
                }
            });
            console.log("[Email] SMTP Transport Initialized");
        } else {
            console.log("[Email] Mock Transport Active (No Credentials)");
        }
    }

    async sendEmail(to: string, subject: string, body: string) {
        if (!this.transporter) {
            console.log(`[Email-Mock] To: ${to} | Subject: ${subject}`);
            return { success: true, mock: true };
        }

        try {
            const info = await this.transporter.sendMail({
                from: `"MerryMac Agent" <${this.config.user}>`,
                to,
                subject,
                text: body
            });
            return { success: true, messageId: info.messageId };
        } catch (error: any) {
            console.error("[Email] Send Error:", error);
            return { success: false, error: error.message };
        }
    }

    async requestApproval(context: any) {
        const token = `APPROVE_${Math.random().toString(36).substr(2, 9).toUpperCase()}`;
        const subject = `ACTION REQUIRED: Approval Request [${token}]`;
        const body = `
MERRYMAC SYSTEM ACTION REQUEST
------------------------------
Context: ${context.description}
Target: ${context.target}
Risk Level: ${context.riskLevel}

To APPROVE this action, reply to this email with the single word:
${token}

To DENY, ignore this email or reply DENY.
        `;

        pendingApprovals.set(token, {
            context,
            timestamp: Date.now(),
            status: 'PENDING'
        });

        await this.sendEmail(env.ADMIN_EMAIL || this.config.user || 'admin@example.com', subject, body);
        return { token, status: 'PENDING' };
    }

    async checkApprovals() {
        if (!this.config.user) return [];

        try {
            const connection = await imaps.connect({
                imap: {
                    user: this.config.user as string,
                    password: this.config.pass as string,
                    host: this.config.imapHost as string,
                    port: 993,
                    tls: true,
                    authTimeout: 3000
                }
            });
            await connection.openBox('INBOX');

            const delay = 24 * 3600 * 1000;
            const searchCriteria = ['UNSEEN', ['SINCE', new Date(Date.now() - delay).toISOString()]];
            const fetchOptions = { bodies: ['HEADER', 'TEXT'], markSeen: false };
            const messages = await connection.search(searchCriteria, fetchOptions);

            const approvedTokens: any[] = [];

            for (const item of messages) {
                const struct = item.attributes.struct;
                if (!struct) continue;

                const parts = imaps.getParts(struct);
                const textPart = parts.filter(part => part.type === 'text' && part.subtype === 'plain')[0];
                const data = await connection.getPartData(item, textPart);
                const body = (data || '').toString().trim();

                for (const [token, request] of pendingApprovals) {
                    if (body.includes(token)) {
                        pendingApprovals.set(token, { ...request, status: 'APPROVED' });
                        approvedTokens.push({ token, context: request.context });
                        // Mark seen if needed
                    }
                }
            }
            connection.end();
            return approvedTokens;

        } catch (error) {
            console.error("[Email] IMAP Error:", error);
            return [];
        }
    }
}

export const emailService = new EmailService();
