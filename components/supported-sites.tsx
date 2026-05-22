"use client"

import { useState } from "react"
import { Search } from "lucide-react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"

const SITES = [
  { name: "YouTube", category: "Video" },
  { name: "Vimeo", category: "Video" },
  { name: "TikTok", category: "Social" },
  { name: "Twitter/X", category: "Social" },
  { name: "Instagram", category: "Social" },
  { name: "Facebook", category: "Social" },
  { name: "Reddit", category: "Social" },
  { name: "Twitch", category: "Streaming" },
  { name: "Dailymotion", category: "Video" },
  { name: "SoundCloud", category: "Audio" },
  { name: "Bandcamp", category: "Audio" },
  { name: "Mixcloud", category: "Audio" },
  { name: "BBC iPlayer", category: "TV" },
  { name: "CNN", category: "News" },
  { name: "NBC", category: "TV" },
  { name: "CBS", category: "TV" },
  { name: "ABC", category: "TV" },
  { name: "ESPN", category: "Sports" },
  { name: "Crunchyroll", category: "Anime" },
  { name: "Funimation", category: "Anime" },
  { name: "Bilibili", category: "Video" },
  { name: "Niconico", category: "Video" },
  { name: "Youku", category: "Video" },
  { name: "Ted", category: "Education" },
  { name: "Khan Academy", category: "Education" },
  { name: "Coursera", category: "Education" },
  { name: "Udemy", category: "Education" },
  { name: "Lynda", category: "Education" },
  { name: "Pluralsight", category: "Education" },
  { name: "Bitchute", category: "Video" },
  { name: "Rumble", category: "Video" },
  { name: "Odysee", category: "Video" },
  { name: "PeerTube", category: "Video" },
  { name: "Flickr", category: "Photo/Video" },
  { name: "Tumblr", category: "Social" },
  { name: "Pinterest", category: "Social" },
  { name: "Imgur", category: "Photo/Video" },
  { name: "Streamable", category: "Video" },
  { name: "Gfycat", category: "Video" },
  { name: "Arte", category: "TV" },
  { name: "ARD", category: "TV" },
  { name: "ZDF", category: "TV" },
  { name: "France TV", category: "TV" },
  { name: "RAI", category: "TV" },
  { name: "NHK", category: "TV" },
  { name: "Dropbox", category: "Cloud" },
  { name: "Google Drive", category: "Cloud" },
  { name: "OneDrive", category: "Cloud" },
]

const CATEGORIES = ["All", "Video", "Social", "Audio", "Streaming", "TV", "Education", "Anime", "News", "Sports", "Cloud", "Photo/Video"]

export function SupportedSites() {
  const [search, setSearch] = useState("")
  const [category, setCategory] = useState("All")

  const filteredSites = SITES.filter((site) => {
    const matchesSearch = site.name.toLowerCase().includes(search.toLowerCase())
    const matchesCategory = category === "All" || site.category === category
    return matchesSearch && matchesCategory
  })

  return (
    <Card className="border-border/50 bg-card/50">
      <CardHeader>
        <CardTitle>Supported Sites</CardTitle>
        <CardDescription>
          GitTube supports over 1000 video platforms. Here are some of the most popular ones.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search sites..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-10 bg-secondary/50"
          />
        </div>

        {/* Category Filter */}
        <div className="flex flex-wrap gap-2">
          {CATEGORIES.map((cat) => (
            <Badge
              key={cat}
              variant={category === cat ? "default" : "secondary"}
              className="cursor-pointer transition-colors"
              onClick={() => setCategory(cat)}
            >
              {cat}
            </Badge>
          ))}
        </div>

        {/* Sites Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-2">
          {filteredSites.map((site) => (
            <div
              key={site.name}
              className="flex items-center justify-between p-3 rounded-lg bg-secondary/30 border border-border/50 hover:bg-secondary/50 transition-colors"
            >
              <span className="text-sm font-medium truncate">{site.name}</span>
            </div>
          ))}
        </div>

        {filteredSites.length === 0 && (
          <div className="text-center py-8 text-muted-foreground">
            No sites found matching your search.
          </div>
        )}

        <p className="text-sm text-muted-foreground text-center pt-4">
          And 950+ more sites...{" "}
          <a href="https://github.com/gairxx/git-tube/blob/master/docs/supportedsites.md" className="text-primary hover:underline">
            View full list
          </a>
        </p>
      </CardContent>
    </Card>
  )
}
