// app/api/create-asset/route.ts
// Creates a Mux asset directly from a URL with auto-generated subtitles
// This is an alternative to the upload flow

export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import mux from "@/lib/mux";
import prisma from "@/lib/prisma";

export async function POST(request: NextRequest) {
    try {
        const { videoUrl } = await request.json();

        if (!videoUrl) {
            return NextResponse.json(
                { error: "videoUrl is required" },
                { status: 400 }
            );
        }

        // Create asset directly with auto-generated subtitles
        // Using Mux SDK format (may need adjustment based on SDK version)
        const asset = await mux.video.assets.create({
            inputs: [
                {
                    url: videoUrl,
                    generated_subtitles: [
                        {
                            language_code: "en",
                            name: "English CC"
                        }
                    ]
                }
            ],
            playback_policies: ["public"],
            video_quality: "basic",
        });

        // Create database record immediately (we have asset_id now)
        // Note: muxUploadId is not available for direct asset creation
        const video = await prisma.video.create({
            data: {
                muxUploadId: `direct-${asset.id}`, // Placeholder since we didn't use upload flow
                muxAssetId: asset.id,
                muxPlaybackId: asset.playback_ids?.[0]?.id || null,
                status: "UPLOADED", // Asset created, processing subtitles
            },
        });

        return NextResponse.json({
            success: true,
            assetId: asset.id,
            playbackId: asset.playback_ids?.[0]?.id || null,
            videoId: video.id,
            status: asset.status,
            message: "Asset created with auto-generated subtitles. Wait ~2 minutes for processing.",
        });
    } catch (err: any) {
        console.error("Asset creation error:", err);
        return NextResponse.json(
            { error: err.message || "Failed to create asset" },
            { status: 500 }
        );
    }
}
