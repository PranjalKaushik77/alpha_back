"use client";

import { useEffect, useState } from "react";
import MuxPlayer from "@mux/mux-player-react";

type LogEntry = {
  id: number;
  time: string;
  msg: string;
};

type UploadData = {
  uploadUrl: string;
  uploadId: string;
  muxAssetId?: string | null;
  videoId?: string | null;
};

type VideoItem = {
  id: string;
  muxPlaybackId: string | null;
  muxThumbnailUrl: string | null;
  status: string;
  summary: string | null;
  description: string | null;
  transcript: string | null;
  createdAt: string;
  updatedAt: string;
};

type ProcessResult = {
  video: {
    summary?: string | null;
    description?: string | null;
  };
};

type TabKey = "upload" | "gallery";

export default function VideoPipeline() {
  const [status, setStatus] = useState<string>("idle");
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [uploadData, setUploadData] = useState<UploadData | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [processResult, setProcessResult] = useState<ProcessResult | null>(null);
  const [progress, setProgress] = useState<number>(0);
  const [activeTab, setActiveTab] = useState<TabKey>("upload");

  const [videos, setVideos] = useState<VideoItem[]>([]);
  const [videosLoading, setVideosLoading] = useState<boolean>(false);
  const [videosError, setVideosError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [selectedVideo, setSelectedVideo] = useState<VideoItem | null>(null);
  const [showTranscript, setShowTranscript] = useState<boolean>(true);

  const addLog = (msg: string) => {
    const time = new Date().toISOString().split("T")[1].split(".")[0];
    setLogs((prev) => [...prev, { time, msg, id: Date.now() }]);
  };

  const handleCreateUpload = async () => {
    try {
      setStatus("creating_upload");
      addLog("🔄 Requesting upload URL...");
      const res = await fetch("/api/upload", { method: "POST" });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setUploadData(data);
      addLog(`✓ Upload URL created`);
      addLog(`ID: ${data.uploadId.slice(0, 12)}...`);
      setStatus("ready_to_upload");
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      addLog(`❌ ${message}`);
      setStatus("error");
    }
  };

  // Fetch videos when the Gallery tab becomes active
  useEffect(() => {
    const fetchVideos = async () => {
      try {
        setVideosLoading(true);
        setVideosError(null);
        const res = await fetch("/api/videos");
        if (!res.ok) {
          throw new Error("Failed to fetch videos");
        }
        const data = await res.json();
        setVideos(data.videos || []);
      } catch (error: any) {
        setVideosError(error.message || "Something went wrong");
      } finally {
        setVideosLoading(false);
      }
    };

    if (activeTab === "gallery") {
      fetchVideos();
    }
  }, [activeTab]);

  const handleUploadFile = async () => {
    if (!file) {
      addLog("❌ No file selected");
      return;
    }
    if (!uploadData?.uploadUrl) {
      addLog("❌ Get upload URL first");
      return;
    }

    try {
      setStatus("uploading");
      const sizeMB = (file.size / 1024 / 1024).toFixed(2);
      addLog(`⬆️  Uploading ${file.name} (${sizeMB} MB)...`);
      setProgress(10);

      const uploadResponse = await fetch(uploadData.uploadUrl, {
        method: "PUT",
        body: file,
        headers: { "content-type": file.type || "video/mp4" },
      });

      if (!uploadResponse.ok) {
        const errorText = await uploadResponse.text();
        throw new Error(`Upload failed: ${uploadResponse.status}`);
      }

      setProgress(80);
      addLog("✓ File uploaded to Mux");
      addLog("⏳ Waiting for asset creation...");

      await new Promise((r) => setTimeout(r, 3000));

      let assetId = null;
      let videoId = null;

      for (let attempt = 1; attempt <= 5; attempt++) {
        setProgress(80 + (attempt / 5) * 10);
        const checkRes = await fetch("/api/check-upload", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ uploadId: uploadData.uploadId }),
        });

        if (!checkRes.ok) throw new Error("Check upload failed");

        const checkData = await checkRes.json();
        if (checkData.assetId) {
          assetId = checkData.assetId;
          videoId = checkData.video?.id || null;
          break;
        }

        if (attempt < 5) {
          await new Promise((r) => setTimeout(r, 2000));
        }
      }

      if (assetId) {
        addLog(`✓ Asset created: ${assetId.slice(0, 12)}...`);
        setUploadData({ ...uploadData, muxAssetId: assetId, videoId });
        setProgress(100);
        setStatus("uploaded");
      } else {
        addLog("⚠️  Asset not ready yet");
        setStatus("uploaded");
      }
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      addLog(`❌ ${message}`);
      setStatus("error");
    }
  };

  const handleProcessVideo = async () => {
    if (!uploadData?.muxAssetId) {
      addLog("⚠️  Wait for upload to complete");
      return;
    }

    try {
      setStatus("processing");
      addLog("🤖 Processing video with AI...");
      setProgress(0);

      const res = await fetch("/api/process-video", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ muxAssetId: uploadData.muxAssetId }),
      });

      const data = await res.json();
      if (data.error) {
        addLog(`❌ ${data.error}`);
        if (res.status === 404) {
          addLog("💡 Mux still transcoding. Wait 1-2 minutes.");
        }
        setStatus("error");
        return;
      }

      setProcessResult(data);
      setProgress(100);
      addLog("✓ Processing complete!");
      setStatus("complete");
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      addLog(`❌ ${message}`);
      setStatus("error");
    }
  };

  const isUploading = status === "uploading";
  const isProcessing = status === "processing";
  const isComplete = status === "complete";

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950">
      {/* Animated background elements */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -right-40 w-80 h-80 bg-blue-500/10 rounded-full blur-3xl animate-pulse"></div>
        <div className="absolute -bottom-40 -left-40 w-80 h-80 bg-cyan-500/10 rounded-full blur-3xl animate-pulse" style={{ animationDelay: "1s" }}></div>
      </div>

      <div className="relative z-10">
        {/* Header */}
        <div className="border-b border-slate-800/50 backdrop-blur-sm sticky top-0 z-20">
          <div className="max-w-5xl mx-auto px-6 py-8">
            <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-gradient-to-br from-blue-500 to-cyan-500 rounded-lg">
                  <svg className="w-5 h-5 text-white" fill="currentColor" viewBox="0 0 20 20">
                    <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                  </svg>
                </div>
                <div>
                  <h1 className="text-3xl font-bold bg-gradient-to-r from-blue-400 to-cyan-400 bg-clip-text text-transparent">
                    AlphaHub
                  </h1>
                  <p className="text-slate-400 text-sm">
                    Upload, process, and browse AI-enriched videos
                  </p>
                </div>
              </div>

              {/* Tabs */}
              <div className="inline-flex items-center rounded-full border border-slate-700 bg-slate-900/60 p-1 text-xs md:text-sm">
                <button
                  onClick={() => setActiveTab("upload")}
                  className={`px-4 py-1.5 rounded-full transition-all ${
                    activeTab === "upload"
                      ? "bg-slate-100 text-slate-900 shadow-sm"
                      : "text-slate-400 hover:text-slate-100"
                  }`}
                >
                  Upload
                </button>
                <button
                  onClick={() => setActiveTab("gallery")}
                  className={`px-4 py-1.5 rounded-full transition-all ${
                    activeTab === "gallery"
                      ? "bg-slate-100 text-slate-900 shadow-sm"
                      : "text-slate-400 hover:text-slate-100"
                  }`}
                >
                  Gallery
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Main Content */}
        <div className="max-w-5xl mx-auto px-6 py-10">
          {activeTab === "upload" && (
            <>
              {/* Pipeline Steps */}
              <div className="grid gap-6 mb-8">
                {/* Step 1: Initialize */}
            <div className={`group rounded-2xl border transition-all duration-300 ${
              uploadData
                ? "border-green-500/50 bg-green-500/5"
                : "border-slate-700 bg-slate-800/30 hover:border-slate-600"
            } p-6`}>
              <div className="flex items-start justify-between mb-4">
                <div className="flex items-center gap-3">
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm ${
                    uploadData
                      ? "bg-green-500/20 text-green-400"
                      : "bg-blue-500/20 text-blue-400"
                  }`}>
                    1
                  </div>
                  <div>
                    <h3 className="font-semibold text-white">Initialize Upload</h3>
                    <p className="text-xs text-slate-400 mt-1">
                      {uploadData ? "Ready to upload" : "Get upload credentials"}
                    </p>
                  </div>
                </div>
                {uploadData && (
                  <svg className="w-5 h-5 text-green-500" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                  </svg>
                )}
              </div>
              <button
                onClick={handleCreateUpload}
                disabled={!!uploadData}
                className="w-full py-2.5 px-4 bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-500 hover:to-blue-600 disabled:from-green-600 disabled:to-green-700 disabled:opacity-75 text-white rounded-lg font-medium transition-all duration-200 disabled:cursor-not-allowed"
              >
                {uploadData ? "✓ Upload URL Ready" : "Get Upload URL"}
              </button>
            </div>

                {/* Step 2: Upload */}
            <div className={`group rounded-2xl border transition-all duration-300 ${
              file && uploadData
                ? "border-green-500/50 bg-green-500/5"
                : "border-slate-700 bg-slate-800/30"
            } p-6 ${!uploadData && "opacity-50 pointer-events-none"}`}>
              <div className="flex items-start justify-between mb-4">
                <div className="flex items-center gap-3">
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm ${
                    file && uploadData
                      ? "bg-green-500/20 text-green-400"
                      : "bg-purple-500/20 text-purple-400"
                  }`}>
                    2
                  </div>
                  <div>
                    <h3 className="font-semibold text-white">Upload Video</h3>
                    <p className="text-xs text-slate-400 mt-1">
                      {file
                        ? `${file.name} • ${(file.size / 1024 / 1024).toFixed(2)} MB`
                        : "Select a video file"}
                    </p>
                  </div>
                </div>
                {file && uploadData && (
                  <svg className="w-5 h-5 text-green-500" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                  </svg>
                )}
              </div>

              <div className="space-y-3">
                <label className="block">
                  <div className="border-2 border-dashed border-slate-600 rounded-xl p-6 text-center cursor-pointer hover:border-slate-500 transition-colors">
                    <svg className="w-8 h-8 text-slate-400 mx-auto mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <p className="text-sm font-medium text-slate-300">
                      Click to select video
                    </p>
                    <p className="text-xs text-slate-500 mt-1">MP4, WebM, or other formats</p>
                    <input
                      type="file"
                      accept="video/*"
                      onChange={(e) => {
                        const selectedFile = e.target.files?.[0];
                        setFile(selectedFile || null);
                        if (selectedFile) {
                          addLog(
                            `📹 ${selectedFile.name} (${(selectedFile.size / 1024 / 1024).toFixed(2)} MB)`
                          );
                        }
                      }}
                      className="hidden"
                    />
                  </div>
                </label>

                <button
                  onClick={handleUploadFile}
                  disabled={!file || !uploadData || isUploading}
                  className="w-full py-3 px-4 bg-gradient-to-r from-purple-600 to-purple-700 hover:from-purple-500 hover:to-purple-600 disabled:opacity-50 text-white rounded-lg font-medium transition-all duration-200 flex items-center justify-center gap-2 disabled:cursor-not-allowed"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19v-14m0 0l-7 7m7-7l7 7" />
                  </svg>
                  {isUploading ? `Uploading... ${progress}%` : "Upload to Mux"}
                </button>

                {isUploading && (
                  <div className="w-full bg-slate-700 rounded-full h-2 overflow-hidden">
                    <div
                      className="bg-gradient-to-r from-purple-500 to-purple-400 h-full transition-all duration-300"
                      style={{ width: `${progress}%` }}
                    ></div>
                  </div>
                )}
              </div>
            </div>

                {/* Step 3: Process */}
            <div className={`group rounded-2xl border transition-all duration-300 ${
              isComplete
                ? "border-green-500/50 bg-green-500/5"
                : "border-slate-700 bg-slate-800/30"
            } p-6 ${!uploadData?.muxAssetId && "opacity-50 pointer-events-none"}`}>
              <div className="flex items-start justify-between mb-4">
                <div className="flex items-center gap-3">
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm ${
                    isComplete
                      ? "bg-green-500/20 text-green-400"
                      : "bg-cyan-500/20 text-cyan-400"
                  }`}>
                    3
                  </div>
                  <div>
                    <h3 className="font-semibold text-white">AI Processing</h3>
                    <p className="text-xs text-slate-400 mt-1">
                      {isComplete
                        ? "Processing complete"
                        : "Generate summary & insights"}
                    </p>
                  </div>
                </div>
                {isComplete && (
                  <svg className="w-5 h-5 text-green-500" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                  </svg>
                )}
              </div>

              <button
                onClick={handleProcessVideo}
                disabled={!uploadData?.muxAssetId || isProcessing}
                className="w-full py-3 px-4 bg-gradient-to-r from-cyan-600 to-cyan-700 hover:from-cyan-500 hover:to-cyan-600 disabled:opacity-50 text-white rounded-lg font-medium transition-all duration-200 flex items-center justify-center gap-2 disabled:cursor-not-allowed"
              >
                  <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M11.3 1.046A1 1 0 0110 2v5H5a1 1 0 00-.82 1.573l7 10A1 1 0 0013 17v-5h5a1 1 0 00.82-1.573l-7-10a1 1 0 00-.82-.381z" clipRule="evenodd" />
                  </svg>
                {isProcessing ? "Processing..." : "Generate Summary"}
              </button>

              {uploadData?.muxAssetId && !isComplete && (
                <p className="text-xs text-slate-400 mt-3">
                  💡 Wait 1-2 minutes for Mux transcoding before processing
                </p>
              )}
            </div>
          </div>

              {/* Results */}
              {isComplete && processResult && (
                <div className="rounded-2xl border border-green-500/50 bg-green-500/5 p-8 mb-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
                  <div className="flex items-center gap-2 mb-6">
                    <svg className="w-6 h-6 text-green-400" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                    </svg>
                    <h2 className="text-xl font-bold text-white">Results</h2>
                  </div>

                  <div className="space-y-6">
                    <div>
                      <h3 className="text-sm font-semibold text-slate-300 uppercase tracking-wide mb-2">
                        Summary
                      </h3>
                      <p className="text-slate-200 leading-relaxed">
                        {processResult.video.summary}
                      </p>
                    </div>

                    <div className="h-px bg-gradient-to-r from-green-500/0 via-green-500/50 to-green-500/0"></div>

                    <div>
                      <h3 className="text-sm font-semibold text-slate-300 uppercase tracking-wide mb-2">
                        Description
                      </h3>
                      <p className="text-slate-200 leading-relaxed">
                        {processResult.video.description}
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {/* Logs Console */}
              <div className="rounded-2xl border border-slate-700 bg-slate-800/50 backdrop-blur overflow-hidden">
                <div className="px-6 py-4 border-b border-slate-700 bg-slate-900/50">
                  <div className="flex items-center gap-2">
                    <svg className="w-4 h-4 text-slate-400" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-12a1 1 0 10-2 0v4a1 1 0 00.293.707l2.828 2.829a1 1 0 101.415-1.415L11 9.586V6z" clipRule="evenodd" />
                    </svg>
                    <h3 className="font-semibold text-white text-sm">Activity Log</h3>
                    <span className="ml-auto text-xs text-slate-500">
                      {logs.length} events
                    </span>
                  </div>
                </div>

                <div className="max-h-64 overflow-y-auto">
                  <div className="divide-y divide-slate-700/50">
                    {logs.length === 0 ? (
                      <div className="px-6 py-8 text-center text-slate-500 text-sm">
                        Waiting for actions...
                      </div>
                    ) : (
                      logs.map((log) => (
                        <div
                          key={log.id}
                          className="px-6 py-3 text-sm text-slate-300 font-mono hover:bg-slate-700/20 transition-colors"
                        >
                          <span className="text-slate-500">{log.time}</span>
                          <span className="text-slate-400 mx-2">›</span>
                          <span>{log.msg}</span>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </div>
            </>
          )}

          {activeTab === "gallery" && (
            <div className="space-y-6">
              {/* Search + info */}
              <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                <div>
                  <h2 className="text-xl font-semibold text-white">Video Gallery</h2>
                  <p className="text-xs text-slate-400 mt-1">
                    Browse processed videos, watch them, and read transcripts.
                  </p>
                </div>
                <div className="w-full md:w-64">
                  <div className="relative">
                    <input
                      type="text"
                      placeholder="Search by summary or description"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="w-full rounded-lg bg-slate-900/70 border border-slate-700 px-9 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-cyan-500/70"
                    />
                    <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-slate-500">
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M21 21l-4.35-4.35M10.5 18a7.5 7.5 0 100-15 7.5 7.5 0 000 15z"
                        />
                      </svg>
                    </span>
                  </div>
                </div>
              </div>

              {/* Loading / error / empty states */}
              {videosLoading && (
                <div className="flex items-center justify-center py-16 text-slate-400 text-sm">
                  <span className="mr-2 h-4 w-4 animate-spin rounded-full border-2 border-slate-600 border-t-transparent" />
                  Loading videos...
                </div>
              )}

              {videosError && !videosLoading && (
                <div className="rounded-xl border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-200">
                  {videosError}
                </div>
              )}

              {!videosLoading && !videosError && videos.length === 0 && (
                <div className="rounded-xl border border-slate-700 bg-slate-900/60 px-6 py-10 text-center text-sm text-slate-400">
                  No videos yet. Switch to the Upload tab to add your first one.
                </div>
              )}

              {/* Grid */}
              {!videosLoading && !videosError && videos.length > 0 && (
                <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
                  {videos
                    .filter((video) => {
                      if (!searchQuery.trim()) return true;
                      const q = searchQuery.toLowerCase();
                      return (
                        (video.summary || "").toLowerCase().includes(q) ||
                        (video.description || "").toLowerCase().includes(q) ||
                        (video.transcript || "").toLowerCase().includes(q)
                      );
                    })
                    .map((video) => {
                      const title =
                        video.summary?.split("\n")[0] ||
                        video.description?.split("\n")[0] ||
                        "Untitled video";

                      return (
                        <button
                          key={video.id}
                          onClick={() => {
                            setSelectedVideo(video);
                            setShowTranscript(true);
                          }}
                          className="group flex flex-col overflow-hidden rounded-2xl border border-slate-800 bg-slate-900/60 text-left shadow-sm transition-all hover:-translate-y-1 hover:border-cyan-500/60 hover:shadow-cyan-500/10"
                        >
                          <div className="relative aspect-video overflow-hidden bg-slate-800">
                            {video.muxThumbnailUrl ? (
                              <img
                                src={video.muxThumbnailUrl}
                                alt={title}
                                className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                              />
                            ) : (
                              <div className="flex h-full w-full items-center justify-center text-slate-500 text-xs">
                                No thumbnail
                              </div>
                            )}
                            <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/50 via-transparent to-black/20 opacity-80" />
                            <div className="absolute bottom-2 left-2 flex items-center gap-2 text-[10px] font-medium">
                              <span className="rounded-full bg-slate-900/80 px-2 py-0.5 text-slate-200">
                                {video.status}
                              </span>
                              {video.muxPlaybackId && (
                                <span className="rounded-full bg-cyan-500/90 px-2 py-0.5 text-slate-900">
                                  Playable
                                </span>
                              )}
                            </div>
                          </div>
                          <div className="flex flex-1 flex-col px-3.5 py-3">
                            <h3 className="line-clamp-2 text-sm font-semibold text-slate-100">
                              {title}
                            </h3>
                            <p className="mt-1 line-clamp-2 text-xs text-slate-400">
                              {video.description || "No description yet"}
                            </p>
                            <span className="mt-3 inline-flex items-center text-[11px] font-medium text-cyan-400">
                              View details
                              <svg
                                className="ml-1 h-3 w-3"
                                fill="none"
                                stroke="currentColor"
                                viewBox="0 0 24 24"
                              >
                                <path
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                  strokeWidth={2}
                                  d="M9 5l7 7-7 7"
                                />
                              </svg>
                            </span>
                          </div>
                        </button>
                      );
                    })}
                </div>
              )}

              {/* Video modal */}
              {selectedVideo && (
                <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/60 px-4 py-6">
                  <div className="relative flex w-full max-w-5xl flex-col overflow-hidden rounded-2xl border border-slate-800 bg-slate-950/95 shadow-xl">
                    <div className="flex items-center justify-between border-b border-slate-800 px-5 py-3">
                      <div className="flex items-center gap-2">
                        <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-cyan-500/20 text-xs text-cyan-300">
                          ▶
                        </span>
                        <div>
                          <h3 className="text-sm font-semibold text-slate-100 line-clamp-1">
                            {selectedVideo.summary?.split("\n")[0] ||
                              selectedVideo.description?.split("\n")[0] ||
                              "Video details"}
                          </h3>
                          <p className="text-[11px] text-slate-500">
                            Status: {selectedVideo.status}
                          </p>
                        </div>
                      </div>
                      <button
                        onClick={() => setSelectedVideo(null)}
                        className="rounded-full border border-slate-700 bg-slate-900/70 p-1.5 text-slate-400 hover:border-slate-500 hover:text-slate-100"
                      >
                        <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M6 18L18 6M6 6l12 12"
                          />
                        </svg>
                      </button>
                    </div>

                    <div className="grid gap-4 p-4 md:grid-cols-5">
                      {/* Player */}
                      <div className="md:col-span-3">
                        <div className="relative aspect-video overflow-hidden rounded-xl border border-slate-800 bg-black">
                          {selectedVideo.muxPlaybackId ? (
                            <MuxPlayer
                              streamType="on-demand"
                              playbackId={selectedVideo.muxPlaybackId}
                              metadata={{
                                video_title: selectedVideo.summary?.split("\n")[0] || "Video",
                                video_id: selectedVideo.id,
                              }}
                              className="h-full w-full bg-black"
                              style={{ aspectRatio: "16/9", width: "100%" }}
                              primaryColor="white"
                            />
                          ) : (
                            <div className="flex h-full items-center justify-center text-xs text-slate-500">
                              Video not ready to play yet.
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Details */}
                      <div className="flex flex-col gap-3 md:col-span-2">
                        <div>
                          <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                            Summary
                          </h4>
                          <p className="mt-1 text-xs text-slate-100 whitespace-pre-wrap max-h-32 overflow-y-auto">
                            {selectedVideo.summary || "No summary yet."}
                          </p>
                        </div>

                        <div className="h-px bg-slate-800" />

                        <div>
                          <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                            Description
                          </h4>
                          <p className="mt-1 text-xs text-slate-100 whitespace-pre-wrap max-h-32 overflow-y-auto">
                            {selectedVideo.description || "No description yet."}
                          </p>
                        </div>

                        <div className="h-px bg-slate-800" />

                        <div>
                          <button
                            onClick={() => setShowTranscript((prev) => !prev)}
                            className="flex w-full items-center justify-between rounded-lg border border-slate-700 bg-slate-900/70 px-3 py-2 text-xs font-medium text-slate-100 hover:border-cyan-500/60 hover:text-cyan-100"
                          >
                            <span>Transcript</span>
                            <span className="flex items-center text-[10px] text-slate-400">
                              {showTranscript ? "Hide" : "Show"}
                              <svg
                                className={`ml-1 h-3 w-3 transition-transform ${
                                  showTranscript ? "rotate-180" : ""
                                }`}
                                fill="none"
                                stroke="currentColor"
                                viewBox="0 0 24 24"
                              >
                                <path
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                  strokeWidth={2}
                                  d="M19 9l-7 7-7-7"
                                />
                              </svg>
                            </span>
                          </button>
                          {showTranscript && (
                            <div className="mt-2 max-h-40 overflow-y-auto rounded-lg border border-slate-800 bg-slate-950/80 p-2 text-[11px] leading-relaxed text-slate-200 whitespace-pre-wrap">
                              {selectedVideo.transcript || "Transcript not available yet."}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}