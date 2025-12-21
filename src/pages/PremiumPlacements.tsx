import { useState } from 'react';
import Navbar from '@/components/Navbar';
import Footer from '@/components/Footer';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useScrollAnimation } from '@/hooks/useScrollAnimation';
import { Mic, Users, TrendingUp, CheckCircle2, Filter } from 'lucide-react';

// YOUR CURATED PREMIUM PLACEMENTS - Edit this list with your actual shows
const premiumPlacements = [
  {
    name: "The SaaS Podcast",
    category: "SaaS & Tech",
    audience: "25,000",
    niche: "B2B SaaS Founders",
    description: "Weekly interviews with successful SaaS founders and executives. Known for tactical insights and actionable advice.",
    price: "$1,200",
    features: ["Pre-interview strategy call", "Professional audio editing", "Show notes included", "Social media promotion"],
    popular: false
  },
  {
    name: "Founder Stories",
    category: "Entrepreneurship",
    audience: "40,000",
    niche: "Startup Founders",
    description: "Deep dives into the journey of building and scaling startups. Focuses on lessons learned and pivotal moments.",
    price: "$1,800",
    features: ["Extended 60-min episode", "YouTube video version", "Newsletter feature", "Audiogram clips"],
    popular: true
  },
  {
    name: "FinTech Insider",
    category: "Finance & Tech",
    audience: "15,000",
    niche: "Financial Professionals",
    description: "Exploring innovation in financial technology. Highly engaged audience of investors, advisors, and fintech leaders.",
    price: "$950",
    features: ["Industry-focused audience", "Episode transcript", "LinkedIn promotion", "Content repurposing guide"],
    popular: false
  },
  {
    name: "Scale & Grow",
    category: "Business Growth",
    audience: "32,000",
    niche: "Growth Leaders",
    description: "Marketing, sales, and growth strategies from those who've done it. Tactical, no-fluff conversations.",
    price: "$1,500",
    features: ["Pre-show guest prep", "Multi-platform distribution", "Post-episode promotion", "Guest highlight reel"],
    popular: false
  },
  {
    name: "The Executive Edge",
    category: "Leadership",
    audience: "18,000",
    niche: "C-Suite Executives",
    description: "Leadership insights from CEOs, founders, and executives. Premium positioning for thought leaders.",
    price: "$2,200",
    features: ["Premium audience targeting", "LinkedIn article feature", "Video clips package", "PR-ready content"],
    popular: true
  },
  {
    name: "Tech Talks Daily",
    category: "Technology",
    audience: "28,000",
    niche: "Tech Innovators",
    description: "Daily tech news, trends, and interviews. Fast-moving show with strong listener engagement.",
    price: "$1,100",
    features: ["Same-week publishing", "Social amplification", "Newsletter mention", "Bite-sized clips"],
    popular: false
  }
];

const categories = ["All", "SaaS & Tech", "Entrepreneurship", "Finance & Tech", "Business Growth", "Leadership", "Technology"];

const PremiumPlacements = () => {
  const { ref, isVisible } = useScrollAnimation<HTMLDivElement>();
  const [selectedCategory, setSelectedCategory] = useState("All");

  const filteredPlacements = selectedCategory === "All"
    ? premiumPlacements
    : premiumPlacements.filter(p => p.category === selectedCategory);

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
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
              {filteredPlacements.map((placement, index) => (
                <div
                  key={index}
                  className="p-8 bg-surface-subtle rounded-xl border border-border hover:border-primary/50 transition-all duration-300 hover:shadow-lg relative"
                  style={{ transitionDelay: `${index * 100}ms` }}
                >
                  {placement.popular && (
                    <Badge className="absolute top-4 right-4" variant="default">
                      Popular
                    </Badge>
                  )}

                  <div className="mb-6">
                    <div className="flex items-center gap-2 mb-2">
                      <Mic className="h-5 w-5 text-primary" />
                      <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                        {placement.category}
                      </span>
                    </div>
                    <h3 className="text-2xl font-bold text-foreground mb-2">
                      {placement.name}
                    </h3>
                    <div className="flex items-center gap-4 text-sm text-muted-foreground">
                      <div className="flex items-center gap-1">
                        <Users className="h-4 w-4" />
                        {placement.audience} listeners
                      </div>
                    </div>
                  </div>

                  <div className="mb-4 p-3 bg-primary/5 rounded-lg">
                    <p className="text-sm font-medium text-foreground">
                      <TrendingUp className="h-4 w-4 inline mr-1" />
                      {placement.niche}
                    </p>
                  </div>

                  <p className="text-muted-foreground mb-6">
                    {placement.description}
                  </p>

                  <div className="mb-6 space-y-2">
                    <p className="text-sm font-semibold text-foreground mb-2">Included:</p>
                    {placement.features.map((feature, idx) => (
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
                        <p className="text-3xl font-bold text-foreground">{placement.price}</p>
                      </div>
                    </div>
                    <Button className="w-full" asChild>
                      <a href="/#book">Book This Show</a>
                    </Button>
                  </div>
                </div>
              ))}
            </div>
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
    </main>
  );
};

export default PremiumPlacements;
