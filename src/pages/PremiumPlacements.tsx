import { useState, useEffect } from 'react';
import Navbar from '@/components/Navbar';
import Footer from '@/components/Footer';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useScrollAnimation } from '@/hooks/useScrollAnimation';
import { Mic, Users, TrendingUp, CheckCircle2, Filter, Loader2, ExternalLink, BarChart3 } from 'lucide-react';
import { searchBusinessPodcasts, searchFinancePodcasts, searchTechPodcasts, searchPodcasts, extractUniquePodcasts, PodcastData } from '@/services/podscan';
import { useToast } from '@/hooks/use-toast';
import { PodcastAnalyticsModal } from '@/components/PodcastAnalyticsModal';

const categories = ["All", "Business", "Finance", "Technology", "SaaS", "Marketing", "Leadership"];

// Calculate pricing based on reach score
const calculatePrice = (podcast: PodcastData): string => {
  const reachScore = podcast.podcast_reach_score || 0;
  if (reachScore > 80) return "$2,200";
  if (reachScore > 60) return "$1,800";
  if (reachScore > 40) return "$1,500";
  if (reachScore > 20) return "$1,200";
  return "$950";
};

// Calculate audience estimate from reach score
const calculateAudience = (podcast: PodcastData): string => {
  const reachScore = podcast.podcast_reach_score || 0;
  if (reachScore > 80) return "40,000+";
  if (reachScore > 60) return "30,000+";
  if (reachScore > 40) return "20,000+";
  if (reachScore > 20) return "15,000+";
  return "10,000+";
};

const getFeatures = (podcast: PodcastData) => [
  "Guest prep kit included",
  "Professional audio editing",
  "Show notes & transcript",
  "Social media promotion"
];

const PremiumPlacements = () => {
  const { ref, isVisible } = useScrollAnimation<HTMLDivElement>();
  const [selectedCategory, setSelectedCategory] = useState("All");
  const [podcasts, setPodcasts] = useState<PodcastData[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedPodcast, setSelectedPodcast] = useState<PodcastData | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const { toast } = useToast();

  const handlePodcastClick = (podcast: PodcastData) => {
    setSelectedPodcast(podcast);
    setIsModalOpen(true);
  };

  useEffect(() => {
    const loadPodcasts = async () => {
      try {
        setIsLoading(true);
        let data: PodcastData[];

        // Load different podcasts based on selected category
        if (selectedCategory === "All" || selectedCategory === "Business") {
          data = await searchBusinessPodcasts(20);
        } else if (selectedCategory === "Finance") {
          data = await searchFinancePodcasts(20);
        } else if (selectedCategory === "Technology" || selectedCategory === "SaaS") {
          data = await searchTechPodcasts(20);
        } else {
          // For other categories, use generic search
          const response = await searchPodcasts({
            query: selectedCategory.toLowerCase(),
            per_page: 40,
            order_by: 'podcast_rating',
            order_dir: 'desc',
          });
          data = extractUniquePodcasts(response).slice(0, 20);
        }

        setPodcasts(data);
      } catch (error) {
        console.error('Failed to load podcasts:', error);
        toast({
          title: "Failed to load podcasts",
          description: "Please try again later.",
          variant: "destructive",
        });
        setPodcasts([]);
      } finally {
        setIsLoading(false);
      }
    };

    loadPodcasts();
  }, [selectedCategory]);

  const filteredPlacements = podcasts;

  return (
    <main className="min-h-screen bg-background">
      <Navbar />

      {/* Hero Section */}
      <section className="pt-32 pb-20 md:pt-40 md:pb-32 bg-gradient-to-b from-primary/5 to-background">
        <div className="container mx-auto">
          <div className="max-w-3xl mx-auto text-center">
            <Badge className="mb-4">Premium Placements</Badge>
            <h1 className="text-4xl md:text-6xl font-bold text-foreground mb-6">
              Guaranteed Podcast Spots
            </h1>
            <p className="text-xl text-muted-foreground mb-8">
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
                <span className="ml-3 text-muted-foreground">Loading podcasts...</span>
              </div>
            ) : filteredPlacements.length === 0 ? (
              <div className="text-center py-20">
                <p className="text-muted-foreground">No podcasts found in this category.</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
                {filteredPlacements.map((podcast, index) => {
                  const price = calculatePrice(podcast);
                  const audience = calculateAudience(podcast);
                  const features = getFeatures(podcast);
                  const isPopular = (podcast.podcast_reach_score || 0) > 60;

                  return (
                    <div
                      key={podcast.podcast_id}
                      className="p-8 bg-surface-subtle rounded-xl border border-border hover:border-primary/50 transition-all duration-300 hover:shadow-lg relative"
                      style={{ transitionDelay: `${index * 100}ms` }}
                    >
                      {isPopular && (
                        <Badge className="absolute top-4 right-4" variant="default">
                          Popular
                        </Badge>
                      )}

                      <div className="mb-6">
                        {podcast.podcast_image_url && (
                          <img
                            src={podcast.podcast_image_url}
                            alt={podcast.podcast_name}
                            className="w-16 h-16 rounded-lg mb-4 object-cover"
                          />
                        )}
                        <div className="flex items-center gap-2 mb-2">
                          <Mic className="h-5 w-5 text-primary" />
                          <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                            {podcast.podcast_categories?.[0]?.category_name || selectedCategory}
                          </span>
                        </div>
                        <h3 className="text-2xl font-bold text-foreground mb-2">
                          {podcast.podcast_name}
                        </h3>
                        <div className="flex items-center gap-4 text-sm text-muted-foreground">
                          <div className="flex items-center gap-1">
                            <Users className="h-4 w-4" />
                            {audience} listeners
                          </div>
                          {podcast.podcast_url && (
                            <a
                              href={podcast.podcast_url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="flex items-center gap-1 hover:text-primary transition-colors"
                            >
                              <ExternalLink className="h-3 w-3" />
                              View
                            </a>
                          )}
                        </div>
                      </div>

                      {podcast.podcast_reach_score && (
                        <div className="mb-4 p-3 bg-primary/5 rounded-lg">
                          <p className="text-sm font-medium text-foreground">
                            <TrendingUp className="h-4 w-4 inline mr-1" />
                            Reach Score: {Math.round(podcast.podcast_reach_score)}/100
                          </p>
                        </div>
                      )}

                      <p className="text-muted-foreground mb-6 line-clamp-3">
                        {podcast.podcast_description || 'High-quality podcast with engaged audience in the ' + (podcast.podcast_categories?.[0]?.category_name || selectedCategory) + ' space.'}
                      </p>

                      <div className="mb-6 space-y-2">
                        <p className="text-sm font-semibold text-foreground mb-2">Included:</p>
                        {features.map((feature, idx) => (
                          <div key={idx} className="flex items-start gap-2 text-sm text-muted-foreground">
                            <CheckCircle2 className="h-4 w-4 text-success mt-0.5 flex-shrink-0" />
                            {feature}
                          </div>
                        ))}
                      </div>

                      <div className="border-t border-border pt-6">
                        <div className="flex items-end justify-between mb-4">
                          <div>
                            <p className="text-sm text-muted-foreground">One-time placement</p>
                            <p className="text-3xl font-bold text-foreground">{price}</p>
                          </div>
                        </div>
                        <div className="flex gap-2">
                          <Button
                            variant="outline"
                            className="flex-1"
                            onClick={() => handlePodcastClick(podcast)}
                          >
                            <BarChart3 className="h-4 w-4 mr-2" />
                            Analytics
                          </Button>
                          <Button className="flex-1" asChild>
                            <a href="/#book">Book Show</a>
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
      <section className="py-20 md:py-32 bg-surface-subtle">
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
      <section className="py-20 md:py-32 bg-primary text-primary-foreground">
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

      {/* Analytics Modal */}
      <PodcastAnalyticsModal
        podcast={selectedPodcast}
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
      />
    </main>
  );
};

export default PremiumPlacements;
