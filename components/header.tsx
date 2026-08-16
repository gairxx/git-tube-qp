"use client"

import { Download, Github, Menu, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { useState } from "react"

export function Header() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)

  return (
    <header className="sticky top-0 z-50 border-b border-border/50 bg-background/80 backdrop-blur-lg">
      <div className="container mx-auto px-4 max-w-6xl">
        <div className="flex h-16 items-center justify-between">
          {/* Logo */}
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary">
              <Download className="h-5 w-5 text-primary-foreground" />
            </div>
            <span className="text-xl font-bold tracking-tight">
              Git<span className="text-primary">Tube</span>
            </span>
          </div>

          {/* Desktop Navigation */}
          <nav className="hidden md:flex items-center gap-6">
            <a href="#" className="text-sm text-muted-foreground hover:text-foreground transition-colors">
              Documentation
            </a>
            <a href="#" className="text-sm text-muted-foreground hover:text-foreground transition-colors">
              Supported Sites
            </a>
            <a href="#" className="text-sm text-muted-foreground hover:text-foreground transition-colors">
              FAQ
            </a>
          </nav>

          {/* Actions */}
          <div className="flex items-center gap-3">
            <Button variant="outline" size="sm" className="hidden sm:flex" asChild>
              <a href="https://github.com/gairxx/git-tube" target="_blank" rel="noopener noreferrer">
                <Github className="h-4 w-4 mr-2" />
                GitHub
              </a>
            </Button>
            
            {/* Mobile Menu Button */}
            <Button
              variant="ghost"
              size="icon"
              className="md:hidden"
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            >
              {mobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </Button>
          </div>
        </div>

        {/* Mobile Navigation */}
        {mobileMenuOpen && (
          <nav className="md:hidden py-4 border-t border-border/50">
            <div className="flex flex-col gap-3">
              <a href="#" className="text-sm text-muted-foreground hover:text-foreground transition-colors py-2">
                Documentation
              </a>
              <a href="#" className="text-sm text-muted-foreground hover:text-foreground transition-colors py-2">
                Supported Sites
              </a>
              <a href="#" className="text-sm text-muted-foreground hover:text-foreground transition-colors py-2">
                FAQ
              </a>
              <a 
                href="https://github.com/gairxx/git-tube" 
                target="_blank" 
                rel="noopener noreferrer"
                className="text-sm text-muted-foreground hover:text-foreground transition-colors py-2 flex items-center gap-2"
              >
                <Github className="h-4 w-4" />
                GitHub
              </a>
            </div>
          </nav>
        )}
      </div>
    </header>
  )
}
