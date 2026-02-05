import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";

export const runtime = "nodejs";

export async function GET() {
  try {
    const videos = await prisma.video.findMany({
      orderBy: { createdAt: "desc" },
    });

    const formatted = videos.map((video) => {
      const playbackId = video.muxPlaybackId || null;
      const thumbnailUrl = playbackId
        ? `https://image.mux.com/${playbackId}/thumbnail.jpg?time=0`
        : null;

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

