import { useState, useEffect } from 'react';
import { useScrollAnimation } from '@/hooks/useScrollAnimation';
import { Button } from '@/components/ui/button';
import { Mic, TrendingUp, Loader2 } from 'lucide-react';
import { searchBusinessPodcasts, PodcastData } from '@/services/podscan';
import { useToast } from '@/hooks/use-toast';

const stats = [
  { label: "Total Placements", value: "150+", icon: Mic },
  { label: "Combined Reach", value: "2.5M+", icon: TrendingUp },
  { label: "Shows Partnered", value: "50+", icon: Mic },
];

const PodcastShowcaseSection = () => {
  const { ref, isVisible } = useScrollAnimation<HTMLDivElement>();
  const [podcasts, setPodcasts] = useState<PodcastData[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const { toast } = useToast();

  useEffect(() => {
    const loadPodcasts = async () => {
      try {
        setIsLoading(true);
        const data = await searchBusinessPodcasts(16); // Load 16 podcasts
        setPodcasts(data);
      } catch (error) {
        console.error('Failed to load podcasts:', error);
        toast({
          title: "Failed to load podcasts",
          description: "Using fallback data. Please try again later.",
          variant: "destructive",
        });
        // Fallback to static data if API fails
        setPodcasts([
          { podcast_id: '1', podcast_name: "Tech Leaders Podcast", podcast_url: '', podcast_description: '', podcast_categories: [{ category_id: '1', category_name: 'Technology' }] },
          { podcast_id: '2', podcast_name: "The SaaS Show", podcast_url: '', podcast_description: '', podcast_categories: [{ category_id: '2', category_name: 'SaaS' }] },
          { podcast_id: '3', podcast_name: "Founder Stories", podcast_url: '', podcast_description: '', podcast_categories: [{ category_id: '3', category_name: 'Entrepreneurship' }] },
          { podcast_id: '4', podcast_name: "FinTech Insider", podcast_url: '', podcast_description: '', podcast_categories: [{ category_id: '4', category_name: 'Finance' }] },
          { podcast_id: '5', podcast_name: "Growth Talks", podcast_url: '', podcast_description: '', podcast_categories: [{ category_id: '5', category_name: 'Marketing' }] },
          { podcast_id: '6', podcast_name: "The Executive Edge", podcast_url: '', podcast_description: '', podcast_categories: [{ category_id: '6', category_name: 'Leadership' }] },
          { podcast_id: '7', podcast_name: "Scale & Grow", podcast_url: '', podcast_description: '', podcast_categories: [{ category_id: '7', category_name: 'Business' }] },
          { podcast_id: '8', podcast_name: "Startup Success", podcast_url: '', podcast_description: '', podcast_categories: [{ category_id: '8', category_name: 'Startups' }] },
        ]);
      } finally {
        setIsLoading(false);
      }
    };

    loadPodcasts();
  }, []);

  return (
    <section className="py-20 md:py-32 bg-gradient-to-b from-surface-subtle to-background" id="podcast-showcase">
      <div className="container mx-auto">
        <div
          ref={ref}
          className={`transition-all duration-700 ${
            isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'
          }`}
        >
          {/* Header */}
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-5xl font-bold text-foreground mb-6">
              We've Booked Our Clients On These Shows
            </h2>
            <p className="text-xl text-muted-foreground max-w-2xl mx-auto mb-12">
              From tech and finance to entrepreneurship and leadership—we have relationships
              with podcasts across every major industry.
            </p>

            {/* Stats */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-8 max-w-4xl mx-auto mb-16">
              {stats.map((stat, index) => {
                const Icon = stat.icon;
                return (
                  <div
                    key={index}
                    className="p-6 bg-background rounded-xl border border-border"
                    style={{ transitionDelay: `${index * 100}ms` }}
                  >
                    <Icon className="h-8 w-8 text-primary mx-auto mb-3" />
                    <p className="text-4xl font-bold text-foreground mb-1">{stat.value}</p>
                    <p className="text-sm text-muted-foreground">{stat.label}</p>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Podcast Grid */}
          {isLoading ? (
            <div className="flex items-center justify-center py-20">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
              <span className="ml-3 text-muted-foreground">Loading podcasts...</span>
            </div>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 mb-12">
              {podcasts.map((podcast, index) => (
                <div
                  key={podcast.podcast_id}
                  className="group p-6 bg-background rounded-xl border border-border hover:border-primary/50 transition-all duration-300 hover:shadow-lg flex flex-col items-center justify-center text-center min-h-[140px]"
                  style={{ transitionDelay: `${index * 50}ms` }}
                >
                  {podcast.podcast_image_url ? (
                    <img
                      src={podcast.podcast_image_url}
                      alt={podcast.podcast_name}
                      className="w-12 h-12 rounded-lg mb-3 object-cover"
                    />
                  ) : (
                    <div className="p-3 bg-primary/10 rounded-full mb-3 group-hover:bg-primary/20 transition-colors">
                      <Mic className="h-5 w-5 text-primary" />
                    </div>
                  )}
                  <h3 className="font-semibold text-foreground mb-1 text-sm md:text-base">
                    {podcast.podcast_name}
                  </h3>
                  <p className="text-xs text-muted-foreground">
                    {podcast.podcast_categories?.[0]?.category_name || 'Business'}
                  </p>
                </div>
              ))}
            </div>
          )}

          {/* CTA */}
          <div className="text-center">
            <p className="text-muted-foreground mb-6">
              And we're adding new partnerships every week.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Button variant="default" size="lg" asChild>
                <a href="#pricing">Get Started</a>
              </Button>
              <Button variant="outline" size="lg" asChild>
                <a href="/premium-placements">View Premium Placements</a>
              </Button>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};

export default PodcastShowcaseSection;
