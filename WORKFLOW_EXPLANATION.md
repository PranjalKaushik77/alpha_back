# Video Upload Workflow Explanation

## 🔍 What "Get Upload URL" Does

The **"Get Upload URL"** button doesn't actually upload your video. Here's what it does:

### Step 1: Create Upload URL (`/api/upload`)
```
You click "Get Upload URL"
    ↓
Backend calls Mux API: "Give me a URL to upload a video"
    ↓
Mux responds: "Here's a temporary upload URL"
    ↓
Returns: uploadUrl, uploadId
```

**Important**: At this point:
- ✅ You have a URL to upload to
- ❌ **NO database record created yet** (we wait until upload completes)
- ❌ **NO video file has been uploaded yet**
- ❌ **NO asset exists in Mux yet** (asset_id is null)

### Step 2: Upload File to Mux
```
You select a video file and click "Upload to Mux"
    ↓
Browser uploads file directly to Mux's servers (using the uploadUrl)
    ↓
Mux receives the file and starts processing
    ↓
Mux creates an asset (this is when asset_id is created!)
```

**After file upload**:
- ✅ File is uploaded to Mux
- ✅ Mux creates an asset
- ✅ Asset ID becomes available

### Step 3: Create Database Record
```
After upload completes, we check Mux for the asset_id
    ↓
Either via webhook (automatic) or polling (manual check)
    ↓
CREATE database record with asset_id (this is when DB record is created!)
```

### Step 4: Process Video
```
Wait ~2 minutes for Mux to transcode and generate captions
    ↓
Call /api/process-video with asset_id
    ↓
Fetch transcript → Generate AI summary → Save to database
```

---

## 🤔 Why Can't You Just Upload Directly?

**You CAN upload directly!** But Mux requires a two-step process:

1. **Get Upload URL** - Mux gives you a secure, temporary URL
2. **Upload File** - You upload directly to that URL

This is how Mux's API works. It's a security feature - you get a signed URL that expires after a certain time.

---

## 📊 Complete Flow Diagram

```
┌─────────────────────────────────────────────────────────┐
│ 1. GET UPLOAD URL                                       │
│    POST /api/upload                                     │
│    → Creates Mux upload session                         │
│    → Returns: uploadUrl, uploadId                      │
│    → NO database record yet!                           │
└───────────────────┬─────────────────────────────────────┘
                    │
                    ▼
┌─────────────────────────────────────────────────────────┐
│ 2. UPLOAD FILE                                          │
│    PUT <uploadUrl> (direct to Mux)                     │
│    → Browser uploads file to Mux                       │
│    → Mux receives file                                  │
│    → Mux creates asset (asset_id generated!)            │
└───────────────────┬─────────────────────────────────────┘
                    │
                    ▼
┌─────────────────────────────────────────────────────────┐
│ 3. CREATE DATABASE RECORD                              │
│    POST /api/check-upload                               │
│    → Checks Mux upload status                           │
│    → Retrieves asset_id                                 │
│    → CREATES database record with asset_id              │
│    → This is when DB record is created!                 │
└───────────────────┬─────────────────────────────────────┘
                    │
                    ▼
┌─────────────────────────────────────────────────────────┐
│ 4. WAIT FOR PROCESSING                                  │
│    → Mux transcodes video                               │
│    → Mux generates captions/subtitles                   │
│    → Takes ~1-2 minutes                                 │
└───────────────────┬─────────────────────────────────────┘
                    │
                    ▼
┌─────────────────────────────────────────────────────────┐
│ 5. PROCESS WITH AI                                      │
│    POST /api/process-video                              │
│    → Fetches transcript from Mux                        │
│    → Sends to Gemini AI                                 │
│    → Generates summary & description                    │
│    → Saves to database                                  │
└─────────────────────────────────────────────────────────┘
```

---

## 🔄 Alternative: Webhook Flow (Production)

In production, you can set up webhooks so Mux automatically notifies you:

```
1. Upload file to Mux
   ↓
2. Mux creates asset
   ↓
3. Mux sends webhook: video.upload.asset_created
   ↓
4. Your backend receives webhook
   ↓
5. Updates database with asset_id automatically
```

**No manual checking needed!**

---

## 💡 Key Points

1. **"Get Upload URL"** = Get permission to upload (doesn't upload anything)
2. **"Upload to Mux"** = Actually uploads the file
3. **Asset ID** = Only available AFTER file is uploaded
4. **Two-step process** = Required by Mux API for security

---

## 🧪 Testing

The test page at `/test` guides you through all steps:
1. Click "Get Upload URL" → Gets the URL
2. Select file → Choose your video
3. Click "Upload to Mux" → Uploads the file
4. Wait ~2 minutes → Mux processes
5. Click "Generate Summary" → AI processing

---

## 🐛 Common Issues

**"Asset ID not available"**
- File hasn't been uploaded yet
- Wait a few seconds after upload and check again

**"No subtitle track found"**
- Mux is still processing
- Wait 1-2 minutes and try again

**"Upload URL expired"**
- Upload URLs expire after 1 hour
- Create a new upload URL
