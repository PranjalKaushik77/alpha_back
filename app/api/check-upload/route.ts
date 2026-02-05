// app/api/check-upload/route.ts
// After the file is uploaded to Mux, the frontend polls this to see if the asset
// has been created. When it has, we create/update the Video in the database and
// return the assetId so the user can proceed to "Generate Summary".

export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import mux from "@/lib/mux";
import prisma from "@/lib/prisma";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { uploadId } = body;

    if (!uploadId || typeof uploadId !== "string") {
      return NextResponse.json(
        { error: "uploadId is required" },
        { status: 400 }
      );
    }

    const upload = await mux.video.uploads.retrieve(uploadId);

    if (!upload.asset_id) {
      return NextResponse.json({
        assetId: null,
        status: upload.status,
        message:
          upload.status === "waiting"
            ? "Asset not ready yet"
            : upload.status === "errored"
              ? upload.error?.message || "Upload errored"
              : upload.status,
      });
    }

    const assetId = upload.asset_id;

    // Optionally get playback ID if asset is already ready
    let muxPlaybackId: string | null = null;
    try {
      const asset = await mux.video.assets.retrieve(assetId);
      muxPlaybackId = asset.playback_ids?.[0]?.id ?? null;
    } catch {
      // Asset may still be processing
    }

    const status = muxPlaybackId ? "READY" : "UPLOADED";

    const video = await prisma.video.upsert({
      where: { muxAssetId: assetId },
      update: {
        muxUploadId: uploadId,
        ...(muxPlaybackId && { muxPlaybackId }),
        status,
      },
      create: {
        muxUploadId: uploadId,
        muxAssetId: assetId,
        muxPlaybackId: muxPlaybackId,
        status,
      },
    });

    return NextResponse.json({
      assetId,
      video: { id: video.id },
      status,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Check upload failed";
    console.error("Check upload error:", err);
    return NextResponse.json(
      { error: message, assetId: null },
      { status: 500 }
    );
  }
}
