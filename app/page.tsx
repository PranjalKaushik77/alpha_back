"use client";

import { useState } from "react";

export default function TestPage() {
    const [status, setStatus] = useState("idle");
    const [logs, setLogs] = useState<string[]>([]);
    const [uploadData, setUploadData] = useState<any>(null);
    const [file, setFile] = useState<File | null>(null);
    const [processResult, setProcessResult] = useState<any>(null);

    const addLog = (msg: string) => setLogs((prev) => [...prev, `${new Date().toISOString().split('T')[1].split('.')[0]} - ${msg}`]);

    const handleCreateUpload = async () => {
        try {
            setStatus("creating_upload");
            addLog("Requesting upload URL...");
            const res = await fetch("/api/upload", { method: "POST" });
            const data = await res.json();

            if (data.error) throw new Error(data.error);

            setUploadData(data);
            addLog(`Upload URL created. Upload ID: ${data.uploadId}`);
            addLog("Ready to upload file. No database record created yet.");
            setStatus("ready_to_upload");
        } catch (e: any) {
            addLog(`Error: ${e.message}`);
            setStatus("error");
        }
    };

    const handleUploadFile = async () => {
        console.log("handleUploadFile called", { file, uploadData, status });
        
        if (!file) {
            addLog("Error: No file selected");
            return;
        }
        
        if (!uploadData?.uploadUrl) {
            addLog("Error: Upload URL not available. Please click 'Get Upload URL' first.");
            return;
        }

        try {
            setStatus("uploading");
            addLog(`Uploading file ${file.name} (${(file.size / 1024 / 1024).toFixed(2)} MB)...`);
            addLog(`Upload URL: ${uploadData.uploadUrl.substring(0, 50)}...`);
            console.log("Starting upload to:", uploadData.uploadUrl);

            const uploadResponse = await fetch(uploadData.uploadUrl, {
                method: "PUT",
                body: file,
                headers: {
                    "content-type": file.type || "video/mp4",
                },
            });

            if (!uploadResponse.ok) {
                const errorText = await uploadResponse.text();
                throw new Error(`Upload failed: ${uploadResponse.status} ${uploadResponse.statusText}. ${errorText}`);
            }

            addLog("Upload complete! Checking for asset ID...");
            
            // Wait a moment for Mux to create the asset
            await new Promise(r => setTimeout(r, 3000));
            
            // Check upload status to get asset_id (retry a few times)
            let assetId = null;
            let videoId = null;
            for (let attempt = 1; attempt <= 5; attempt++) {
                addLog(`Checking for asset ID (attempt ${attempt}/5)...`);
                
                const checkRes = await fetch("/api/check-upload", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ uploadId: uploadData.uploadId }),
                });
                
                if (!checkRes.ok) {
                    const errorData = await checkRes.json();
                    throw new Error(`Check upload failed: ${errorData.error || checkRes.statusText}`);
                }
                
                const checkData = await checkRes.json();
                
                if (checkData.assetId) {
                    assetId = checkData.assetId;
                    videoId = checkData.video?.id || null;
                    break;
                }
                
                if (attempt < 5) {
                    await new Promise(r => setTimeout(r, 2000));
                }
            }
            
            if (assetId) {
                addLog(`✓ Asset ID: ${assetId}`);
                addLog(`✓ Database record created: ${videoId || 'N/A'}`);
                setUploadData({ ...uploadData, muxAssetId: assetId, videoId });
                setStatus("uploaded");
            } else {
                addLog("⚠ Asset ID not ready yet. Mux is still processing...");
                addLog("You can manually check upload status or wait for webhook.");
                setStatus("uploaded");
            }
        } catch (e: any) {
            addLog(`❌ Upload error: ${e.message}`);
            console.error("Upload error details:", e);
            setStatus("error");
        }
    };

    const handleProcessVideo = async () => {
        if (!uploadData?.muxAssetId) {
            addLog("Error: Asset ID not available. Wait a moment and try again.");
            return;
        }

        try {
            setStatus("processing");
            addLog(`Triggering processing for Asset ID: ${uploadData.muxAssetId}...`);
            addLog("Note: This may fail if Mux hasn't finished transcoding yet (wait 1-2 mins)");

            const res = await fetch("/api/process-video", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ muxAssetId: uploadData.muxAssetId }),
            });

            const data = await res.json();
            if (data.error) {
                addLog(`Server Error: ${data.error}`);
                if (res.status === 404) addLog("Tip: Mux is likely still processing. Wait a bit and try again.");
                return;
            }

            setProcessResult(data);
            addLog("Processing complete! Summary generated.");
            setStatus("complete");
        } catch (e: any) {
            addLog(`Error: ${e.message}`);
        }
    };

    return (
        <div className="p-8 max-w-2xl mx-auto font-sans">
            <h1 className="text-2xl font-bold mb-6">Pipeline Test Page</h1>

            <div className="space-y-6">
                {/* Step 1: Create Upload */}
                <div className="p-4 border rounded bg-gray-50">
                    <h2 className="font-semibold mb-2">1. Initialize Upload</h2>
                    <button
                        onClick={handleCreateUpload}
                        disabled={status !== "idle"}
                        className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
                    >
                        Get Upload URL
                    </button>
                </div>

                {/* Step 2: Upload File */}
                <div className={`p-4 border rounded bg-gray-50 ${!uploadData ? 'opacity-50' : ''}`}>
                    <h2 className="font-semibold mb-2">2. Upload Video</h2>
                    <input
                        type="file"
                        accept="video/*"
                        onChange={(e) => {
                            const selectedFile = e.target.files?.[0] || null;
                            setFile(selectedFile);
                            if (selectedFile) {
                                addLog(`File selected: ${selectedFile.name} (${(selectedFile.size / 1024 / 1024).toFixed(2)} MB)`);
                            }
                        }}
                        className="block mb-2 w-full"
                        disabled={!uploadData}
                    />
                    {file && (
                        <p className="text-sm text-gray-600 mb-2">
                            Selected: {file.name} ({(file.size / 1024 / 1024).toFixed(2)} MB)
                        </p>
                    )}
                    <button
                        onClick={(e) => {
                            e.preventDefault();
                            console.log("Button clicked!", { file, uploadData, status });
                            handleUploadFile();
                        }}
                        disabled={!file || !uploadData || status === "uploading"}
                        className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed"
                        title={!file ? "Please select a file first" : !uploadData ? "Please get upload URL first" : ""}
                    >
                        {status === "uploading" ? "Uploading..." : "Upload to Mux"}
                    </button>
                    {!file && uploadData && (
                        <p className="text-sm text-red-500 mt-2">⚠ Please select a video file</p>
                    )}
                    {file && !uploadData && (
                        <p className="text-sm text-red-500 mt-2">⚠ Please get upload URL first</p>
                    )}
                </div>

                {/* Step 3: Trigger Processing */}
                <div className={`p-4 border rounded bg-gray-50 ${status !== "uploaded" && status !== "complete" ? 'opacity-50' : ''}`}>
                    <h2 className="font-semibold mb-2">3. Process with AI</h2>
                    <p className="text-sm text-gray-500 mb-2">
                        {uploadData?.muxAssetId 
                            ? "Asset ID available. Wait ~2 minutes for Mux to generate captions, then click below."
                            : "Waiting for asset ID... Upload completed but Mux is still creating the asset."}
                    </p>
                    <button
                        onClick={handleProcessVideo}
                        disabled={!uploadData?.muxAssetId || (status !== "uploaded" && status !== "complete")}
                        className="px-4 py-2 bg-purple-600 text-white rounded hover:bg-purple-700 disabled:opacity-50"
                    >
                        Generate Summary
                    </button>
                </div>

                {/* Results Display */}
                {processResult && (
                    <div className="p-4 border rounded bg-white shadow">
                        <h3 className="font-bold mb-2">Results</h3>
                        <div className="space-y-2">
                            <div>
                                <span className="font-semibold">Summary:</span>
                                <p className="text-sm text-gray-700 bg-gray-50 p-2 rounded">{processResult.video.summary}</p>
                            </div>
                            <div>
                                <span className="font-semibold">Description:</span>
                                <p className="text-sm text-gray-700 bg-gray-50 p-2 rounded">{processResult.video.description}</p>
                            </div>
                        </div>
                    </div>
                )}

                {/* Logs Console */}
                <div className="mt-8 p-4 bg-black text-green-400 font-mono text-sm rounded h-48 overflow-y-auto">
                    <div className="font-bold text-gray-500 mb-2">Logs</div>
                    {logs.map((log, i) => (
                        <div key={i}>{log}</div>
                    ))}
                    {logs.length === 0 && <span className="opacity-50">Waiting for actions...</span>}
                </div>
            </div>
        </div>
    );
}
