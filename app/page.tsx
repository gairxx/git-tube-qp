"use client"

import { useState, useCallback, useEffect, useRef } from "react"
import { Download, Search, Film, Music, Settings2, Clock, Globe, Loader2, AlertCircle } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Badge } from "@/components/ui/badge"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Header } from "@/components/header"
import { DownloadQueue, type DownloadItem } from "@/components/download-queue"
import { SupportedSites } from "@/components/supported-sites"
import { VideoPreview } from "@/components/video-preview"

type Format = "video" | "audio"
type Quality = "best" | "2160p" | "1080p" | "720p" | "480p" | "320k" | "192k" | "128k"

interface VideoInfo {
  id: string
  title: string
  duration: number
  thumbnail: string
  uploader: string
  platform: string
  viewCount?: number
  likeCount?: number
  description?: string
  webpage_url: string
  formats?: Array<{
    format_id: string
    ext: string
    quality: string
    height?: number
    width?: number
    filesize?: number
    hasVideo: boolean
    hasAudio: boolean
  }>
}

export default function Home() {
  const [url, setUrl] = useState("")
  const [format, setFormat] = useState<Format>("video")
  const [quality, setQuality] = useState<Quality>("best")
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [videoInfo, setVideoInfo] = useState<VideoInfo | null>(null)
  const [downloads, setDownloads] = useState<DownloadItem[]>([])
  const pollingIntervals = useRef<Map<string, NodeJS.Timeout>>(new Map())
  const triggeredDownloads = useRef<Set<string>>(new Set())

  // Trigger a real browser download by pointing at the file-delivery route.
  // In the desktop app we instead move the local file to a user-chosen location.
  const triggerFileDownload = useCallback(async (downloadId: string, localPath?: string, filename?: string) => {
    if (triggeredDownloads.current.has(downloadId)) return
    triggeredDownloads.current.add(downloadId)

    if (window.gitTube && localPath) {
      try {
        const result = await window.gitTube.saveDownload({ path: localPath, filename })
        if (result.saved || result.canceled) return
      } catch (err) {
        console.error("Failed to save download:", err)
      }
    }

    const link = document.createElement("a")
    link.href = `/api/download/file?id=${downloadId}`
    link.rel = "noopener"
    document.body.appendChild(link)
    link.click()
    link.remove()
  }, [])

  // Format duration from seconds to mm:ss or hh:mm:ss
  const formatDuration = (seconds: number): string => {
    if (!seconds) return "0:00"
    const h = Math.floor(seconds / 3600)
    const m = Math.floor((seconds % 3600) / 60)
    const s = Math.floor(seconds % 60)
    if (h > 0) {
      return `${h}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`
    }
    return `${m}:${s.toString().padStart(2, "0")}`
  }

  // Format file size
  const formatSize = (bytes?: number): string => {
    if (!bytes) return "Unknown"
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`
  }

  // Poll download progress
  const pollDownloadProgress = useCallback((downloadId: string) => {
    const interval = setInterval(async () => {
      try {
        const response = await fetch(`/api/download?id=${downloadId}`)
        if (!response.ok) return
        
        const data = await response.json()
        
        setDownloads(prev => prev.map(d => {
          if (d.id === downloadId) {
            return {
              ...d,
              progress: data.progress || d.progress,
              status: data.status === "completed" ? "completed" : 
                      data.status === "error" ? "error" : 
                      d.status,
              size: data.filename || d.size,
              speed: data.speed,
              eta: data.eta,
            }
          }
          return d
        }))

        // Stop polling if complete or error
        if (data.status === "completed" || data.status === "error") {
          clearInterval(interval)
          pollingIntervals.current.delete(downloadId)

          if (data.status === "completed") {
            triggerFileDownload(downloadId, data.localPath, data.filename)
          }
        }
      } catch (err) {
        console.error("Error polling download:", err)
      }
    }, 1000)

    pollingIntervals.current.set(downloadId, interval)
  }, [triggerFileDownload])

  // Cleanup polling on unmount
  useEffect(() => {
    return () => {
      pollingIntervals.current.forEach(interval => clearInterval(interval))
    }
  }, [])

  const handleFetchInfo = useCallback(async () => {
    if (!url.trim()) return
    
    setIsLoading(true)
    setError(null)
    setVideoInfo(null)

    try {
      const response = await fetch("/api/video-info", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url }),
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || "Failed to fetch video info")
      }

      setVideoInfo({
        id: data.id,
        title: data.title,
        duration: data.duration,
        thumbnail: data.thumbnail,
        uploader: data.uploader,
        platform: data.extractor || "Unknown",
        viewCount: data.viewCount,
        likeCount: data.likeCount,
        description: data.description,
        webpage_url: data.webpage_url,
        formats: data.formats,
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred")
    } finally {
      setIsLoading(false)
    }
  }, [url])

  const handleDownload = useCallback(async () => {
    if (!videoInfo) return

    setError(null)

    try {
      const response = await fetch("/api/download", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          url: videoInfo.webpage_url || url,
          format,
          quality,
        }),
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || "Failed to start download")
      }

      const newDownload: DownloadItem = {
        id: data.downloadId,
        title: videoInfo.title,
        platform: videoInfo.platform,
        progress: 0,
        status: "downloading",
        format,
        quality: format === "video" ? quality : quality,
        size: "Downloading...",
      }

      setDownloads(prev => [newDownload, ...prev])
      setVideoInfo(null)
      setUrl("")

      // Start polling for progress
      pollDownloadProgress(data.downloadId)

    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to start download")
    }
  }, [videoInfo, url, format, quality, pollDownloadProgress])

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && url.trim() && !isLoading) {
      handleFetchInfo()
    }
  }

  return (
    <div className="min-h-screen bg-background">
      <Header />
      
      <main className="container mx-auto px-4 py-8 max-w-6xl">
        {/* Hero Section */}
        <section className="text-center mb-12">
          <h1 className="text-4xl md:text-5xl font-bold mb-4 text-balance">
            Download Videos from{" "}
            <span className="text-primary">1000+ Sites</span>
          </h1>
          <p className="text-muted-foreground text-lg max-w-2xl mx-auto text-pretty">
            Paste a video URL and download in your preferred format and quality. 
            Supports YouTube, Vimeo, TikTok, Twitter, and many more platforms.
          </p>
        </section>

        {/* Error Alert */}
        {error && (
          <Alert variant="destructive" className="mb-6">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {/* Main Download Card */}
        <Card className="mb-8 border-border/50 bg-card/50 backdrop-blur">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Download className="h-5 w-5 text-primary" />
              Download Video
            </CardTitle>
            <CardDescription>
              Paste a video URL from any supported platform
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* URL Input */}
            <div className="flex flex-col sm:flex-row gap-3">
              <div className="relative flex-1">
                <Globe className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="https://youtube.com/watch?v=..."
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  onKeyDown={handleKeyDown}
                  className="pl-10 h-12 bg-secondary/50 border-border/50"
                />
              </div>
              <Button
                onClick={handleFetchInfo}
                disabled={!url.trim() || isLoading}
                className="h-12 px-6"
              >
                {isLoading ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                ) : (
                  <Search className="h-4 w-4 mr-2" />
                )}
                {isLoading ? "Fetching..." : "Fetch Info"}
              </Button>
            </div>

            {/* Format & Quality Selection */}
            <div className="flex flex-col sm:flex-row gap-4">
              <div className="flex-1">
                <label className="text-sm font-medium mb-2 block text-muted-foreground">
                  Format
                </label>
                <div className="flex gap-2">
                  <Button
                    variant={format === "video" ? "default" : "secondary"}
                    onClick={() => {
                      setFormat("video")
                      setQuality("best")
                    }}
                    className="flex-1"
                  >
                    <Film className="h-4 w-4 mr-2" />
                    Video
                  </Button>
                  <Button
                    variant={format === "audio" ? "default" : "secondary"}
                    onClick={() => {
                      setFormat("audio")
                      setQuality("320k")
                    }}
                    className="flex-1"
                  >
                    <Music className="h-4 w-4 mr-2" />
                    Audio Only
                  </Button>
                </div>
              </div>

              <div className="flex-1">
                <label className="text-sm font-medium mb-2 block text-muted-foreground">
                  Quality
                </label>
                <Select value={quality} onValueChange={(v) => setQuality(v as Quality)}>
                  <SelectTrigger className="h-10 bg-secondary/50">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {format === "video" ? (
                      <>
                        <SelectItem value="best">Best Available</SelectItem>
                        <SelectItem value="2160p">4K (2160p)</SelectItem>
                        <SelectItem value="1080p">1080p (Full HD)</SelectItem>
                        <SelectItem value="720p">720p (HD)</SelectItem>
                        <SelectItem value="480p">480p (SD)</SelectItem>
                      </>
                    ) : (
                      <>
                        <SelectItem value="320k">320kbps (High)</SelectItem>
                        <SelectItem value="192k">192kbps (Medium)</SelectItem>
                        <SelectItem value="128k">128kbps (Low)</SelectItem>
                      </>
                    )}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Video Preview */}
            {videoInfo && (
              <VideoPreview
                videoInfo={{
                  title: videoInfo.title,
                  duration: formatDuration(videoInfo.duration),
                  thumbnail: videoInfo.thumbnail,
                  uploader: videoInfo.uploader,
                  platform: videoInfo.platform,
                  viewCount: videoInfo.viewCount,
                  formats: videoInfo.formats,
                }}
                format={format}
                quality={quality}
                onDownload={handleDownload}
                onCancel={() => setVideoInfo(null)}
                formatSize={formatSize}
              />
            )}
          </CardContent>
        </Card>

        {/* Tabs Section */}
        <Tabs defaultValue="queue" className="space-y-4">
          <TabsList className="bg-secondary/50 p-1">
            <TabsTrigger value="queue" className="data-[state=active]:bg-card">
              <Clock className="h-4 w-4 mr-2" />
              Downloads
              {downloads.length > 0 && (
                <Badge variant="secondary" className="ml-2 bg-primary/20 text-primary">
                  {downloads.length}
                </Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="sites" className="data-[state=active]:bg-card">
              <Globe className="h-4 w-4 mr-2" />
              Supported Sites
            </TabsTrigger>
            <TabsTrigger value="settings" className="data-[state=active]:bg-card">
              <Settings2 className="h-4 w-4 mr-2" />
              Settings
            </TabsTrigger>
          </TabsList>

          <TabsContent value="queue">
            <DownloadQueue downloads={downloads} setDownloads={setDownloads} />
          </TabsContent>

          <TabsContent value="sites">
            <SupportedSites />
          </TabsContent>

          <TabsContent value="settings">
            <Card className="border-border/50 bg-card/50">
              <CardHeader>
                <CardTitle>Download Settings</CardTitle>
                <CardDescription>Configure your download preferences</CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Default Format</label>
                    <Select defaultValue="video">
                      <SelectTrigger className="bg-secondary/50">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="video">Video (MP4)</SelectItem>
                        <SelectItem value="audio">Audio (MP3)</SelectItem>
                        <SelectItem value="webm">Video (WebM)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Default Quality</label>
                    <Select defaultValue="best">
                      <SelectTrigger className="bg-secondary/50">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="best">Best Available</SelectItem>
                        <SelectItem value="1080p">1080p</SelectItem>
                        <SelectItem value="720p">720p</SelectItem>
                        <SelectItem value="480p">480p</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">Output Template</label>
                  <Input 
                    defaultValue="%(title)s.%(ext)s" 
                    className="font-mono text-sm bg-secondary/50"
                  />
                  <p className="text-xs text-muted-foreground">
                    {"Available variables: %(title)s, %(uploader)s, %(upload_date)s, %(ext)s"}
                  </p>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </main>

      {/* Footer */}
      <footer className="border-t border-border/50 mt-16 py-8">
        <div className="container mx-auto px-4 text-center text-sm text-muted-foreground">
          <p>Powered by yt-dlp - Supports 1000+ video platforms</p>
          <p className="mt-2">
            <a href="https://github.com/gairxx/git-tube" className="text-primary hover:underline">
              View on GitHub
            </a>
          </p>
        </div>
      </footer>
    </div>
  )
}
