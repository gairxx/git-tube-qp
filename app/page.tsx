"use client"

import { useState, useCallback } from "react"
import { Download, Search, Film, Music, Settings2, Clock, Globe, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Badge } from "@/components/ui/badge"
import { Header } from "@/components/header"
import { DownloadQueue, type DownloadItem } from "@/components/download-queue"
import { SupportedSites } from "@/components/supported-sites"
import { VideoPreview } from "@/components/video-preview"

type Format = "video" | "audio"
type Quality = "best" | "1080p" | "720p" | "480p" | "360p"

interface VideoInfo {
  title: string
  duration: string
  thumbnail: string
  uploader: string
  platform: string
}

export default function Home() {
  const [url, setUrl] = useState("")
  const [format, setFormat] = useState<Format>("video")
  const [quality, setQuality] = useState<Quality>("best")
  const [isLoading, setIsLoading] = useState(false)
  const [videoInfo, setVideoInfo] = useState<VideoInfo | null>(null)
  const [downloads, setDownloads] = useState<DownloadItem[]>([
    {
      id: "1",
      title: "Introduction to React Hooks",
      platform: "YouTube",
      progress: 100,
      status: "completed",
      format: "video",
      quality: "1080p",
      size: "245 MB",
    },
    {
      id: "2", 
      title: "Lo-Fi Hip Hop Radio",
      platform: "SoundCloud",
      progress: 67,
      status: "downloading",
      format: "audio",
      quality: "320kbps",
      size: "12 MB",
    },
  ])

  const handleFetchInfo = useCallback(async () => {
    if (!url.trim()) return
    
    setIsLoading(true)
    // Simulate fetching video info
    await new Promise((resolve) => setTimeout(resolve, 1500))
    
    setVideoInfo({
      title: "Sample Video Title - Amazing Content",
      duration: "12:34",
      thumbnail: "https://picsum.photos/seed/video/640/360",
      uploader: "Content Creator",
      platform: "YouTube",
    })
    setIsLoading(false)
  }, [url])

  const handleDownload = useCallback(() => {
    if (!videoInfo) return

    const newDownload: DownloadItem = {
      id: Date.now().toString(),
      title: videoInfo.title,
      platform: videoInfo.platform,
      progress: 0,
      status: "downloading",
      format,
      quality: format === "video" ? quality : "320kbps",
      size: "Calculating...",
    }

    setDownloads((prev) => [newDownload, ...prev])
    setVideoInfo(null)
    setUrl("")

    // Simulate download progress
    let progress = 0
    const interval = setInterval(() => {
      progress += Math.random() * 15
      if (progress >= 100) {
        progress = 100
        clearInterval(interval)
        setDownloads((prev) =>
          prev.map((d) =>
            d.id === newDownload.id
              ? { ...d, progress: 100, status: "completed", size: "187 MB" }
              : d
          )
        )
      } else {
        setDownloads((prev) =>
          prev.map((d) =>
            d.id === newDownload.id ? { ...d, progress: Math.round(progress) } : d
          )
        )
      }
    }, 500)
  }, [videoInfo, format, quality])

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
                    onClick={() => setFormat("video")}
                    className="flex-1"
                  >
                    <Film className="h-4 w-4 mr-2" />
                    Video
                  </Button>
                  <Button
                    variant={format === "audio" ? "default" : "secondary"}
                    onClick={() => setFormat("audio")}
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
                    <SelectItem value="best">Best Available</SelectItem>
                    {format === "video" ? (
                      <>
                        <SelectItem value="1080p">1080p (Full HD)</SelectItem>
                        <SelectItem value="720p">720p (HD)</SelectItem>
                        <SelectItem value="480p">480p (SD)</SelectItem>
                        <SelectItem value="360p">360p (Low)</SelectItem>
                      </>
                    ) : (
                      <>
                        <SelectItem value="1080p">320kbps (High)</SelectItem>
                        <SelectItem value="720p">256kbps (Medium)</SelectItem>
                        <SelectItem value="480p">128kbps (Low)</SelectItem>
                      </>
                    )}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Video Preview */}
            {videoInfo && (
              <VideoPreview
                videoInfo={videoInfo}
                format={format}
                quality={quality}
                onDownload={handleDownload}
                onCancel={() => setVideoInfo(null)}
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
          <p>Powered by youtube-dl • Supports 1000+ video platforms</p>
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
