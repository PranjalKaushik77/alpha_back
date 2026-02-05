import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";

export const runtime = "nodejs";

interface RouteParams {
  params: {
    id: string;
  };
}

export async function GET(_req: NextRequest, { params }: RouteParams) {
  try {
    const video = await prisma.video.findUnique({
      where: { id: params.id },
    });

    if (!video) {
      return NextResponse.json(
        { error: "Video not found" },
        { status: 404 }
      );
    }

    const playbackId = video.muxPlaybackId || null;
    const thumbnailUrl =
      video.muxThumbnailUrl ||
      (playbackId
        ? `https://image.mux.com/${playbackId}/thumbnail.jpg?time=0`
        : null);

    return NextResponse.json({
      id: video.id,
      muxPlaybackId: playbackId,
      muxThumbnailUrl: thumbnailUrl,
      status: video.status,
      summary: video.summary,
      description: video.description,
      transcript: video.transcript,
      createdAt: video.createdAt,
      updatedAt: video.updatedAt,
    });
  } catch (error: any) {
    console.error("Error fetching video:", error);
    return NextResponse.json(
      { error: error.message || "Failed to fetch video" },
      { status: 500 }
    );
  }
}

