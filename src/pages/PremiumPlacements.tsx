import { useState, useEffect } from 'react';
import Navbar from '@/components/Navbar';
import Footer from '@/components/Footer';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useScrollAnimation } from '@/hooks/useScrollAnimation';
import { Mic, Users, TrendingUp, CheckCircle2, Filter, Star, Award, BarChart3, Target, Loader2, ChevronDown, ChevronUp } from 'lucide-react';
import { searchPremiumPodcasts, PodcastData, getPodcastAnalytics } from '@/services/podscan';
import { useToast } from '@/hooks/use-toast';
import { SocialProofNotifications } from '@/components/SocialProofNotifications';

// Helper function to generate pricing tiers based on audience size
const generatePricing = (audienceSize: number): { price: string; features: string[] } => {
  if (audienceSize >= 100000) {
    return {
      price: '$3,500',
      features: [
        'Premium audience targeting',
        'Full video + audio production',
        'Multi-platform distribution',
        'LinkedIn article feature',
        '3-month promotion package'
      ]
    };
  } else if (audienceSize >= 50000) {
    return {
      price: '$2,200',
      features: [
        'Extended 60-min episode',
        'YouTube video version',
        'Newsletter feature',
        'Audiogram clips package',
        'Social amplification'
      ]
    };
  } else if (audienceSize >= 25000) {
    return {
      price: '$1,500',
      features: [
        'Pre-show guest prep',
        'Professional audio editing',
        'Show notes included',
        'Social media promotion',
        'Content repurposing guide'
      ]
    };
  } else {
    return {
      price: '$950',
      features: [
        'Pre-interview strategy call',
        'Episode transcript',
        'LinkedIn promotion',
        'Guest highlight reel'
      ]
    };
  }
};

// AI-style summary generator based on podcast data
const generateAISummary = (podcast: PodcastData, analytics: any): string => {
  const audienceLevel = analytics.audience_size >= 50000 ? 'large' : analytics.audience_size >= 25000 ? 'substantial' : 'engaged';
  const rating = analytics.rating;

  const summaries = [
    `Perfect for ${analytics.categories[0]?.toLowerCase() || 'business'} leaders looking to reach ${audienceLevel} audiences. ${rating > 4.7 ? 'Highly-rated show' : 'Established show'} with proven track record of converting listeners into followers and clients.`,
    `Ideal positioning for thought leaders in ${analytics.categories[0] || 'business'}. ${audienceLevel === 'large' ? 'Elite' : 'Highly engaged'} audience with strong conversion rates. Past guests report significant LinkedIn growth and inbound within 30 days.`,
    `Top-tier show for ${analytics.categories[0]?.toLowerCase() || 'industry'} visibility. Audience consists of decision-makers and leaders. Known for ${rating > 4.8 ? 'exceptional quality' : 'quality content'} and strong listener engagement.`,
  ];

  return summaries[Math.floor(Math.random() * summaries.length)];
};

const categories = ["All", "SaaS & Tech", "Entrepreneurship", "Finance & Tech", "Business Growth", "Leadership", "Technology"];

const PremiumPlacements = () => {
  const { ref, isVisible } = useScrollAnimation<HTMLDivElement>();
  const [selectedCategory, setSelectedCategory] = useState("All");
  const [podcasts, setPodcasts] = useState<PodcastData[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [expandedCards, setExpandedCards] = useState<Set<string>>(new Set());
  const { toast } = useToast();

  const toggleFeatures = (podcastId: string) => {
    setExpandedCards(prev => {
      const newSet = new Set(prev);
      if (newSet.has(podcastId)) {
        newSet.delete(podcastId);
      } else {
        newSet.add(podcastId);
      }
      return newSet;
    });
  };

  useEffect(() => {
    const loadPodcasts = async () => {
      try {
        setIsLoading(true);
        const data = await searchPremiumPodcasts(12); // Load 12 premium podcasts
        setPodcasts(data);
      } catch (error) {
        console.error('Failed to load premium podcasts:', error);
        toast({
          title: "Failed to load podcasts",
          description: "Please try again later.",
          variant: "destructive",
        });
      } finally {
        setIsLoading(false);
      }
    };

    loadPodcasts();
  }, []);

  const filteredPlacements = selectedCategory === "All"
    ? podcasts
    : podcasts.filter(p => {
        const primaryCategory = p.podcast_categories?.[0]?.category_name || '';
        return primaryCategory.toLowerCase().includes(selectedCategory.toLowerCase()) ||
               selectedCategory.toLowerCase().includes(primaryCategory.toLowerCase());
      });

  return (
    <main className="min-h-screen bg-background">
      <Navbar />

      {/* Hero Section */}
      <section className="pt-28 pb-16 md:pt-36 md:pb-24 bg-gradient-to-b from-primary/5 to-background px-4">
        <div className="container mx-auto">
          <div className="max-w-3xl mx-auto text-center">
            <Badge className="mb-4">Premium Placements</Badge>
            <h1 className="text-3xl sm:text-4xl md:text-6xl font-bold text-foreground mb-6 leading-tight px-2">
              Guaranteed Podcast Spots
            </h1>
            <p className="text-base sm:text-lg md:text-xl text-muted-foreground mb-8 leading-relaxed px-4">
              Skip the uncertainty. Choose from our curated menu of podcasts where we guarantee your placement.
              Pick your shows, we handle the booking.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center items-center text-sm text-muted-foreground">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="h-5 w-5 text-success" />
                Guaranteed placement
              </div>
              <div className="flex items-center gap-2">
                <CheckCircle2 className="h-5 w-5 text-success" />
                Pre-vetted shows
              </div>
              <div className="flex items-center gap-2">
                <CheckCircle2 className="h-5 w-5 text-success" />
                Full prep included
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Filter Section */}
      <section className="pb-12">
        <div className="container mx-auto">
          <div className="flex items-center gap-4 overflow-x-auto pb-4">
            <Filter className="h-5 w-5 text-muted-foreground flex-shrink-0" />
            {categories.map((category) => (
              <Button
                key={category}
                variant={selectedCategory === category ? "default" : "outline"}
                size="sm"
                onClick={() => setSelectedCategory(category)}
                className="whitespace-nowrap"
              >
                {category}
              </Button>
            ))}
          </div>
        </div>
      </section>

      {/* Placements Grid */}
      <section className="pb-20 md:pb-32">
        <div className="container mx-auto">
          <div
            ref={ref}
            className={`transition-all duration-700 ${
              isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'
            }`}
          >
            {isLoading ? (
              <div className="flex items-center justify-center py-20">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
                <span className="ml-3 text-muted-foreground">Loading premium podcasts...</span>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
                {filteredPlacements.map((podcast, index) => {
                  const analytics = getPodcastAnalytics(podcast);
                  const pricing = generatePricing(analytics.audience_size);
                  const aiSummary = generateAISummary(podcast, analytics);
                  const isFeatured = analytics.audience_size >= 75000;
                  const isPopular = analytics.rating >= 4.7 && !isFeatured;

                  return (
                    <div
                      key={podcast.podcast_id}
                      className="bg-surface-subtle rounded-2xl border-2 border-border hover:border-primary/50 transition-all duration-300 hover:shadow-2xl relative overflow-hidden group"
                      style={{ transitionDelay: `${index * 100}ms` }}
                    >
                      {/* Badges */}
                      <div className="absolute top-4 right-4 flex flex-col gap-2 z-10">
                        {isFeatured && (
                          <Badge className="bg-gradient-to-r from-primary to-purple-600 border-0">
                            ⭐ Featured
                          </Badge>
                        )}
                        {isPopular && (
                          <Badge variant="default">
                            Popular
                          </Badge>
                        )}
                      </div>

                      {/* Podcast Artwork */}
                      <div className="relative h-48 bg-gradient-to-br from-primary/20 to-primary/5 overflow-hidden">
                        <img
                          src={podcast.podcast_image_url}
                          alt={podcast.podcast_name}
                          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                        />
                        <div className="absolute inset-0 bg-gradient-to-t from-surface-subtle via-transparent to-transparent" />
                      </div>

                      <div className="p-6">
                        {/* Category & Name */}
                        <div className="mb-4">
                          <div className="flex items-center gap-2 mb-2">
                            <Mic className="h-4 w-4 text-primary" />
                            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                              {podcast.podcast_categories?.[0]?.category_name || 'Business'}
                            </span>
                          </div>
                          <h3 className="text-2xl font-bold text-foreground mb-2 line-clamp-2">
                            {podcast.podcast_name}
                          </h3>
                        </div>

                        {/* Stats Grid */}
                        <div className="grid grid-cols-2 gap-3 mb-4">
                          <div className="flex items-center gap-2 text-sm">
                            <Users className="h-4 w-4 text-primary" />
                            <div>
                              <p className="text-xs text-muted-foreground">Audience</p>
                              <p className="font-semibold text-foreground">
                                {analytics.audience_size > 0
                                  ? `${(analytics.audience_size / 1000).toFixed(0)}K`
                                  : 'N/A'}
                              </p>
                            </div>
                          </div>
                          <div className="flex items-center gap-2 text-sm">
                            <BarChart3 className="h-4 w-4 text-primary" />
                            <div>
                              <p className="text-xs text-muted-foreground">Episodes</p>
                              <p className="font-semibold text-foreground">{analytics.episode_count}</p>
                            </div>
                          </div>
                          <div className="flex items-center gap-2 text-sm">
                            <Star className="h-4 w-4 text-primary" />
                            <div>
                              <p className="text-xs text-muted-foreground">Rating</p>
                              <p className="font-semibold text-foreground">
                                {analytics.rating ? `${analytics.rating.toFixed(1)}/5` : 'N/A'}
                              </p>
                            </div>
                          </div>
                          <div className="flex items-center gap-2 text-sm">
                            <TrendingUp className="h-4 w-4 text-primary" />
                            <div>
                              <p className="text-xs text-muted-foreground">Reach Score</p>
                              <p className="font-semibold text-foreground">{Math.round(analytics.reach_score)}</p>
                            </div>
                          </div>
                        </div>

                        {/* AI Summary */}
                        <div className="mb-4 p-3 bg-gradient-to-br from-purple-500/10 to-primary/10 rounded-lg border border-purple-500/20">
                          <div className="flex items-center gap-2 mb-2">
                            <Award className="h-4 w-4 text-purple-500" />
                            <p className="text-xs font-semibold text-purple-700 dark:text-purple-300 uppercase tracking-wider">
                              Why This Show
                            </p>
                          </div>
                          <p className="text-sm text-foreground leading-relaxed">
                            {aiSummary}
                          </p>
                        </div>

                        {/* Features - Collapsible */}
                        <div className="mb-6">
                          <button
                            onClick={() => toggleFeatures(podcast.podcast_id)}
                            className="w-full flex items-center justify-between text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2 hover:text-foreground transition-colors py-2 min-h-[44px]"
                          >
                            <span>What's Included:</span>
                            {expandedCards.has(podcast.podcast_id) ? (
                              <ChevronUp className="h-5 w-5" />
                            ) : (
                              <ChevronDown className="h-5 w-5" />
                            )}
                          </button>
                          {expandedCards.has(podcast.podcast_id) && (
                            <div className="space-y-2 animate-in fade-in slide-in-from-top-2 duration-200">
                              {pricing.features.map((feature, idx) => (
                                <div key={idx} className="flex items-start gap-2 text-sm text-muted-foreground">
                                  <CheckCircle2 className="h-4 w-4 text-success mt-0.5 flex-shrink-0" />
                                  {feature}
                                </div>
                              ))}
                            </div>
                          )}
                        </div>

                        {/* Price & CTA */}
                        <div className="border-t-2 border-border pt-6">
                          <div className="flex items-end justify-between mb-4">
                            <div>
                              <p className="text-xs text-muted-foreground uppercase tracking-wider">Investment</p>
                              <p className="text-4xl font-bold text-foreground">{pricing.price}</p>
                              <p className="text-xs text-muted-foreground mt-1">One-time placement</p>
                            </div>
                          </div>
                          <Button className="w-full bg-gradient-to-r from-primary to-primary/80 hover:from-primary/90 hover:to-primary/70 min-h-[48px]" size="lg" asChild>
                            <a href="/#book">Book This Show →</a>
                          </Button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </section>

      {/* FAQ Section */}
      <section className="py-10 md:py-20 bg-surface-subtle">
        <div className="container mx-auto max-w-3xl">
          <h2 className="text-3xl md:text-4xl font-bold text-foreground text-center mb-12">
            How Premium Placements Work
          </h2>
          <div className="space-y-6">
            <div>
              <h3 className="text-xl font-bold text-foreground mb-2">
                What's the difference between Premium Placements and your retainer plans?
              </h3>
              <p className="text-muted-foreground">
                Retainer plans involve us researching and pitching shows that match your niche—you don't choose the specific shows. Premium Placements let you pick exactly which shows you want to be on from our pre-vetted menu, with guaranteed booking.
              </p>
            </div>
            <div>
              <h3 className="text-xl font-bold text-foreground mb-2">
                How quickly can I get booked?
              </h3>
              <p className="text-muted-foreground">
                Most Premium Placements are booked within 2-3 weeks. Recording typically happens within 4-6 weeks, and episodes air 4-8 weeks after recording (varies by show).
              </p>
            </div>
            <div>
              <h3 className="text-xl font-bold text-foreground mb-2">
                Can I book multiple shows at once?
              </h3>
              <p className="text-muted-foreground">
                Absolutely. Many clients book 3-5 Premium Placements upfront to create a consistent content pipeline. We'll coordinate timing to avoid overlap.
              </p>
            </div>
            <div>
              <h3 className="text-xl font-bold text-foreground mb-2">
                What if I want a show that's not on this list?
              </h3>
              <p className="text-muted-foreground">
                Book a call with us. We may be able to add specific shows to your package or recommend similar alternatives. Our menu is constantly growing.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-10 md:py-20 bg-primary text-primary-foreground">
        <div className="container mx-auto text-center">
          <h2 className="text-3xl md:text-4xl font-bold mb-6">
            Ready To Pick Your Shows?
          </h2>
          <p className="text-xl mb-8 max-w-2xl mx-auto opacity-90">
            Book a call to discuss which shows are the best fit for your message and goals.
          </p>
          <Button variant="heroOutline" size="lg" asChild>
            <a href="/#book">Book Your Call</a>
          </Button>
        </div>
      </section>

      <Footer />
      <SocialProofNotifications />
    </main>
  );
};

export default PremiumPlacements;
