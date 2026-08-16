"use client"

import Image from "next/image"
import { Clock, Download, User, X, Eye } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"

interface VideoFormat {
  format_id: string
  ext: string
  quality: string
  height?: number
  width?: number
  filesize?: number
  hasVideo: boolean
  hasAudio: boolean
}

interface VideoInfo {
  title: string
  duration: string
  thumbnail: string
  uploader: string
  platform: string
  viewCount?: number
  formats?: VideoFormat[]
}

interface VideoPreviewProps {
  videoInfo: VideoInfo
  format: string
  quality: string
  onDownload: () => void
  onCancel: () => void
  formatSize?: (bytes?: number) => string
}

export function VideoPreview({ 
  videoInfo, 
  format, 
  quality, 
  onDownload, 
  onCancel,
  formatSize = (bytes) => bytes ? `${(bytes / (1024 * 1024)).toFixed(1)} MB` : "Unknown"
}: VideoPreviewProps) {
  // Format view count
  const formatViewCount = (count?: number): string => {
    if (!count) return ""
    if (count >= 1000000000) return `${(count / 1000000000).toFixed(1)}B views`
    if (count >= 1000000) return `${(count / 1000000).toFixed(1)}M views`
    if (count >= 1000) return `${(count / 1000).toFixed(1)}K views`
    return `${count} views`
  }

  // Find estimated file size based on selected quality
  const getEstimatedSize = (): string => {
    if (!videoInfo.formats) return "Unknown"
    
    const targetHeight = quality === "2160p" ? 2160 :
                         quality === "1080p" ? 1080 :
                         quality === "720p" ? 720 :
                         quality === "480p" ? 480 : null

    if (format === "audio") {
      // Find audio format
      const audioFormat = videoInfo.formats.find(f => f.hasAudio && !f.hasVideo)
      return audioFormat ? formatSize(audioFormat.filesize) : "~5-10 MB"
    }

    if (targetHeight) {
      const videoFormat = videoInfo.formats.find(f => f.height === targetHeight && f.hasVideo)
      return videoFormat ? formatSize(videoFormat.filesize) : "Calculating..."
    }

    // Best quality - find highest resolution with filesize
    const bestFormat = videoInfo.formats
      .filter(f => f.hasVideo && f.filesize)
      .sort((a, b) => (b.height || 0) - (a.height || 0))[0]
    
    return bestFormat ? formatSize(bestFormat.filesize) : "Unknown"
  }

  return (
    <div className="relative rounded-lg border border-border/50 bg-secondary/30 p-4 animate-in fade-in slide-in-from-top-2 duration-300">
      <Button
        variant="ghost"
        size="icon"
        onClick={onCancel}
        className="absolute top-2 right-2 h-8 w-8 z-10"
      >
        <X className="h-4 w-4" />
      </Button>

      <div className="flex flex-col sm:flex-row gap-4">
        {/* Thumbnail */}
        <div className="relative w-full sm:w-64 aspect-video rounded-lg overflow-hidden bg-muted shrink-0">
          {videoInfo.thumbnail ? (
            <Image
              src={videoInfo.thumbnail}
              alt={videoInfo.title}
              fill
              className="object-cover"
              unoptimized
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-muted-foreground">
              No thumbnail
            </div>
          )}
          <div className="absolute bottom-2 right-2 bg-black/80 text-white text-xs px-2 py-1 rounded font-mono">
            {videoInfo.duration}
          </div>
        </div>

        {/* Info */}
        <div className="flex-1 min-w-0">
          <h3 className="font-semibold text-lg mb-2 line-clamp-2 pr-8">{videoInfo.title}</h3>
          
          <div className="flex flex-wrap gap-3 text-sm text-muted-foreground mb-3">
            <div className="flex items-center gap-1">
              <User className="h-4 w-4" />
              <span>{videoInfo.uploader || "Unknown"}</span>
            </div>
            <div className="flex items-center gap-1">
              <Clock className="h-4 w-4" />
              <span>{videoInfo.duration}</span>
            </div>
            {videoInfo.viewCount && (
              <div className="flex items-center gap-1">
                <Eye className="h-4 w-4" />
                <span>{formatViewCount(videoInfo.viewCount)}</span>
              </div>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2 mb-4">
            <Badge variant="secondary" className="bg-primary/10 text-primary border-primary/20">
              {videoInfo.platform}
            </Badge>
            <Badge variant="outline" className="border-primary/50 text-primary">
              {format === "video" ? "MP4" : "MP3"}
            </Badge>
            <Badge variant="outline">{quality === "best" ? "Best Quality" : quality}</Badge>
            <Badge variant="outline" className="text-muted-foreground">
              ~{getEstimatedSize()}
            </Badge>
          </div>

          <Button onClick={onDownload} size="lg" className="w-full sm:w-auto">
            <Download className="h-4 w-4 mr-2" />
            Start Download
          </Button>
        </div>
      </div>
    </div>
  )
}
