import { useState, useEffect } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Archive,
  CheckCircle2,
  Send,
  MessageSquare,
  Calendar,
  Building2,
  Mail,
  ChevronLeft,
  ChevronRight,
  ArrowUp,
  ArrowDown
} from 'lucide-react'

interface CampaignReply {
  id: string
  email: string
  name: string | null
  company: string | null
  reply_content: string | null
  campaign_name: string | null
  received_at: string
  lead_type: 'sales' | 'podcasts' | 'other' | null
  status: 'new' | 'contacted' | 'qualified' | 'not_interested' | 'converted'
  notes: string | null
  read: boolean
  bison_reply_id: number | null
  archived: boolean
  archived_at: string | null
  created_at: string
  updated_at: string
}

interface LeadSwipeCardProps {
  replies: CampaignReply[]
  currentIndex: number
  onSwipeLeft: (reply: CampaignReply) => void  // Archive
  onSwipeRight: (reply: CampaignReply) => void // Qualify
  onSwipeUp: (reply: CampaignReply) => void    // Reply
  onSwipeDown: (reply: CampaignReply) => void  // View Thread
  onMarkAsSales: (reply: CampaignReply) => void
  onMarkAsPremium: (reply: CampaignReply) => void
  onNext: () => void
  onPrevious: () => void
}

export function LeadSwipeCard({
  replies,
  currentIndex,
  onSwipeLeft,
  onSwipeRight,
  onSwipeUp,
  onSwipeDown,
  onMarkAsSales,
  onMarkAsPremium,
  onNext,
  onPrevious,
}: LeadSwipeCardProps) {
  const [startX, setStartX] = useState(0)
  const [startY, setStartY] = useState(0)
  const [currentX, setCurrentX] = useState(0)
  const [currentY, setCurrentY] = useState(0)
  const [isDragging, setIsDragging] = useState(false)

  const currentReply = replies[currentIndex]

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!currentReply) return

      switch (e.key) {
        case 'ArrowLeft':
          e.preventDefault()
          onSwipeLeft(currentReply)
          break
        case 'ArrowRight':
          e.preventDefault()
          onSwipeRight(currentReply)
          break
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [currentReply, onSwipeLeft, onSwipeRight])

  const handleTouchStart = (e: React.TouchEvent) => {
    setStartX(e.touches[0].clientX)
    setStartY(e.touches[0].clientY)
    setIsDragging(true)
  }

  const handleTouchMove = (e: React.TouchEvent) => {
    if (!isDragging) return
    setCurrentX(e.touches[0].clientX - startX)
    setCurrentY(e.touches[0].clientY - startY)
  }

  const handleTouchEnd = () => {
    if (!isDragging || !currentReply) return

    const threshold = 100

    // Horizontal swipe only
    if (currentX > threshold) {
      onSwipeRight(currentReply)
    } else if (currentX < -threshold) {
      onSwipeLeft(currentReply)
    }

    setIsDragging(false)
    setCurrentX(0)
    setCurrentY(0)
  }

  const handleMouseDown = (e: React.MouseEvent) => {
    setStartX(e.clientX)
    setStartY(e.clientY)
    setIsDragging(true)
  }

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging) return
    setCurrentX(e.clientX - startX)
    setCurrentY(e.clientY - startY)
  }

  const handleMouseUp = () => {
    if (!isDragging || !currentReply) return

    const threshold = 100

    // Horizontal swipe only
    if (currentX > threshold) {
      onSwipeRight(currentReply)
    } else if (currentX < -threshold) {
      onSwipeLeft(currentReply)
    }

    setIsDragging(false)
    setCurrentX(0)
    setCurrentY(0)
  }

  if (!currentReply) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[calc(100vh-300px)] md:h-[600px] px-4">
        <div className="text-center space-y-4 md:space-y-6">
          <div className="text-7xl md:text-8xl">🎉</div>
          <h3 className="text-3xl md:text-4xl font-bold">All Caught Up!</h3>
          <p className="text-base md:text-lg text-muted-foreground">You've reviewed all leads. Great work!</p>
        </div>
      </div>
    )
  }

  const rotation = isDragging ? currentX / 20 : 0
  const opacity = isDragging ? Math.max(0.6, 1 - Math.abs(currentX) / 300) : 1

  return (
    <div className="relative min-h-[calc(100vh-300px)] md:h-[600px] flex items-center justify-center px-2 md:px-0">
      {/* Progress Counter */}
      <div className="absolute top-2 md:top-4 left-1/2 transform -translate-x-1/2 z-10">
        <Badge variant="secondary" className="text-base md:text-sm px-6 py-2 md:px-4 md:py-1">
          {currentIndex + 1} of {replies.length}
        </Badge>
      </div>

      {/* Swipe Hints */}
      <div
        className={`absolute left-2 md:left-8 top-1/2 transform -translate-y-1/2 transition-opacity duration-200 ${
          currentX > 50 ? 'opacity-100' : 'opacity-0'
        }`}
      >
        <div className="bg-green-500 text-white rounded-full p-3 md:p-4 shadow-lg">
          <CheckCircle2 className="h-10 w-10 md:h-12 md:w-12" />
        </div>
        <p className="text-xs md:text-sm font-bold text-green-500 mt-2 text-center">Qualify</p>
      </div>

      <div
        className={`absolute right-2 md:right-8 top-1/2 transform -translate-y-1/2 transition-opacity duration-200 ${
          currentX < -50 ? 'opacity-100' : 'opacity-0'
        }`}
      >
        <div className="bg-red-500 text-white rounded-full p-3 md:p-4 shadow-lg">
          <Archive className="h-10 w-10 md:h-12 md:w-12" />
        </div>
        <p className="text-xs md:text-sm font-bold text-red-500 mt-2 text-center">Archive</p>
      </div>

      {/* Main Card */}
      <Card
        className="w-full max-w-2xl shadow-2xl cursor-grab active:cursor-grabbing select-none touch-none"
        style={{
          transform: `translateX(${currentX}px) translateY(${currentY}px) rotate(${rotation}deg)`,
          opacity: opacity,
          transition: isDragging ? 'none' : 'transform 0.3s, opacity 0.3s',
        }}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
      >
        <CardContent className="p-4 md:p-8 space-y-4 md:space-y-6">
          {/* Header */}
          <div className="flex items-start justify-between gap-3">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 md:gap-3 mb-2">
                <div className="h-14 w-14 md:h-16 md:w-16 rounded-full bg-gradient-to-br from-blue-500 to-purple-500 flex items-center justify-center text-white text-xl md:text-2xl font-bold flex-shrink-0">
                  {(currentReply.name || currentReply.email).charAt(0).toUpperCase()}
                </div>
                <div className="min-w-0 flex-1">
                  <h3 className="text-xl md:text-2xl font-bold truncate">{currentReply.name || 'Unknown'}</h3>
                  <p className="text-sm md:text-base text-muted-foreground truncate">{currentReply.email}</p>
                </div>
              </div>
            </div>
            <div className="flex flex-col gap-1.5 md:gap-2 flex-shrink-0">
              {currentReply.lead_type === 'sales' && (
                <Badge className="bg-blue-500 text-xs md:text-sm">Sales</Badge>
              )}
              {currentReply.lead_type === 'podcasts' && (
                <Badge className="bg-purple-500 text-xs md:text-sm">Premium</Badge>
              )}
              {!currentReply.read && (
                <Badge variant="default" className="text-xs md:text-sm">Unread</Badge>
              )}
            </div>
          </div>

          {/* Company */}
          {currentReply.company && (
            <div className="flex items-center gap-2 text-muted-foreground">
              <Building2 className="h-4 w-4 flex-shrink-0" />
              <span className="font-medium text-sm md:text-base truncate">{currentReply.company}</span>
            </div>
          )}

          {/* Message */}
          <div className="bg-muted/30 rounded-lg p-4 md:p-6 min-h-[180px] md:min-h-[200px] max-h-[300px] overflow-y-auto">
            <p className="text-base md:text-lg leading-relaxed whitespace-pre-wrap">
              {currentReply.reply_content || 'No message content'}
            </p>
          </div>

          {/* Metadata */}
          <div className="flex items-center justify-between text-sm text-muted-foreground border-t pt-4">
            <div className="flex items-center gap-2">
              <Calendar className="h-4 w-4" />
              <span>{new Date(currentReply.received_at).toLocaleDateString('en-US', {
                month: 'short',
                day: 'numeric',
                hour: 'numeric',
                minute: '2-digit'
              })}</span>
            </div>
            {currentReply.campaign_name && (
              <div className="flex items-center gap-2">
                <Mail className="h-4 w-4" />
                <span>{currentReply.campaign_name}</span>
              </div>
            )}
          </div>

          {/* Label As Section */}
          <div className="border-t pt-3 md:pt-4">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2 md:mb-3">Label As</p>
            <div className="flex gap-2 md:gap-3">
              <Button
                type="button"
                variant={currentReply.lead_type === 'sales' ? 'default' : 'outline'}
                size="lg"
                onClick={() => onMarkAsSales(currentReply)}
                className="flex-1 h-14 md:h-12 text-base md:text-sm"
              >
                <span className={currentReply.lead_type === 'sales' ? '' : 'text-blue-500'}>
                  💼 Sales
                </span>
              </Button>
              <Button
                type="button"
                variant={currentReply.lead_type === 'podcasts' ? 'default' : 'outline'}
                size="lg"
                onClick={() => onMarkAsPremium(currentReply)}
                className="flex-1 h-14 md:h-12 text-base md:text-sm"
              >
                <span className={currentReply.lead_type === 'podcasts' ? '' : 'text-purple-500'}>
                  🎙️ Premium
                </span>
              </Button>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2 md:gap-3 pt-3 md:pt-4 border-t">
            <Button
              type="button"
              variant="outline"
              size="lg"
              onClick={() => onSwipeLeft(currentReply)}
              className="flex flex-col gap-1 md:gap-2 h-auto py-4 md:py-4 border-red-200 hover:bg-red-50 hover:border-red-300"
            >
              <Archive className="h-7 w-7 md:h-6 md:w-6 text-red-500" />
              <span className="text-sm md:text-xs">Archive</span>
            </Button>

            {currentReply.bison_reply_id && (
              <Button
                type="button"
                variant="outline"
                size="lg"
                onClick={() => onSwipeDown(currentReply)}
                className="flex flex-col gap-1 md:gap-2 h-auto py-4 md:py-4"
              >
                <MessageSquare className="h-7 w-7 md:h-6 md:w-6" />
                <span className="text-sm md:text-xs">Thread</span>
              </Button>
            )}

            {currentReply.bison_reply_id && (
              <Button
                type="button"
                variant="outline"
                size="lg"
                onClick={() => onSwipeUp(currentReply)}
                className="flex flex-col gap-1 md:gap-2 h-auto py-4 md:py-4 border-blue-200 hover:bg-blue-50 hover:border-blue-300"
              >
                <Send className="h-7 w-7 md:h-6 md:w-6 text-blue-500" />
                <span className="text-sm md:text-xs">Reply</span>
              </Button>
            )}

            <Button
              type="button"
              variant="outline"
              size="lg"
              onClick={() => onSwipeRight(currentReply)}
              className="flex flex-col gap-1 md:gap-2 h-auto py-4 md:py-4 border-green-200 hover:bg-green-50 hover:border-green-300"
            >
              <CheckCircle2 className="h-7 w-7 md:h-6 md:w-6 text-green-500" />
              <span className="text-sm md:text-xs">Qualify</span>
            </Button>
          </div>

          {/* Navigation Hint */}
          <div className="text-center text-xs md:text-xs text-muted-foreground pt-2 border-t">
            💡 Swipe left/right or tap buttons
          </div>
        </CardContent>
      </Card>

      {/* Navigation Arrows - Hidden on mobile */}
      <Button
        type="button"
        variant="ghost"
        size="icon"
        onClick={onPrevious}
        disabled={currentIndex === 0}
        className="hidden md:flex absolute left-4 top-1/2 transform -translate-y-1/2 h-12 w-12 rounded-full"
      >
        <ChevronLeft className="h-6 w-6" />
      </Button>

      <Button
        type="button"
        variant="ghost"
        size="icon"
        onClick={onNext}
        disabled={currentIndex === replies.length - 1}
        className="hidden md:flex absolute right-4 top-1/2 transform -translate-y-1/2 h-12 w-12 rounded-full"
      >
        <ChevronRight className="h-6 w-6" />
      </Button>
    </div>
  )
}
