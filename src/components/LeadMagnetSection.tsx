import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useScrollAnimation } from '@/hooks/useScrollAnimation';
import { useToast } from '@/hooks/use-toast';

const LeadMagnetSection = () => {
  const [email, setEmail] = useState('');
  const { ref, isVisible } = useScrollAnimation<HTMLDivElement>();
  const { toast } = useToast();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (email) {
      toast({
        title: "You're on the list!",
        description: "Check your inbox for the free podcast list.",
      });
      setEmail('');
    }
  };

  return (
    <section id="lead-magnet" className="py-8 md:py-16 bg-surface-muted px-4">
      <div className="container mx-auto">
        <div
          ref={ref}
          className={`max-w-2xl mx-auto text-center transition-all duration-700 ${
            isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'
          }`}
        >
          <h2 className="text-2xl sm:text-3xl md:text-4xl font-bold text-foreground mb-4 px-4">
            Not Ready for a Call?
          </h2>

          <p className="text-base sm:text-lg text-muted-foreground mb-8 px-4 leading-relaxed">
            Get our free list of 50 podcasts that actually book guests — with audience size,
            niche, and how to pitch each one.
          </p>

          <form onSubmit={handleSubmit} className="flex flex-col sm:flex-row gap-3 sm:gap-4 max-w-md mx-auto px-4">
            <Input
              type="email"
              placeholder="Enter your email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="flex-1 h-12 sm:h-14 bg-background text-base"
              required
            />
            <Button type="submit" variant="hero" size="lg" className="min-h-[48px] sm:min-h-[56px] w-full sm:w-auto whitespace-nowrap">
              Get the Free List
            </Button>
          </form>

          <p className="text-sm text-muted-foreground mt-4 px-4">
            Join 500+ founders building authority through podcasts.
          </p>
        </div>
      </div>
    </section>
  );
};

export default LeadMagnetSection;
