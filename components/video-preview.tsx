"use client"

import Image from "next/image"
import { Clock, Download, User, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"

interface VideoInfo {
  title: string
  duration: string
  thumbnail: string
  uploader: string
  platform: string
}

interface VideoPreviewProps {
  videoInfo: VideoInfo
  format: string
  quality: string
  onDownload: () => void
  onCancel: () => void
}

export function VideoPreview({ videoInfo, format, quality, onDownload, onCancel }: VideoPreviewProps) {
  return (
    <div className="relative rounded-lg border border-border/50 bg-secondary/30 p-4 animate-in fade-in slide-in-from-top-2 duration-300">
      <Button
        variant="ghost"
        size="icon"
        onClick={onCancel}
        className="absolute top-2 right-2 h-8 w-8"
      >
        <X className="h-4 w-4" />
      </Button>

      <div className="flex flex-col sm:flex-row gap-4">
        {/* Thumbnail */}
        <div className="relative w-full sm:w-48 aspect-video rounded-lg overflow-hidden bg-muted shrink-0">
          <Image
            src={videoInfo.thumbnail}
            alt={videoInfo.title}
            fill
            className="object-cover"
          />
          <div className="absolute bottom-2 right-2 bg-black/80 text-white text-xs px-2 py-1 rounded">
            {videoInfo.duration}
          </div>
        </div>

        {/* Info */}
        <div className="flex-1 min-w-0">
          <h3 className="font-semibold text-lg mb-2 line-clamp-2">{videoInfo.title}</h3>
          
          <div className="flex flex-wrap gap-3 text-sm text-muted-foreground mb-4">
            <div className="flex items-center gap-1">
              <User className="h-4 w-4" />
              <span>{videoInfo.uploader}</span>
            </div>
            <div className="flex items-center gap-1">
              <Clock className="h-4 w-4" />
              <span>{videoInfo.duration}</span>
            </div>
            <Badge variant="secondary">{videoInfo.platform}</Badge>
          </div>

          <div className="flex flex-wrap items-center gap-2 mb-4">
            <Badge variant="outline" className="border-primary/50 text-primary">
              {format === "video" ? "MP4" : "MP3"}
            </Badge>
            <Badge variant="outline">{quality}</Badge>
          </div>

          <Button onClick={onDownload} className="w-full sm:w-auto">
            <Download className="h-4 w-4 mr-2" />
            Start Download
          </Button>
        </div>
      </div>
    </div>
  )
}
