import { NextRequest, NextResponse } from "next/server";
import mux from "@/lib/mux";
import prisma from "@/lib/prisma";
import { model } from "@/lib/gemini";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { type, data } = body;

    // 1. Asset Created (Initial upload finish)
    if (type === "video.upload.asset_created") {
      await prisma.video.upsert({
        where: { muxAssetId: data.asset_id },
        update: { muxUploadId: data.upload_id, status: "UPLOADED" },
        create: {
          muxAssetId: data.asset_id,
          muxUploadId: data.upload_id,
          status: "UPLOADED",
        },
      });
    }

    // 2. Asset Ready (Video playable)
    if (type === "video.asset.ready") {
      const asset = await mux.video.assets.retrieve(data.id);
      await prisma.video.update({
        where: { muxAssetId: data.id },
        data: {
          status: "READY",
          muxPlaybackId: asset.playback_ids?.[0]?.id || null,
        },
      });
    }

    // 3. NEW: Transcript Ready (AI Processing Logic)
    // This triggers specifically when the text track finishes processing
    if (type === "video.asset.track.ready" && data.text_source === "generated_vod") {
      const assetId = data.asset_id;
      const trackId = data.id;

      // Update status to show we are working on AI
      await prisma.video.update({
        where: { muxAssetId: assetId },
        data: { status: "PROCESSING" },
      });

      // Fetch the asset to get the Playback ID for the URL
      const asset = await mux.video.assets.retrieve(assetId);
      const playbackId = asset.playback_ids?.[0]?.id;

      if (playbackId) {
        // Fetch as .txt instead of .vtt to avoid manual timestamp parsing
        const transcriptRes = await fetch(`https://stream.mux.com/${playbackId}/text/${trackId}.txt`);
        const transcript = await transcriptRes.text();

        if (transcript && transcript.trim() !== "") {
          // Prepare prompts for Gemini
          // Replace your existing prompts with these "Strict" versions:

            const summaryPrompt = `Provide ONE concise summary (2-3 sentences) of this video transcript. Do not provide options or a list. Output only the summary: \n\n${transcript}`;

            const descriptionPrompt = `Write ONE catchy, high-conversion video description based on this transcript. Include 3-4 bullet points of key takeaways and relevant hashtags. Do not provide multiple versions or choices. Output the final text only: \n\n${transcript}`;
          // Run Gemini generation
          const [summaryResult, descriptionResult] = await Promise.all([
            model.generateContent(summaryPrompt),
            model.generateContent(descriptionPrompt),
          ]);

          const summary = summaryResult.response.text();
          const description = descriptionResult.response.text();

          // Save results to DB
          await prisma.video.update({
            where: { muxAssetId: assetId },
            data: {
              transcript,
              summary,
              description,
              status: "COMPLETED", // Or "READY" based on your preference
            },
          });
          console.log(`Successfully generated AI content for asset: ${assetId}`);
        }
      }
    }

    // 4. Asset Errored
    if (type === "video.asset.errored") {
      await prisma.video.update({
        where: { muxAssetId: data.id },
        data: { status: "FAILED" },
      });
    }

    return NextResponse.json({ received: true });
  } catch (error: any) {
    console.error("Webhook error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}