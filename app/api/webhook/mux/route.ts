import { NextRequest, NextResponse } from "next/server";
import mux from "@/lib/mux";
import prisma from "@/lib/prisma";
import { model } from "@/lib/gemini";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { type, data } = body;

    // 1. Handle Asset Creation or Readiness (using UPSERT to prevent race conditions)
    if (type === "video.upload.asset_created" || type === "video.asset.ready") {
      const assetId = data.asset_id || data.id;
      const uploadId = data.upload_id || null;
      
      // Fetch playback ID if it's available in the data
      const playbackId = data.playback_ids?.[0]?.id || null;

      await prisma.video.upsert({
        where: { muxAssetId: assetId },
        update: {
          status: type === "video.asset.ready" ? "READY" : "UPLOADED",
          ...(uploadId && { muxUploadId: uploadId }),
          ...(playbackId && { muxPlaybackId: playbackId }),
        },
        create: {
          muxAssetId: assetId,
          muxUploadId: uploadId,
          status: type === "video.asset.ready" ? "READY" : "UPLOADED",
          muxPlaybackId: playbackId,
        },
      });

      console.log(`✅ Webhook processed: ${type} for asset ${assetId}`);
    }

    // 2. Handle Transcript Readiness & Gemini AI Processing
    if (type === "video.asset.track.ready" && data.text_source === "generated_vod") {
      const assetId = data.asset_id;
      const trackId = data.id;

      // Update status to show we are generating AI content
      await prisma.video.update({
        where: { muxAssetId: assetId },
        data: { status: "PROCESSING_AI" },
      });

      // Get the playback ID to construct the transcript URL
      const asset = await mux.video.assets.retrieve(assetId);
      const playbackId = asset.playback_ids?.[0]?.id;

      if (playbackId) {
        // Fetch transcript as clean .txt (automatically strips VTT timestamps)
        const transcriptRes = await fetch(
          `https://stream.mux.com/${playbackId}/text/${trackId}.txt`
        );
        const transcript = await transcriptRes.text();

        if (transcript && transcript.trim() !== "") {
          // Generate Summary and Description via Gemini
          const [summaryResult, descriptionResult] = await Promise.all([
            model.generateContent(`Summarize this video transcript in 2-3 sentences: ${transcript}`),
            model.generateContent(`Write a catchy video description based on this transcript: ${transcript}`),
          ]);

          // Final update with AI content
          await prisma.video.update({
            where: { muxAssetId: assetId },
            data: {
              transcript,
              summary: summaryResult.response.text(),
              description: descriptionResult.response.text(),
              status: "COMPLETED",
            },
          });
          console.log(`✨ AI Generation complete for asset ${assetId}`);
        }
      }
    }

    // 3. Handle Errors
    if (type === "video.asset.errored") {
      await prisma.video.update({
        where: { muxAssetId: data.id },
        data: { status: "FAILED" },
      });
      console.error(`❌ Mux Asset Errored: ${data.id}`);
    }

    return NextResponse.json({ received: true });
  } catch (error: any) {
    console.error("Webhook error:", error);
    return NextResponse.json(
      { error: error.message || "Webhook processing failed" },
      { status: 500 }
    );
  }
}