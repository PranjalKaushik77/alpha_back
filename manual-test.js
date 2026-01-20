
const fs = require('fs');
const path = require('path');

// Usage: node manual-test.js <path-to-video-file>
const videoPath = process.argv[2];

if (!videoPath) {
    console.error("Please provide a video file path: node manual-test.js <path>");
    process.exit(1);
}

const API_URL = "http://localhost:3000"; // We'll try 3000, if fail try 3001

async function run() {
    console.log(`\n--- Starting Manual Test ---`);
    console.log(`Video File: ${videoPath}`);

    if (!fs.existsSync(videoPath)) {
        console.error("File not found!");
        process.exit(1);
    }

    // 1. Get an Upload URL
    console.log(`\n1. Requesting Upload URL from ${API_URL}/api/upload...`);
    let uploadData;
    try {
        const res = await fetch(`${API_URL}/api/upload`, { method: "POST" });
        if (!res.ok) throw new Error(`Server returned ${res.status}`);
        uploadData = await res.json();
        console.log("   Success!");
        console.log("   Upload ID:", uploadData.uploadId);
        console.log("   Video ID:", uploadData.videoId);
        console.log("   Upload URL:", uploadData.uploadUrl.substring(0, 50) + "...");
    } catch (e) {
        console.error("   Failed to connect to backend:", e.message);
        console.error("   Is the server running on port 3000?");
        process.exit(1);
    }

    // 2. Upload the file to Mux
    console.log(`\n2. Uploading file to Mux (this goes directly to Mux servers)...`);
    try {
        const fileBuffer = fs.readFileSync(videoPath);
        const res = await fetch(uploadData.uploadUrl, {
            method: "PUT",
            body: fileBuffer,
            headers: {
                "content-type": "video/mp4" // Assuming mp4 for simplicity, Mux detects auto
            }
        });
        if (!res.ok) throw new Error(`Mux returned ${res.status}`);
        console.log("   Upload Complete!");
    } catch (e) {
        console.error("   Upload failed:", e.message);
        process.exit(1);
    }

    // 3. Get the asset ID
    console.log(`\n3. Getting asset ID...`);
    const muxAssetId = uploadData.muxAssetId;
    
    if (!muxAssetId) {
        console.error("   Error: Asset ID not returned. This may happen if Mux hasn't created the asset yet.");
        console.error("   Wait a few seconds and check the database or Mux dashboard for the asset ID.");
        console.error(`   Video ID in database: ${uploadData.videoId}`);
        process.exit(1);
    }
    
    console.log(`   Asset ID: ${muxAssetId}`);

    // 4. Wait loop for Mux processing
    console.log(`\n4. Waiting for Mux to process the video...`);
    console.log("   We will attempt to process every 30 seconds.");

    const MAX_RETRIES = 10;
    for (let i = 1; i <= MAX_RETRIES; i++) {
        console.log(`\n   Attempt ${i}/${MAX_RETRIES} - Triggering AI processing...`);

        // Call process-video
        const res = await fetch(`${API_URL}/api/process-video`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ muxAssetId })
        });

        const data = await res.json();

        if (res.ok) {
            console.log("\n   SUCCESS! Processing Complete.");
            console.log("   -----------------------------------");
            console.log("   Summary:", data.video.summary);
            console.log("   -----------------------------------");
            console.log("   Description:", data.video.description);
            console.log("\n   Check your database to see the record!");
            return;
        }

        if (res.status === 404) {
            // Likely "No subtitle track found"
            console.log("   > Mux is still processing (cpatons not ready). Waiting 30s...");
            await new Promise(r => setTimeout(r, 30000));
            continue;
        }

        // Other error
        console.log("   > Error:", data.error);
        await new Promise(r => setTimeout(r, 30000));
    }

    console.log("\nTimed out waiting for Mux processing.");
}

run();
