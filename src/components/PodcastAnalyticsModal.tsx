import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { PodcastData, getPodcastAnalytics } from '@/services/podscan';
import { TrendingUp, Users, Globe, Award, ExternalLink, BarChart3 } from 'lucide-react';

interface PodcastAnalyticsModalProps {
  podcast: PodcastData | null;
  isOpen: boolean;
  onClose: () => void;
}

export const PodcastAnalyticsModal = ({ podcast, isOpen, onClose }: PodcastAnalyticsModalProps) => {
  if (!podcast) return null;

  const analytics = getPodcastAnalytics(podcast);

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-start gap-4 mb-4">
            {podcast.podcast_image_url && (
              <img
                src={podcast.podcast_image_url}
                alt={podcast.podcast_name}
                className="w-20 h-20 rounded-lg object-cover"
              />
            )}
            <div className="flex-1">
              <DialogTitle className="text-2xl mb-2">{podcast.podcast_name}</DialogTitle>
              <DialogDescription className="text-base">
                {podcast.podcast_description}
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        {/* Analytics Stats */}
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4 my-6">
          <div className="p-4 bg-surface-subtle rounded-lg border border-border">
            <div className="flex items-center gap-2 mb-2">
              <TrendingUp className="h-5 w-5 text-primary" />
              <p className="text-sm text-muted-foreground">Reach Score</p>
            </div>
            <p className="text-2xl font-bold text-foreground">
              {Math.round(analytics.reach_score)}/100
            </p>
          </div>

          <div className="p-4 bg-surface-subtle rounded-lg border border-border">
            <div className="flex items-center gap-2 mb-2">
              <BarChart3 className="h-5 w-5 text-primary" />
              <p className="text-sm text-muted-foreground">Episodes</p>
            </div>
            <p className="text-2xl font-bold text-foreground">
              {analytics.episode_count}
            </p>
          </div>

          <div className="p-4 bg-surface-subtle rounded-lg border border-border">
            <div className="flex items-center gap-2 mb-2">
              <Award className="h-5 w-5 text-primary" />
              <p className="text-sm text-muted-foreground">Rating</p>
            </div>
            <p className="text-2xl font-bold text-foreground">
              {analytics.rating ? `${analytics.rating.toFixed(1)}/5` : 'N/A'}
            </p>
          </div>

          <div className="p-4 bg-surface-subtle rounded-lg border border-border">
            <div className="flex items-center gap-2 mb-2">
              <Users className="h-5 w-5 text-primary" />
              <p className="text-sm text-muted-foreground">Audience Size</p>
            </div>
            <p className="text-2xl font-bold text-foreground">
              {analytics.audience_size > 0 ? `${(analytics.audience_size / 1000).toFixed(0)}K` : 'N/A'}
            </p>
          </div>

          <div className="p-4 bg-surface-subtle rounded-lg border border-border">
            <div className="flex items-center gap-2 mb-2">
              <Globe className="h-5 w-5 text-primary" />
              <p className="text-sm text-muted-foreground">Language</p>
            </div>
            <p className="text-lg font-semibold text-foreground uppercase">
              {analytics.language}
            </p>
          </div>

          <div className="p-4 bg-surface-subtle rounded-lg border border-border">
            <div className="flex items-center gap-2 mb-2">
              <Globe className="h-5 w-5 text-primary" />
              <p className="text-sm text-muted-foreground">Region</p>
            </div>
            <p className="text-lg font-semibold text-foreground uppercase">
              {analytics.region}
            </p>
          </div>
        </div>

        {/* Categories */}
        {analytics.categories && analytics.categories.length > 0 && (
          <div className="mb-6">
            <h3 className="text-sm font-semibold text-foreground mb-3">Categories</h3>
            <div className="flex flex-wrap gap-2">
              {analytics.categories.map((category, index) => (
                <span
                  key={index}
                  className="px-3 py-1 bg-primary/10 text-primary rounded-full text-sm"
                >
                  {category}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Audience Insights */}
        <div className="mb-6 p-4 bg-primary/5 rounded-lg border border-primary/20">
          <h3 className="text-sm font-semibold text-foreground mb-2 flex items-center gap-2">
            <TrendingUp className="h-4 w-4" />
            Audience Insights
          </h3>
          <p className="text-sm text-muted-foreground">
            This podcast has a reach score of {Math.round(analytics.reach_score)}/100, indicating
            {analytics.reach_score > 70 ? ' strong ' : analytics.reach_score > 40 ? ' moderate ' : ' growing '}
            audience engagement and distribution. With {analytics.episode_count} episodes, this show has an established
            presence in the {analytics.categories?.[0] || 'business'} space.
          </p>
        </div>

        {/* Actions */}
        <div className="flex gap-3">
          <Button asChild className="w-full">
            <a href="/#book">Book This Show</a>
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};
