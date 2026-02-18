# MerryMac Production Backend

This is the production-ready Node.js backend for the MerryMac Autonomous Agent.

## Features

- **Centralized Intelligence**: Hosts Forensic, Scoring, and Dual-LLM engines.
- **Secure Vault**: Supports Supabase/S3 object storage with encryption.
- **Email Engine**: Hardened using Nodemailer and IMAP for approval workflows.
- **API**: Express.js REST API protected by Helmet and CORS.

## Environment Variables

Create a `.env` file based on `.env.example`:

```bash
PORT=3001
API_BASE_URL=http://localhost:3001
# Add Supabase/OpenAI/Email credentials
```

## Running Locally

```bash
npm install
npm run dev
```

## Deployment

Ready for deployment on:

- **Railway**: Use `npm start`
- **Render**: use `npm start`
- **Vercel**: Requires `vercel.json` adapter (if serverless is desired) or generic Node deployment.

## API Endpoints

- POST `/api/forensic/scan`
- POST `/api/scoring/simulate`
- POST `/api/llm/analyze`
- POST `/api/vault/upload`
- POST `/api/email/send`
