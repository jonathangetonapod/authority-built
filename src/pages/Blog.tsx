import { useState } from 'react';
import Navbar from '@/components/Navbar';
import Footer from '@/components/Footer';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useScrollAnimation } from '@/hooks/useScrollAnimation';
import { Calendar, Clock, Tag, ArrowRight, Filter } from 'lucide-react';
import { blogPosts, categories } from '@/data/blogPosts';
import { SocialProofNotifications } from '@/components/SocialProofNotifications';

const Blog = () => {
  const { ref, isVisible } = useScrollAnimation<HTMLDivElement>();
  const [selectedCategory, setSelectedCategory] = useState('All');

  const filteredPosts = selectedCategory === 'All'
    ? blogPosts
    : blogPosts.filter(post => post.category === selectedCategory);

  return (
    <main className="min-h-screen bg-background">
      <Navbar />

      {/* Hero Section */}
      <section className="pt-28 pb-16 md:pt-36 md:pb-24 bg-gradient-to-b from-primary/5 to-background px-4">
        <div className="container mx-auto">
          <div className="max-w-3xl mx-auto text-center">
            <Badge className="mb-4">The Authority Lab Blog</Badge>
            <h1 className="text-3xl sm:text-4xl md:text-6xl font-bold text-foreground mb-6 leading-tight px-2">
              Podcast Marketing Insights
            </h1>
            <p className="text-base sm:text-lg md:text-xl text-muted-foreground leading-relaxed px-4">
              Expert strategies, data-driven insights, and proven tactics to dominate podcast guesting and build your authority.
            </p>
          </div>
        </div>
      </section>

      {/* Category Filter */}
      <section className="pb-8 px-4">
        <div className="container mx-auto">
          <div className="flex items-center gap-2 sm:gap-3 overflow-x-auto pb-4 scrollbar-hide">
            <Filter className="h-5 w-5 text-muted-foreground flex-shrink-0" />
            {categories.map((category) => (
              <Button
                key={category}
                variant={selectedCategory === category ? 'default' : 'outline'}
                size="sm"
                onClick={() => setSelectedCategory(category)}
                className="whitespace-nowrap min-h-[40px]"
              >
                {category}
              </Button>
            ))}
          </div>
        </div>
      </section>

      {/* Blog Posts Grid */}
      <section className="pb-20 md:pb-32 px-4">
        <div className="container mx-auto">
          <div
            ref={ref}
            className={`transition-all duration-700 ${
              isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'
            }`}
          >
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
              {filteredPosts.map((post, index) => (
                <article
                  key={post.id}
                  className="bg-surface-subtle rounded-2xl border-2 border-border hover:border-primary/50 transition-all duration-300 hover:shadow-2xl overflow-hidden group"
                  style={{ transitionDelay: `${index * 100}ms` }}
                >
                  {/* Featured Image */}
                  <div className="relative h-48 bg-gradient-to-br from-primary/20 to-primary/5 overflow-hidden">
                    <img
                      src={post.imageUrl}
                      alt={post.title}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-surface-subtle via-transparent to-transparent" />

                    {/* Category Badge */}
                    <Badge className="absolute top-4 left-4 bg-background/90 backdrop-blur-sm">
                      {post.category}
                    </Badge>
                  </div>

                  <div className="p-6">
                    {/* Meta Info */}
                    <div className="flex items-center gap-4 mb-3 text-xs text-muted-foreground">
                      <div className="flex items-center gap-1">
                        <Calendar className="h-3 w-3" />
                        {new Date(post.publishedAt).toLocaleDateString('en-US', {
                          month: 'short',
                          day: 'numeric',
                          year: 'numeric'
                        })}
                      </div>
                      <div className="flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        {post.readTime}
                      </div>
                    </div>

                    {/* Title */}
                    <h2 className="text-xl font-bold text-foreground mb-3 line-clamp-2 group-hover:text-primary transition-colors">
                      {post.title}
                    </h2>

                    {/* Excerpt */}
                    <p className="text-sm text-muted-foreground mb-4 line-clamp-3">
                      {post.excerpt}
                    </p>

                    {/* Tags */}
                    <div className="flex flex-wrap gap-2 mb-4">
                      {post.tags.slice(0, 2).map((tag, idx) => (
                        <span
                          key={idx}
                          className="inline-flex items-center gap-1 px-2 py-1 bg-primary/10 text-primary rounded text-xs"
                        >
                          <Tag className="h-3 w-3" />
                          {tag}
                        </span>
                      ))}
                    </div>

                    {/* Read More */}
                    <Button
                      variant="ghost"
                      size="sm"
                      className="w-full group/btn"
                      asChild
                    >
                      <a href={`/blog/${post.slug}`}>
                        Read Article
                        <ArrowRight className="ml-2 h-4 w-4 group-hover/btn:translate-x-1 transition-transform" />
                      </a>
                    </Button>
                  </div>
                </article>
              ))}
            </div>

            {/* No Results */}
            {filteredPosts.length === 0 && (
              <div className="text-center py-20">
                <p className="text-xl text-muted-foreground">
                  No articles found in this category yet. Check back soon!
                </p>
              </div>
            )}
          </div>
        </div>
      </section>

      {/* Newsletter CTA */}
      <section className="py-10 md:py-20 bg-gradient-to-r from-primary/10 via-purple-500/10 to-primary/10 px-4">
        <div className="container mx-auto">
          <div className="max-w-2xl mx-auto text-center">
            <h2 className="text-2xl sm:text-3xl md:text-4xl font-bold text-foreground mb-4 px-4">
              Get Podcast Marketing Insights Weekly
            </h2>
            <p className="text-base sm:text-lg text-muted-foreground mb-8 px-4">
              Join 2,500+ founders and executives receiving our best strategies for podcast guesting.
            </p>
            <div className="flex flex-col sm:flex-row gap-3 max-w-md mx-auto px-4">
              <input
                type="email"
                placeholder="Enter your email"
                className="flex h-12 sm:h-14 w-full rounded-lg border border-border bg-background px-4 py-2 text-base focus:outline-none focus:ring-2 focus:ring-primary"
              />
              <Button size="lg" className="w-full sm:w-auto min-h-[48px] sm:min-h-[56px] whitespace-nowrap">
                Subscribe
              </Button>
            </div>
          </div>
        </div>
      </section>

      <Footer />
      <SocialProofNotifications />
    </main>
  );
};

export default Blog;
