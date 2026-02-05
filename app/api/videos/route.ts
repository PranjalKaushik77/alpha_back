import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { Prisma } from "@prisma/client";



export const runtime = "nodejs";

export async function GET() {
  try {
    const videos = await prisma.video.findMany({
      orderBy: { createdAt: "desc" },
    });

    // Shape data and provide a computed thumbnail URL fallback
    const formatted = videos.map((video:Video) => {
      const playbackId = video.muxPlaybackId || null;
      const thumbnailUrl =
        video.muxThumbnailUrl ||
        (playbackId
          ? `https://image.mux.com/${playbackId}/thumbnail.jpg?time=0`
          : null);

      return {
        id: video.id,
        muxPlaybackId: playbackId,
        muxThumbnailUrl: thumbnailUrl,
        status: video.status,
        summary: video.summary,
        description: video.description,
        transcript: video.transcript,
        createdAt: video.createdAt,
        updatedAt: video.updatedAt,
      };
    });

    return NextResponse.json({ videos: formatted });
  } catch (error: any) {
    console.error("Error fetching videos:", error);
    return NextResponse.json(
      { error: error.message || "Failed to fetch videos" },
      { status: 500 }
    );
  }
}

