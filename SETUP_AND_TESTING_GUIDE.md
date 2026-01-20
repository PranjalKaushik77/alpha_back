# Video Processing Pipeline - Setup & Testing Guide

## 🎯 What This Pipeline Does

This is a **video processing backend pipeline** that:

1. **Accepts video uploads** via Mux (video hosting platform)
2. **Transcodes videos** automatically using Mux's infrastructure
3. **Extracts transcripts** from video captions/subtitles
4. **Generates AI summaries and descriptions** using Google Gemini AI
5. **Stores everything** in a PostgreSQL database

### Pipeline Flow

```
┌─────────────┐
│   Client    │ Uploads video file
└──────┬──────┘
       │
       ▼
┌─────────────────┐
│  /api/upload    │ Creates Mux upload URL + DB record
└──────┬──────────┘
       │
       ▼
┌─────────────────┐
│   Mux Platform  │ Receives video, transcodes, generates captions
└──────┬──────────┘
       │
       │ (Webhook: video.asset.ready)
       ▼
┌─────────────────┐
│ /api/webhook/mux│ Updates DB status to READY
└──────┬──────────┘
       │
       ▼
┌─────────────────────┐
│ /api/process-video   │ Fetches transcript → Gemini AI → Saves summary/description
└─────────────────────┘
```

---

## 📋 Prerequisites

Before running this pipeline, you need:

1. **Node.js** (v18 or higher)
2. **PostgreSQL database** (local or cloud)
3. **Mux account** (free tier available at https://mux.com)
4. **Google Gemini API key** (get from https://makersuite.google.com/app/apikey)

---

## 🔧 Setup Instructions

### Step 1: Install Dependencies

```bash
npm install
```

### Step 2: Set Up Environment Variables

Create a `.env` file in the root directory with the following:

```env
# Database
DATABASE_URL="postgresql://username:password@localhost:5432/database_name"

# Mux API Credentials (from Mux Dashboard)
MUX_TOKEN_ID="your_mux_token_id"
MUX_TOKEN_SECRET="your_mux_token_secret"

# Google Gemini API Key
GEMINI_API_KEY="your_gemini_api_key"
```

**How to get credentials:**

- **Mux**: Sign up at https://mux.com → Dashboard → Settings → API Access Tokens
- **Gemini**: Go to https://makersuite.google.com/app/apikey → Create API Key
- **PostgreSQL**: Install locally or use a service like Supabase, Neon, or Railway

### Step 3: Set Up Database

```bash
# Generate Prisma Client
npx prisma generate

# Run migrations (creates Video table)
npx prisma migrate dev --name init

# Optional: Open Prisma Studio to view data
npx prisma studio
```

### Step 4: Start the Development Server

```bash
npm run dev
```

The server will start on **http://localhost:3000**

---

## 🧪 Testing Methods

You have **3 ways** to test the pipeline:

### Method 1: Web UI (Easiest)

1. Open **http://localhost:3000/test** in your browser
2. Click **"Get Upload URL"** button
3. Select a video file
4. Click **"Upload to Mux"**
5. Wait **~2 minutes** for Mux to process
6. Click **"Generate Summary"**
7. View the results (summary and description)

**Note**: The UI shows logs and status updates in real-time.

---

### Method 2: Manual Test Script (Automated)

Use the provided `manual-test.js` script:

```bash
node manual-test.js path/to/your/video.mp4
```

**What it does:**
- Creates upload URL
- Uploads video to Mux
- Waits and retries processing (checks every 30 seconds)
- Shows final results

**Example:**
```bash
node manual-test.js "C:\Users\PRANJAL KAUSHIK\Downloads\back\15_Nitin_Mangal.mp4"
```

---

### Method 3: API Testing with cURL/Postman

#### Step 1: Create Upload URL

```bash
curl -X POST http://localhost:3000/api/upload
```

**Response:**
```json
{
  "uploadUrl": "https://...",
  "uploadId": "...",
  "videoId": "..."
}
```

#### Step 2: Upload Video File

```bash
curl -X PUT "<uploadUrl>" \
  --upload-file "your-video.mp4" \
  --header "Content-Type: video/mp4"
```

#### Step 3: Wait for Mux Processing

Wait **1-2 minutes** for Mux to transcode and generate captions.

#### Step 4: Process Video (Get Transcript & AI Summary)

```bash
curl -X POST http://localhost:3000/api/process-video \
  -H "Content-Type: application/json" \
  -d '{"muxAssetId": "your-asset-id"}'
```

**Response:**
```json
{
  "success": true,
  "video": {
    "id": "...",
    "muxAssetId": "...",
    "status": "READY",
    "transcript": "Full transcript text...",
    "summary": "AI-generated summary...",
    "description": "AI-generated description..."
  }
}
```

---

## 📡 API Endpoints

### `POST /api/upload`

Creates a Mux upload URL and database record.

**Request:** None (no body)

**Response:**
```json
{
  "uploadUrl": "https://...",
  "uploadId": "...",
  "videoId": "..."
}
```

**What it does:**
- Creates a Mux upload session
- Creates a database record with status `UPLOADING`
- Returns upload URL for direct upload to Mux

---

### `POST /api/process-video`

Fetches transcript from Mux and generates AI summary/description.

**Request:**
```json
{
  "muxAssetId": "string"
}
```

**Response:**
```json
{
  "success": true,
  "video": {
    "id": "...",
    "muxAssetId": "...",
    "status": "READY",
    "transcript": "...",
    "summary": "...",
    "description": "..."
  }
}
```

**What it does:**
1. Updates status to `PROCESSING`
2. Fetches video asset from Mux
3. Finds subtitle/caption track
4. Downloads VTT file
5. Parses transcript (removes timestamps)
6. Sends transcript to Gemini AI (2 prompts: summary + description)
7. Saves transcript, summary, and description to database
8. Updates status to `READY`

**Errors:**
- `404`: No subtitle track found (Mux still processing)
- `400`: Missing muxAssetId or empty transcript
- `500`: Processing failed

---

### `POST /api/webhook/mux`

Handles Mux webhook events (called by Mux automatically).

**Events handled:**
- `video.asset.ready`: Updates status to `READY`, saves playback ID
- `video.asset.errored`: Updates status to `FAILED`

**Note**: In production, you should verify webhook signatures for security.

**To set up webhooks:**
1. Go to Mux Dashboard → Settings → Webhooks
2. Add webhook URL: `https://your-domain.com/api/webhook/mux`
3. Select events: `video.asset.ready`, `video.asset.errored`

---

## 🗄️ Database Schema

The `Video` table stores:

```prisma
model Video {
  id            String   @id @default(uuid())
  muxAssetId    String   @unique      // Mux asset identifier
  muxPlaybackId String?                // Mux playback ID (for streaming)
  status        String                 // UPLOADING, PROCESSING, READY, FAILED
  transcript    String?  @db.Text     // Full video transcript
  summary       String?  @db.Text     // AI-generated summary
  description   String?  @db.Text     // AI-generated description
  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt
}
```

**Status Flow:**
```
UPLOADING → PROCESSING → READY
                ↓
             FAILED
```

---

## 🔍 Troubleshooting

### "Cannot find module '@/lib/...'"

Make sure `tsconfig.json` has the path alias configured (already fixed).

### "No subtitle track found"

- Mux needs time to process the video (usually 1-2 minutes)
- Wait and retry the `/api/process-video` endpoint
- Check Mux dashboard to see if asset is ready

### "Prisma Client not found"

Run:
```bash
npx prisma generate
```

### Database Connection Error

- Verify `DATABASE_URL` in `.env`
- Make sure PostgreSQL is running
- Check credentials are correct

### Mux API Errors

- Verify `MUX_TOKEN_ID` and `MUX_TOKEN_SECRET` in `.env`
- Check Mux dashboard for API token status
- Ensure tokens have proper permissions

### Gemini API Errors

- Verify `GEMINI_API_KEY` in `.env`
- Check API quota/limits
- Ensure API key is valid

---

## 📊 Monitoring & Debugging

### View Database Records

```bash
npx prisma studio
```

Opens a web UI at http://localhost:5555 to view/edit database records.

### Check Server Logs

The Next.js dev server shows logs in the terminal:
- Upload creation
- Processing status
- Webhook events
- Errors

### Test Individual Components

**Test Mux connection:**
```javascript
// In Node.js console or test file
import mux from './app/lib/mux';
const asset = await mux.video.assets.retrieve('asset-id');
console.log(asset);
```

**Test Gemini:**
```javascript
import { model } from './app/lib/gemini';
const result = await model.generateContent('Hello');
console.log(result.response.text());
```

**Test Database:**
```javascript
import prisma from './app/lib/prisma';
const videos = await prisma.video.findMany();
console.log(videos);
```

---

## 🚀 Production Deployment

### Environment Variables

Set all environment variables in your hosting platform (Vercel, Railway, etc.)

### Database Migrations

```bash
npx prisma migrate deploy
```

### Webhook Setup

1. Deploy your app
2. Configure Mux webhook URL: `https://your-domain.com/api/webhook/mux`
3. Enable webhook signature verification (update webhook route)

### Build & Start

```bash
npm run build
npm start
```

---

## 📝 Summary

**Quick Start:**
1. `npm install`
2. Create `.env` with credentials
3. `npx prisma generate && npx prisma migrate dev`
4. `npm run dev`
5. Visit http://localhost:3000/test
6. Upload a video and test!

**Pipeline Flow:**
Upload → Mux Processing → Transcript Extraction → AI Generation → Database Storage

**Key Files:**
- `app/api/upload/route.ts` - Upload endpoint
- `app/api/process-video/route.ts` - AI processing endpoint
- `app/api/webhook/mux/route.ts` - Webhook handler
- `app/lib/mux.ts` - Mux client
- `app/lib/gemini.ts` - Gemini AI client
- `app/lib/prisma.ts` - Database client

---

## 🎬 Example Test Video

You can use the video file `15_Nitin_Mangal.mp4` that's already in your project directory:

```bash
node manual-test.js "15_Nitin_Mangal.mp4"
```

Or upload it via the web UI at http://localhost:3000/test
