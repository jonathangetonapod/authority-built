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
    <section id="lead-magnet" className="py-20 md:py-32 bg-surface-muted">
      <div className="container mx-auto">
        <div
          ref={ref}
          className={`max-w-2xl mx-auto text-center transition-all duration-700 ${
            isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'
          }`}
        >
          <h2 className="text-3xl md:text-4xl font-bold text-foreground mb-4">
            Not Ready for a Call?
          </h2>
          
          <p className="text-lg text-muted-foreground mb-8">
            Get our free list of 50 podcasts that actually book guests — with audience size, 
            niche, and how to pitch each one.
          </p>
          
          <form onSubmit={handleSubmit} className="flex flex-col sm:flex-row gap-4 max-w-md mx-auto">
            <Input
              type="email"
              placeholder="Enter your email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="flex-1 h-12 bg-background"
              required
            />
            <Button type="submit" variant="hero" size="lg">
              Get the Free List
            </Button>
          </form>
          
          <p className="text-sm text-muted-foreground mt-4">
            Join 500+ founders building authority through podcasts.
          </p>
        </div>
      </div>
    </section>
  );
};

export default LeadMagnetSection;
