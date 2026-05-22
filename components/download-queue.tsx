"use client"

import { CheckCircle2, Download, Film, Loader2, Music, Pause, Play, Trash2, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Progress } from "@/components/ui/progress"
import { Badge } from "@/components/ui/badge"

export interface DownloadItem {
  id: string
  title: string
  platform: string
  progress: number
  status: "downloading" | "completed" | "paused" | "error"
  format: string
  quality: string
  size: string
}

interface DownloadQueueProps {
  downloads: DownloadItem[]
  setDownloads: React.Dispatch<React.SetStateAction<DownloadItem[]>>
}

export function DownloadQueue({ downloads, setDownloads }: DownloadQueueProps) {
  const removeDownload = (id: string) => {
    setDownloads((prev) => prev.filter((d) => d.id !== id))
  }

  const togglePause = (id: string) => {
    setDownloads((prev) =>
      prev.map((d) =>
        d.id === id
          ? { ...d, status: d.status === "paused" ? "downloading" : "paused" }
          : d
      )
    )
  }

  if (downloads.length === 0) {
    return (
      <Card className="border-border/50 bg-card/50">
        <CardContent className="flex flex-col items-center justify-center py-16">
          <Download className="h-12 w-12 text-muted-foreground/50 mb-4" />
          <h3 className="text-lg font-medium mb-2">No Downloads Yet</h3>
          <p className="text-sm text-muted-foreground text-center max-w-sm">
            Paste a video URL above to start downloading. Your downloads will appear here.
          </p>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card className="border-border/50 bg-card/50">
      <CardHeader>
        <CardTitle>Download Queue</CardTitle>
        <CardDescription>
          {downloads.filter((d) => d.status === "downloading").length} active, {" "}
          {downloads.filter((d) => d.status === "completed").length} completed
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {downloads.map((download) => (
            <div
              key={download.id}
              className="flex items-start gap-4 p-4 rounded-lg bg-secondary/30 border border-border/50"
            >
              {/* Icon */}
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10">
                {download.format === "audio" ? (
                  <Music className="h-5 w-5 text-primary" />
                ) : (
                  <Film className="h-5 w-5 text-primary" />
                )}
              </div>

              {/* Content */}
              <div className="flex-1 min-w-0">
                <div className="flex items-start justify-between gap-2 mb-2">
                  <div className="min-w-0">
                    <h4 className="font-medium truncate">{download.title}</h4>
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <span>{download.platform}</span>
                      <span>•</span>
                      <span>{download.quality}</span>
                      <span>•</span>
                      <span>{download.size}</span>
                    </div>
                  </div>
                  <Badge
                    variant={download.status === "completed" ? "default" : "secondary"}
                    className={
                      download.status === "completed"
                        ? "bg-green-500/20 text-green-400 border-green-500/30"
                        : download.status === "error"
                        ? "bg-red-500/20 text-red-400 border-red-500/30"
                        : "bg-primary/20 text-primary"
                    }
                  >
                    {download.status === "completed" && (
                      <CheckCircle2 className="h-3 w-3 mr-1" />
                    )}
                    {download.status === "downloading" && (
                      <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                    )}
                    {download.status}
                  </Badge>
                </div>

                {/* Progress Bar */}
                {download.status !== "completed" && (
                  <div className="flex items-center gap-3">
                    <Progress value={download.progress} className="h-2 flex-1" />
                    <span className="text-sm text-muted-foreground w-12 text-right">
                      {download.progress}%
                    </span>
                  </div>
                )}
              </div>

              {/* Actions */}
              <div className="flex items-center gap-1">
                {download.status === "downloading" && (
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => togglePause(download.id)}
                    className="h-8 w-8"
                  >
                    <Pause className="h-4 w-4" />
                  </Button>
                )}
                {download.status === "paused" && (
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => togglePause(download.id)}
                    className="h-8 w-8"
                  >
                    <Play className="h-4 w-4" />
                  </Button>
                )}
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => removeDownload(download.id)}
                  className="h-8 w-8 text-muted-foreground hover:text-destructive"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}
