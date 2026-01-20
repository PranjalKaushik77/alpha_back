// app/api/upload/route.ts
// Creates a Mux upload URL (NO database record yet)
// Database record will be created AFTER file is uploaded and asset_id is available

export const runtime = "nodejs";

import { NextResponse } from "next/server";
import mux from "@/lib/mux";

export async function POST() {
    try {
        // Create upload URL in Mux
        // This gives us a URL to upload the video file to
        // The asset will be created AFTER the file is uploaded
        // Configured to auto-generate English subtitles
        const upload = await mux.video.uploads.create({
            new_asset_settings: {
                playback_policies: ["public"],
                video_quality: "basic",
                // Auto-generate English subtitles in the inputs array
                inputs: [
                    {
                        generated_subtitles: [
                            {
                                language_code: "en",
                                name: "English CC"
                            }
                        ]
                    }
                ]
            },
            cors_origin: "*",
        });

        // Return ONLY the upload URL and ID
        // NO database record created yet - we'll do that after upload completes
        return NextResponse.json({
            uploadUrl: upload.url,      // URL to upload file to
            uploadId: upload.id,        // Mux upload ID
        });
    } catch (err: any) {
        console.error("Upload creation error:", err);
        return NextResponse.json(
            { error: err.message || "Failed to create upload" },
            { status: 500 }
        );
    }
}
