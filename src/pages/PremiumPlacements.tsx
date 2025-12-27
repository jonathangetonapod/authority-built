import { useState, useEffect, useMemo } from 'react';
import Navbar from '@/components/Navbar';
import Footer from '@/components/Footer';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useScrollAnimation } from '@/hooks/useScrollAnimation';
import { Mic, Users, TrendingUp, CheckCircle2, Filter, Star, Award, BarChart3, Target, Loader2, ChevronDown, ChevronUp, ShoppingCart, Search, X, SlidersHorizontal } from 'lucide-react';
import { getActivePremiumPodcasts, type PremiumPodcast } from '@/services/premiumPodcasts';
import { useToast } from '@/hooks/use-toast';
import { SocialProofNotifications } from '@/components/SocialProofNotifications';
import { CartButton } from '@/components/CartButton';
import { CartDrawer } from '@/components/CartDrawer';
import { useCartStore } from '@/stores/cartStore';
import { toast } from 'sonner';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { PODCAST_CATEGORIES } from '@/lib/categories';

const AUDIENCE_TIERS = [
  { label: "All Sizes", value: "all", min: 0, max: Infinity },
  { label: "Small (0-25K)", value: "small", min: 0, max: 25000 },
  { label: "Medium (25K-50K)", value: "medium", min: 25000, max: 50000 },
  { label: "Large (50K-100K)", value: "large", min: 50000, max: 100000 },
  { label: "Mega (100K+)", value: "mega", min: 100000, max: Infinity },
];
const PRICE_RANGES = [
  { label: "All Prices", value: "all", min: 0, max: Infinity },
  { label: "Under $1,000", value: "under1k", min: 0, max: 1000 },
  { label: "$1,000 - $2,500", value: "1k-2.5k", min: 1000, max: 2500 },
  { label: "$2,500 - $5,000", value: "2.5k-5k", min: 2500, max: 5000 },
  { label: "$5,000 - $10,000", value: "5k-10k", min: 5000, max: 10000 },
  { label: "$10,000+", value: "10k+", min: 10000, max: Infinity },
];
const SORT_OPTIONS = [
  { label: "Featured", value: "featured" },
  { label: "Price: Low to High", value: "price-asc" },
  { label: "Price: High to Low", value: "price-desc" },
  { label: "Audience: Large to Small", value: "audience-desc" },
  { label: "Audience: Small to Large", value: "audience-asc" },
  { label: "Name: A-Z", value: "name-asc" },
];

const PremiumPlacements = () => {
  const { ref, isVisible } = useScrollAnimation<HTMLDivElement>();
  const [podcasts, setPodcasts] = useState<PremiumPodcast[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [expandedCards, setExpandedCards] = useState<Set<string>>(new Set());
  const [modalPodcast, setModalPodcast] = useState<PremiumPodcast | null>(null);

  // Filter states
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [selectedAudienceTier, setSelectedAudienceTier] = useState("all");
  const [selectedPriceRange, setSelectedPriceRange] = useState("all");
  const [sortBy, setSortBy] = useState("featured");

  const { toast: toastHook } = useToast();

  // Cart store
  const { addItem, isInCart } = useCartStore();

  // Handle add to cart
  const handleAddToCart = (podcast: PremiumPodcast) => {
    addItem(podcast);
    toast.success(`${podcast.podcast_name} added to cart!`, {
      description: 'View your cart to proceed to checkout',
    });
  };

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

  // Get preview text (50 chars max)
  const getPreviewText = (text: string): string => {
    if (text.length <= 50) return text;
    // Truncate to 50 chars at word boundary
    const truncated = text.substring(0, 50);
    const lastSpace = truncated.lastIndexOf(' ');
    return (lastSpace > 0 ? truncated.substring(0, lastSpace) : truncated).trim() + '...';
  };

  // Check if text needs "Read More" (longer than 50 chars)
  const needsReadMore = (text: string): boolean => {
    return text.length > 50;
  };

  useEffect(() => {
    const loadPodcasts = async () => {
      try {
        setIsLoading(true);
        const data = await getActivePremiumPodcasts(); // Load active podcasts from backend
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

  // Helper functions
  const parsePrice = (priceString: string): number => {
    return parseFloat(priceString.replace(/[$,]/g, ''));
  };

  const parseAudience = (audienceString: string | undefined): number => {
    if (!audienceString) return 0;
    return parseFloat(audienceString.replace(/,/g, ''));
  };

  // Comprehensive filtering and sorting
  const filteredAndSortedPodcasts = useMemo(() => {
    let filtered = [...podcasts];

    // Search filter
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(p =>
        p.podcast_name.toLowerCase().includes(query) ||
        p.why_this_show?.toLowerCase().includes(query) ||
        p.category?.toLowerCase().includes(query)
      );
    }

    // Category filter
    if (selectedCategory) {
      filtered = filtered.filter(p => p.category === selectedCategory);
    }

    // Audience tier filter
    if (selectedAudienceTier !== "all") {
      const tier = AUDIENCE_TIERS.find(t => t.value === selectedAudienceTier);
      if (tier) {
        filtered = filtered.filter(p => {
          const audience = parseAudience(p.audience_size);
          return audience >= tier.min && audience < tier.max;
        });
      }
    }

    // Price range filter
    if (selectedPriceRange !== "all") {
      const range = PRICE_RANGES.find(r => r.value === selectedPriceRange);
      if (range) {
        filtered = filtered.filter(p => {
          const price = parsePrice(p.price);
          return price >= range.min && price < range.max;
        });
      }
    }

    // Sort
    filtered.sort((a, b) => {
      switch (sortBy) {
        case "featured":
          // Featured first, then by display order
          if (a.is_featured !== b.is_featured) {
            return a.is_featured ? -1 : 1;
          }
          return a.display_order - b.display_order;

        case "price-asc":
          return parsePrice(a.price) - parsePrice(b.price);

        case "price-desc":
          return parsePrice(b.price) - parsePrice(a.price);

        case "audience-desc":
          return parseAudience(b.audience_size) - parseAudience(a.audience_size);

        case "audience-asc":
          return parseAudience(a.audience_size) - parseAudience(b.audience_size);

        case "name-asc":
          return a.podcast_name.localeCompare(b.podcast_name);

        default:
          return 0;
      }
    });

    return filtered;
  }, [podcasts, searchQuery, selectedCategory, selectedAudienceTier, selectedPriceRange, sortBy]);

  // Clear all filters
  const clearFilters = () => {
    setSearchQuery("");
    setSelectedCategory(null);
    setSelectedAudienceTier("all");
    setSelectedPriceRange("all");
    setSortBy("featured");
  };

  // Check if any filters are active
  const hasActiveFilters = searchQuery || selectedCategory || selectedAudienceTier !== "all" || selectedPriceRange !== "all" || sortBy !== "featured";

  return (
    <main className="min-h-screen bg-background">
      <Navbar />

      {/* Hero Section */}
      <section className="pt-28 pb-16 md:pt-36 md:pb-24 bg-gradient-to-b from-primary/5 to-background px-4">
        <div className="container mx-auto">
          <div className="max-w-3xl mx-auto text-center">
            <Badge className="mb-4">Industry-First Offering</Badge>
            <h1 className="text-3xl sm:text-4xl md:text-6xl font-bold text-foreground mb-6 leading-tight px-2">
              Pick Your Exact Show.<br />Get Booked. Guaranteed.
            </h1>
            <p className="text-base sm:text-lg md:text-xl text-muted-foreground mb-8 leading-relaxed px-4">
              <span className="font-semibold text-foreground">This doesn't exist anywhere else.</span> We've secured exclusive placements on shows that normally ignore cold pitches. You pick from our private menu, we guarantee the booking—no pitching, no rejection, no waiting months for a "maybe."
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

      {/* Filter & Search Section */}
      <section className="pb-8 border-b">
        <div className="container mx-auto space-y-4">
          {/* Search and Sort */}
          <div className="flex flex-col md:flex-row gap-4">
            {/* Search Bar */}
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search podcasts by name, category, or description..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10 pr-10"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery("")}
                  className="absolute right-3 top-1/2 transform -translate-y-1/2"
                >
                  <X className="h-4 w-4 text-muted-foreground hover:text-foreground" />
                </button>
              )}
            </div>

            {/* Sort Dropdown */}
            <Select value={sortBy} onValueChange={setSortBy}>
              <SelectTrigger className="w-full md:w-[220px]">
                <SelectValue placeholder="Sort by" />
              </SelectTrigger>
              <SelectContent>
                {SORT_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {/* Mobile Filter Button */}
            <Sheet>
              <SheetTrigger asChild>
                <Button variant="outline" className="md:hidden">
                  <SlidersHorizontal className="h-4 w-4 mr-2" />
                  Filters
                  {hasActiveFilters && (
                    <Badge variant="destructive" className="ml-2 rounded-full px-2">
                      {[searchQuery, selectedCategory, selectedAudienceTier !== "all", selectedPriceRange !== "all"].filter(Boolean).length}
                    </Badge>
                  )}
                </Button>
              </SheetTrigger>
              <SheetContent side="right" className="w-[300px] overflow-y-auto">
                <SheetHeader>
                  <SheetTitle>Filters</SheetTitle>
                  <SheetDescription>
                    Refine your podcast search
                  </SheetDescription>
                </SheetHeader>
                <div className="space-y-6 mt-6">
                  {/* Mobile Filters */}
                  <div>
                    <label className="text-sm font-medium mb-2 block">Audience Size</label>
                    <Select value={selectedAudienceTier} onValueChange={setSelectedAudienceTier}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {AUDIENCE_TIERS.map((tier) => (
                          <SelectItem key={tier.value} value={tier.value}>
                            {tier.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div>
                    <label className="text-sm font-medium mb-2 block">Price Range</label>
                    <Select value={selectedPriceRange} onValueChange={setSelectedPriceRange}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {PRICE_RANGES.map((range) => (
                          <SelectItem key={range.value} value={range.value}>
                            {range.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  {hasActiveFilters && (
                    <Button onClick={clearFilters} variant="outline" className="w-full">
                      <X className="h-4 w-4 mr-2" />
                      Clear Filters
                    </Button>
                  )}
                </div>
              </SheetContent>
            </Sheet>
          </div>

          {/* Desktop Filters */}
          <div className="hidden md:flex items-center gap-3">
            {/* Category Pills */}
            <span className="text-sm text-muted-foreground whitespace-nowrap">Category:</span>
            <div className="flex items-center gap-2 flex-wrap">
              <Button
                variant={selectedCategory === null ? "default" : "outline"}
                size="sm"
                onClick={() => setSelectedCategory(null)}
                className="h-8"
              >
                All
              </Button>
              {PODCAST_CATEGORIES.map((category) => (
                <Button
                  key={category}
                  variant={selectedCategory === category ? "default" : "outline"}
                  size="sm"
                  onClick={() => setSelectedCategory(category)}
                  className="h-8 whitespace-nowrap"
                >
                  {category}
                </Button>
              ))}
            </div>
          </div>

          <div className="hidden md:flex items-center gap-4">
            {/* Audience Tier Filter */}
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground whitespace-nowrap">Audience:</span>
              <Select value={selectedAudienceTier} onValueChange={setSelectedAudienceTier}>
                <SelectTrigger className="w-[180px] h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {AUDIENCE_TIERS.map((tier) => (
                    <SelectItem key={tier.value} value={tier.value}>
                      {tier.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Price Range Filter */}
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground whitespace-nowrap">Price:</span>
              <Select value={selectedPriceRange} onValueChange={setSelectedPriceRange}>
                <SelectTrigger className="w-[180px] h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PRICE_RANGES.map((range) => (
                    <SelectItem key={range.value} value={range.value}>
                      {range.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Clear Filters */}
            {hasActiveFilters && (
              <Button onClick={clearFilters} variant="ghost" size="sm" className="h-9">
                <X className="h-4 w-4 mr-2" />
                Clear All
              </Button>
            )}
          </div>

          {/* Results Count */}
          <div className="flex items-center justify-between text-sm text-muted-foreground pt-2">
            <span>
              Showing <span className="font-semibold text-foreground">{filteredAndSortedPodcasts.length}</span> of{' '}
              <span className="font-semibold text-foreground">{podcasts.length}</span> podcasts
            </span>
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
            ) : filteredAndSortedPodcasts.length === 0 ? (
              <div className="text-center py-20">
                <Filter className="h-16 w-16 text-muted-foreground mx-auto mb-4" />
                <h3 className="text-xl font-semibold mb-2">No podcasts found</h3>
                <p className="text-muted-foreground mb-4">
                  Try adjusting your filters or search query
                </p>
                {hasActiveFilters && (
                  <Button onClick={clearFilters} variant="outline">
                    <X className="h-4 w-4 mr-2" />
                    Clear All Filters
                  </Button>
                )}
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
                {filteredAndSortedPodcasts.map((podcast, index) => (
                    <div
                      key={podcast.id}
                      className="bg-surface-subtle rounded-2xl border-2 border-border hover:border-primary/50 transition-all duration-300 hover:shadow-2xl relative overflow-hidden group"
                      style={{ transitionDelay: `${index * 100}ms` }}
                    >
                      {/* Badges */}
                      <div className="absolute top-4 right-4 flex flex-col gap-2 z-10">
                        {podcast.is_featured && (
                          <Badge className="bg-gradient-to-r from-primary to-purple-600 border-0">
                            ⭐ Featured
                          </Badge>
                        )}
                      </div>

                      {/* Podcast Artwork */}
                      <div className="relative h-32 md:h-48 bg-gradient-to-br from-primary/20 to-primary/5 overflow-hidden">
                        {podcast.podcast_image_url ? (
                          <img
                            src={podcast.podcast_image_url}
                            alt={podcast.podcast_name}
                            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center">
                            <Mic className="h-12 w-12 md:h-16 md:w-16 text-muted-foreground" />
                          </div>
                        )}
                        <div className="absolute inset-0 bg-gradient-to-t from-surface-subtle via-transparent to-transparent" />
                      </div>

                      <div className="p-4 md:p-6">
                        {/* Podcast Name */}
                        <div className="mb-3 md:mb-4 min-h-[3rem] md:h-16 flex items-center">
                          <h3 className="text-lg md:text-2xl font-bold text-foreground line-clamp-2">
                            {podcast.podcast_name}
                          </h3>
                        </div>

                        {/* Stats Grid */}
                        <div className="grid grid-cols-2 gap-2 md:gap-3 mb-3 md:mb-4">
                          {podcast.audience_size && (
                            <div className="flex items-center gap-2 text-sm">
                              <Users className="h-4 w-4 text-primary" />
                              <div>
                                <p className="text-xs text-muted-foreground">Audience</p>
                                <p className="font-semibold text-foreground">{podcast.audience_size}</p>
                              </div>
                            </div>
                          )}
                          {podcast.episode_count && (
                            <div className="flex items-center gap-2 text-sm">
                              <BarChart3 className="h-4 w-4 text-primary" />
                              <div>
                                <p className="text-xs text-muted-foreground">Episodes</p>
                                <p className="font-semibold text-foreground">{podcast.episode_count}</p>
                              </div>
                            </div>
                          )}
                          {podcast.rating && (
                            <div className="flex items-center gap-2 text-sm">
                              <Star className="h-4 w-4 text-primary" />
                              <div>
                                <p className="text-xs text-muted-foreground">Rating</p>
                                <p className="font-semibold text-foreground">{podcast.rating}</p>
                              </div>
                            </div>
                          )}
                          {podcast.reach_score && (
                            <div className="flex items-center gap-2 text-sm">
                              <TrendingUp className="h-4 w-4 text-primary" />
                              <div>
                                <p className="text-xs text-muted-foreground">Reach Score</p>
                                <p className="font-semibold text-foreground">{podcast.reach_score}</p>
                              </div>
                            </div>
                          )}
                        </div>

                        {/* Why This Show */}
                        {podcast.why_this_show && (
                          <div className="mb-3 md:mb-4 p-2 md:p-3 bg-gradient-to-br from-purple-500/10 to-primary/10 rounded-lg border border-purple-500/20">
                            <div className="flex items-center gap-2 mb-2">
                              <Award className="h-4 w-4 text-purple-500" />
                              <p className="text-xs font-semibold text-purple-700 dark:text-purple-300 uppercase tracking-wider">
                                Why This Show
                              </p>
                            </div>
                            <div className="text-sm text-foreground leading-relaxed">
                              <p>{getPreviewText(podcast.why_this_show)}</p>
                              {needsReadMore(podcast.why_this_show) && (
                                <button
                                  onClick={() => setModalPodcast(podcast)}
                                  className="text-purple-600 dark:text-purple-400 hover:text-purple-700 dark:hover:text-purple-300 font-medium mt-2 text-xs underline transition-colors"
                                >
                                  Read More
                                </button>
                              )}
                            </div>
                          </div>
                        )}

                        {/* Features - Collapsible */}
                        {podcast.whats_included && podcast.whats_included.length > 0 && (
                          <div className="mb-4 md:mb-6">
                            <button
                              onClick={() => toggleFeatures(podcast.id)}
                              className="w-full flex items-center justify-between text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2 hover:text-foreground transition-colors py-2 min-h-[44px]"
                            >
                              <span>What's Included:</span>
                              {expandedCards.has(podcast.id) ? (
                                <ChevronUp className="h-5 w-5" />
                              ) : (
                                <ChevronDown className="h-5 w-5" />
                              )}
                            </button>
                            {expandedCards.has(podcast.id) && (
                              <div className="space-y-2 animate-in fade-in slide-in-from-top-2 duration-200">
                                {podcast.whats_included.map((feature, idx) => (
                                  <div key={idx} className="flex items-start gap-2 text-sm text-muted-foreground">
                                    <CheckCircle2 className="h-4 w-4 text-success mt-0.5 flex-shrink-0" />
                                    {feature}
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        )}

                        {/* Price & CTA */}
                        <div className="border-t-2 border-border pt-4 md:pt-6">
                          <div className="flex items-end justify-between mb-3 md:mb-4">
                            <div>
                              <p className="text-xs text-muted-foreground uppercase tracking-wider">Investment</p>
                              <p className="text-3xl md:text-4xl font-bold text-foreground">{podcast.price}</p>
                              <p className="text-xs text-muted-foreground mt-1">One-time placement</p>
                            </div>
                          </div>
                          {isInCart(podcast.id) ? (
                            <Button
                              className="w-full min-h-[48px] bg-green-600 hover:bg-green-700"
                              size="lg"
                              disabled
                            >
                              <CheckCircle2 className="mr-2 h-5 w-5" />
                              Added to Cart
                            </Button>
                          ) : (
                            <Button
                              className="w-full bg-gradient-to-r from-primary to-purple-600 hover:from-primary/90 hover:to-purple-600/90 min-h-[48px]"
                              size="lg"
                              onClick={() => handleAddToCart(podcast)}
                            >
                              <ShoppingCart className="mr-2 h-5 w-5" />
                              Add to Cart
                            </Button>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
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
            <a href="https://calendly.com/getonapodjg/30min" target="_blank" rel="noopener noreferrer">Book Your Call</a>
          </Button>
        </div>
      </section>

      <Footer />
      <SocialProofNotifications />

      {/* Cart Components */}
      <CartButton />
      <CartDrawer />

      {/* Why This Show Modal */}
      <Dialog open={!!modalPodcast} onOpenChange={(open) => !open && setModalPodcast(null)}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-2xl font-bold flex items-center gap-2">
              <Award className="h-6 w-6 text-purple-500" />
              Why {modalPodcast?.podcast_name}?
            </DialogTitle>
          </DialogHeader>
          <DialogDescription className="text-base text-foreground leading-relaxed pt-4">
            {modalPodcast?.why_this_show}
          </DialogDescription>
        </DialogContent>
      </Dialog>
    </main>
  );
};

export default PremiumPlacements;
