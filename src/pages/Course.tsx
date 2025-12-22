import { useState } from 'react';
import Navbar from '@/components/Navbar';
import Footer from '@/components/Footer';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { useScrollAnimation } from '@/hooks/useScrollAnimation';
import { CheckCircle2, Clock, PlayCircle, FileText, Mic, Target, TrendingUp } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

const modules = [
  {
    icon: Target,
    title: "Module 1: Finding Your Niche",
    description: "Identify your expertise, define your audience, and position yourself as the go-to authority in your space."
  },
  {
    icon: Mic,
    title: "Module 2: Building Your Target List",
    description: "Research and vet podcasts that match your niche. Learn what makes a good show and how to prioritize your targets."
  },
  {
    icon: FileText,
    title: "Module 3: Creating Your Guest Assets",
    description: "Build your one-sheet, bio, talking points, and media kit. Make it easy for hosts to say yes."
  },
  {
    icon: PlayCircle,
    title: "Module 4: The Pitch That Gets Booked",
    description: "Email templates, subject lines, and follow-up sequences that get responses. Real examples and swipe files included."
  },
  {
    icon: CheckCircle2,
    title: "Module 5: Show Up & Deliver Value",
    description: "Pre-interview prep, talking point frameworks, and how to tell stories that resonate. Be a guest hosts want back."
  },
  {
    icon: TrendingUp,
    title: "Module 6: Repurpose Everything",
    description: "Turn one podcast appearance into 30+ pieces of content. Social posts, emails, clips, and more."
  }
];

const Course = () => {
  const { ref, isVisible } = useScrollAnimation<HTMLDivElement>();
  const [email, setEmail] = useState('');
  const { toast } = useToast();

  const handleJoinWaitlist = (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) {
      toast({
        title: "Email required",
        description: "Please enter your email to join the waitlist.",
        variant: "destructive",
      });
      return;
    }

    toast({
      title: "You're on the list!",
      description: `We'll notify ${email} when the course launches.`,
    });

    setEmail('');
  };

  return (
    <main className="min-h-screen bg-background">
      <Navbar />

      {/* Hero Section */}
      <section className="pt-28 pb-16 md:pt-36 md:pb-24 bg-gradient-to-b from-primary/5 to-background">
        <div className="container mx-auto">
          <div className="max-w-3xl mx-auto text-center">
            <Badge className="mb-4">Coming Soon</Badge>
            <h1 className="text-4xl md:text-6xl font-bold text-foreground mb-6">
              DIY Podcast Guesting Masterclass
            </h1>
            <p className="text-xl text-muted-foreground mb-8">
              Everything you need to get booked on podcasts and build authority—without hiring an agency.
              The complete system we use for our clients, now available for you to do yourself.
            </p>

            <form onSubmit={handleJoinWaitlist} className="flex flex-col sm:flex-row gap-4 justify-center items-center max-w-lg mx-auto mb-8">
              <Input
                type="email"
                placeholder="Enter your email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="max-w-xs"
              />
              <Button type="submit" size="lg">
                Join Waitlist
              </Button>
            </form>

            <div className="flex flex-col sm:flex-row gap-4 justify-center items-center text-sm text-muted-foreground">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="h-5 w-5 text-success" />
                6 in-depth modules
              </div>
              <div className="flex items-center gap-2">
                <CheckCircle2 className="h-5 w-5 text-success" />
                Templates & swipe files
              </div>
              <div className="flex items-center gap-2">
                <CheckCircle2 className="h-5 w-5 text-success" />
                Real pitch examples
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* What's Included Section */}
      <section className="py-10 md:py-20">
        <div className="container mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-bold text-foreground mb-4">
              What You'll Learn
            </h2>
            <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
              The exact process we use to book our clients on podcasts every month.
              No theory. Just proven frameworks and templates.
            </p>
          </div>

          <div
            ref={ref}
            className={`transition-all duration-700 ${
              isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'
            }`}
          >
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
              {modules.map((module, index) => {
                const Icon = module.icon;
                return (
                  <div
                    key={index}
                    className="p-8 bg-surface-subtle rounded-xl border border-border"
                    style={{ transitionDelay: `${index * 100}ms` }}
                  >
                    <div className="p-3 bg-primary/10 rounded-lg w-fit mb-4">
                      <Icon className="h-6 w-6 text-primary" />
                    </div>

                    <h3 className="text-xl font-bold text-foreground mb-3">
                      {module.title}
                    </h3>

                    <p className="text-muted-foreground">
                      {module.description}
                    </p>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </section>

      {/* Bonuses Section */}
      <section className="py-10 md:py-20 bg-surface-subtle">
        <div className="container mx-auto max-w-4xl">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-bold text-foreground mb-4">
              Plus These Bonuses
            </h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="p-6 bg-background rounded-xl border border-border">
              <h3 className="text-lg font-bold text-foreground mb-2">
                50+ Podcast Pitch Templates
              </h3>
              <p className="text-muted-foreground">
                Copy-paste email templates for every scenario: cold pitches, warm intros, follow-ups, and thank-yous.
              </p>
            </div>

            <div className="p-6 bg-background rounded-xl border border-border">
              <h3 className="text-lg font-bold text-foreground mb-2">
                Guest One-Sheet Template
              </h3>
              <p className="text-muted-foreground">
                The exact template we use to position our clients. Fill-in-the-blank format, ready to customize.
              </p>
            </div>

            <div className="p-6 bg-background rounded-xl border border-border">
              <h3 className="text-lg font-bold text-foreground mb-2">
                Content Repurposing Playbook
              </h3>
              <p className="text-muted-foreground">
                Turn every podcast appearance into 30+ pieces of content across LinkedIn, Twitter, email, and more.
              </p>
            </div>

            <div className="p-6 bg-background rounded-xl border border-border">
              <h3 className="text-lg font-bold text-foreground mb-2">
                Curated Podcast Lists by Niche
              </h3>
              <p className="text-muted-foreground">
                Hundreds of vetted podcasts organized by industry, so you can start pitching immediately.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Timeline Section */}
      <section className="py-10 md:py-20">
        <div className="container mx-auto max-w-3xl text-center">
          <div className="p-8 bg-surface-subtle rounded-xl border border-border">
            <Clock className="h-12 w-12 text-primary mx-auto mb-4" />
            <h2 className="text-2xl md:text-3xl font-bold text-foreground mb-4">
              Launching Q1 2025
            </h2>
            <p className="text-muted-foreground mb-6">
              Join the waitlist to get early access pricing and exclusive bonuses when we launch.
            </p>
            <form onSubmit={handleJoinWaitlist} className="flex flex-col sm:flex-row gap-4 justify-center items-center max-w-md mx-auto">
              <Input
                type="email"
                placeholder="Enter your email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
              <Button type="submit">
                Notify Me
              </Button>
            </form>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-10 md:py-20 bg-primary text-primary-foreground">
        <div className="container mx-auto text-center">
          <h2 className="text-3xl md:text-4xl font-bold mb-6">
            Don't Want To Wait? We'll Do It For You.
          </h2>
          <p className="text-xl mb-8 max-w-2xl mx-auto opacity-90">
            If you'd rather have experts handle everything while you focus on your business,
            check out our done-for-you services.
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

export default Course;
