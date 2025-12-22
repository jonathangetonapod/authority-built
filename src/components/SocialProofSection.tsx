import { useScrollAnimation } from '@/hooks/useScrollAnimation';
import { Play } from 'lucide-react';

// VIDEO TESTIMONIALS - Replace these with your actual video embed URLs
const videoTestimonials = [
  {
    videoUrl: "https://www.youtube.com/embed/dQw4w9WgXcQ", // Replace with your video
    thumbnail: "https://img.youtube.com/vi/dQw4w9WgXcQ/maxresdefault.jpg", // Auto-generated from YouTube ID
    name: "Sarah Chen",
    title: "Founder & CEO",
    company: "TechStart Ventures",
    quote: "Authority Lab helped me land 12 podcast appearances in 3 months.",
  },
  {
    videoUrl: "https://www.youtube.com/embed/dQw4w9WgXcQ", // Replace with your video
    thumbnail: "https://img.youtube.com/vi/dQw4w9WgXcQ/maxresdefault.jpg",
    name: "Michael Torres",
    title: "Managing Partner",
    company: "Torres Wealth Advisory",
    quote: "I hated self-promotion. Now I just show up to interviews fully prepped.",
  },
  {
    videoUrl: "https://www.youtube.com/embed/dQw4w9WgXcQ", // Replace with your video
    thumbnail: "https://img.youtube.com/vi/dQw4w9WgXcQ/maxresdefault.jpg",
    name: "Emily Watson",
    title: "CFO",
    company: "GrowthScale Inc",
    quote: "The content package alone is worth the investment.",
  },
];

const SocialProofSection = () => {
  const { ref, isVisible } = useScrollAnimation<HTMLDivElement>();

  return (
    <section className="py-8 md:py-16 bg-surface-subtle">
      <div className="container mx-auto">
        <div
          ref={ref}
          className={`transition-all duration-700 ${
            isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'
          }`}
        >
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-5xl font-bold text-foreground mb-4">
              What Our Clients Say
            </h2>
            <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
              Hear directly from founders and executives who've transformed their authority through strategic podcast placements.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            {videoTestimonials.map((testimonial, index) => (
              <div
                key={index}
                className="group bg-background rounded-xl border border-border overflow-hidden hover:border-primary/50 transition-all duration-300 hover:shadow-lg"
                style={{ transitionDelay: `${index * 100}ms` }}
              >
                {/* Video Embed */}
                <div className="relative aspect-video bg-muted">
                  <iframe
                    src={testimonial.videoUrl}
                    title={`${testimonial.name} testimonial`}
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                    allowFullScreen
                    className="absolute inset-0 w-full h-full"
                  />
                </div>

                {/* Testimonial Info */}
                <div className="p-6">
                  <blockquote className="text-foreground mb-4 italic">
                    "{testimonial.quote}"
                  </blockquote>
                  <div>
                    <p className="font-semibold text-foreground">{testimonial.name}</p>
                    <p className="text-sm text-muted-foreground">
                      {testimonial.title}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      {testimonial.company}
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
};

export default SocialProofSection;
