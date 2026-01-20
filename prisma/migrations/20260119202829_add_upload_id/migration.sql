-- CreateTable
CREATE TABLE "Video" (
    "id" TEXT NOT NULL,
    "muxUploadId" TEXT NOT NULL,
    "muxAssetId" TEXT,
    "muxPlaybackId" TEXT,
    "status" TEXT NOT NULL,
    "transcript" TEXT,
    "summary" TEXT,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Video_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Video_muxUploadId_key" ON "Video"("muxUploadId");

-- CreateIndex
CREATE UNIQUE INDEX "Video_muxAssetId_key" ON "Video"("muxAssetId");
