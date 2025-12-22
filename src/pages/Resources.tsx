import { useState } from 'react';
import Navbar from '@/components/Navbar';
import Footer from '@/components/Footer';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useScrollAnimation } from '@/hooks/useScrollAnimation';
import { Download, FileText, Mail, Mic, TrendingUp, Target, Sparkles } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

const leadMagnets = [
  {
    icon: Mic,
    title: "50 Podcasts That Actually Book Guests",
    description: "Stop wasting hours researching. Get our curated list of podcasts actively seeking guests in your niche, organized by industry and audience size.",
    category: "Research"
  },
  {
    icon: Mail,
    title: "Podcast Pitch Email Swipe File",
    description: "10 proven pitch templates that get responses. Copy, customize, and send. Includes subject lines that get opened and follow-up sequences that work.",
    category: "Pitching"
  },
  {
    icon: FileText,
    title: "The Guest One-Sheet Template",
    description: "Present yourself like a pro. The exact template we use to position our clients as the obvious choice for podcast hosts. Fill-in-the-blank format.",
    category: "Positioning"
  },
  {
    icon: TrendingUp,
    title: "Repurpose 1 Episode Into 30 Content Pieces",
    description: "Maximize every podcast appearance. Our complete framework for turning one interview into a month of LinkedIn posts, tweets, reels, and email content.",
    category: "Content"
  },
  {
    icon: Target,
    title: "Media Angle Generator",
    description: "Find newsworthy hooks journalists want to cover. 15 proven angle frameworks to position your expertise as press-worthy, with real examples.",
    category: "PR"
  },
  {
    icon: Sparkles,
    title: "The Podcast Guesting ROI Calculator",
    description: "Calculate the real value of podcast appearances. Input your metrics, see your potential reach, leads, and revenue. Justify the investment to yourself or your team.",
    category: "Strategy"
  },
];

const Resources = () => {
  const { ref, isVisible } = useScrollAnimation<HTMLDivElement>();
  const [email, setEmail] = useState('');
  const { toast } = useToast();

  const handleDownload = (resourceTitle: string) => {
    if (!email) {
      toast({
        title: "Email required",
        description: "Please enter your email to download this resource.",
        variant: "destructive",
      });
      return;
    }

    // Simulate download
    toast({
      title: "Resource sent!",
      description: `We've sent "${resourceTitle}" to ${email}`,
    });

    // Clear email after successful "download"
    setEmail('');
  };

  return (
    <main className="min-h-screen bg-background">
      <Navbar />

      {/* Hero Section */}
      <section className="pt-28 pb-16 md:pt-36 md:pb-24">
        <div className="container mx-auto">
          <div className="max-w-3xl mx-auto text-center">
            <h1 className="text-4xl md:text-6xl font-bold text-foreground mb-6">
              Free Authority Building Resources
            </h1>
            <p className="text-xl text-muted-foreground mb-8">
              Everything you need to start building authority through podcasts and press.
              No fluff. Just proven templates, frameworks, and tools.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center items-center">
              <Input
                type="email"
                placeholder="Enter your email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="max-w-xs"
              />
              <p className="text-sm text-muted-foreground">
                Enter once, download everything below
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Resources Grid */}
      <section className="pb-20 md:pb-32">
        <div className="container mx-auto">
          <div
            ref={ref}
            className={`transition-all duration-700 ${
              isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'
            }`}
          >
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
              {leadMagnets.map((resource, index) => {
                const Icon = resource.icon;
                return (
                  <div
                    key={index}
                    className="p-8 bg-surface-subtle rounded-xl border border-border hover:border-primary/50 transition-all duration-300 hover:shadow-lg"
                    style={{ transitionDelay: `${index * 100}ms` }}
                  >
                    <div className="flex items-start gap-4 mb-4">
                      <div className="p-3 bg-primary/10 rounded-lg">
                        <Icon className="h-6 w-6 text-primary" />
                      </div>
                      <div className="flex-1">
                        <span className="text-xs font-medium text-primary uppercase tracking-wider">
                          {resource.category}
                        </span>
                      </div>
                    </div>

                    <h3 className="text-xl font-bold text-foreground mb-3">
                      {resource.title}
                    </h3>

                    <p className="text-muted-foreground mb-6">
                      {resource.description}
                    </p>

                    <Button
                      variant="outline"
                      className="w-full"
                      onClick={() => handleDownload(resource.title)}
                    >
                      <Download className="h-4 w-4 mr-2" />
                      Download Now
                    </Button>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-10 md:py-20 bg-primary text-primary-foreground">
        <div className="container mx-auto text-center">
          <h2 className="text-3xl md:text-4xl font-bold mb-6">
            Want Us To Do It For You?
          </h2>
          <p className="text-xl mb-8 max-w-2xl mx-auto opacity-90">
            These resources will help you get started. But if you'd rather have experts handle
            everything—research, pitching, booking, prep, and content—that's what we do.
          </p>
          <Button variant="heroOutline" size="lg" asChild>
            <a href="/#pricing">View Our Services</a>
          </Button>
        </div>
      </section>

      <Footer />
    </main>
  );
};

export default Resources;
