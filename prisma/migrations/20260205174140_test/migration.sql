-- AlterTable
ALTER TABLE "Video" ADD COLUMN     "isLiveRecording" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "liveStreamMuxId" TEXT;

-- CreateTable
CREATE TABLE "liveStream" (
    "id" TEXT NOT NULL,
    "muxLiveStreamId" TEXT NOT NULL,
    "streamKey" TEXT NOT NULL,
    "muxPlaybackId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'IDLE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "endedAt" TIMESTAMP(3),

    CONSTRAINT "liveStream_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "liveStream_muxLiveStreamId_key" ON "liveStream"("muxLiveStreamId");

-- CreateIndex
CREATE UNIQUE INDEX "liveStream_streamKey_key" ON "liveStream"("streamKey");

-- CreateIndex
CREATE INDEX "liveStream_status_idx" ON "liveStream"("status");

-- CreateIndex
CREATE INDEX "Video_isLiveRecording_idx" ON "Video"("isLiveRecording");

-- CreateIndex
CREATE INDEX "Video_status_idx" ON "Video"("status");
