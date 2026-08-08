import { useState, useEffect } from 'react';
import Navbar from '@/components/Navbar';
import Footer from '@/components/Footer';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useScrollAnimation } from '@/hooks/useScrollAnimation';
import { Filter, Search, Loader2 } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { SocialProofNotifications } from '@/components/SocialProofNotifications';
import { BlogCard } from '@/components/blog/BlogCard';
import { getAllPosts, getAllCategories, type BlogPost, type BlogCategory } from '@/services/blog';
import { useToast } from '@/hooks/use-toast';
import PageSEO from '@/components/seo/PageSEO';

const Blog = () => {
  const { ref, isVisible } = useScrollAnimation<HTMLDivElement>();
  const { toast } = useToast();

  const [posts, setPosts] = useState<BlogPost[]>([]);
  const [categories, setCategories] = useState<BlogCategory[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');

  // Load data on mount and when filters change
  useEffect(() => {
    loadData();
  }, [selectedCategory, searchQuery]);

  const loadData = async () => {
    setIsLoading(true);
    try {
      const [postsData, categoriesData] = await Promise.all([
        getAllPosts({
          status: 'published',
          category: selectedCategory === 'all' ? undefined : selectedCategory,
          search: searchQuery || undefined,
        }),
        getAllCategories(),
      ]);
      setPosts(postsData);
      setCategories(categoriesData);
    } catch (error) {
      console.error('Failed to load blog posts:', error);
      toast({
        title: 'Error',
        description: 'Failed to load blog posts',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <main className="min-h-screen bg-background">
      <PageSEO
        title="Blog — Podcast Booking Tips & Strategy | Get On A Pod"
        description="Expert guides on podcast guesting, pitching, interview prep, and building authority through strategic podcast appearances."
        path="/blog"
      />
      <Navbar />

      {/* Hero Section */}
      <section className="pt-28 pb-16 md:pt-36 md:pb-24 bg-gradient-to-b from-primary/5 to-background px-4">
        <div className="container mx-auto">
          <div className="max-w-3xl mx-auto text-center">
            <Badge className="mb-4">The Get On A Pod Blog</Badge>
            <h1 className="text-3xl sm:text-4xl md:text-6xl font-bold text-foreground mb-6 leading-tight px-2">
              Podcast Marketing Insights
            </h1>
            <p className="text-base sm:text-lg md:text-xl text-muted-foreground leading-relaxed px-4">
              Expert strategies, data-driven insights, and practical tactics for podcast guesting and building your authority.
            </p>
          </div>
        </div>
      </section>

      {/* Search & Filter */}
      <section className="pb-8 px-4">
        <div className="container mx-auto">
          <div className="space-y-4">
            {/* Search Bar */}
            <div className="max-w-md">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  type="text"
                  placeholder="Search articles..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10"
                />
              </div>
            </div>

            {/* Category Filter */}
            <div className="flex items-center gap-2 sm:gap-3 overflow-x-auto pb-4 scrollbar-hide">
              <Filter className="h-5 w-5 text-muted-foreground flex-shrink-0" />
              <Button
                variant={selectedCategory === 'all' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setSelectedCategory('all')}
                className="whitespace-nowrap min-h-[40px]"
              >
                All
              </Button>
              {categories.map((category) => (
                <Button
                  key={category.id}
                  variant={selectedCategory === category.id ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setSelectedCategory(category.id)}
                  className="whitespace-nowrap min-h-[40px]"
                >
                  {category.name}
                </Button>
              ))}
            </div>
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
            {/* Loading State */}
            {isLoading ? (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
                {Array.from({ length: 6 }).map((_, i) => (
                  <div
                    key={i}
                    className="rounded-lg border bg-card overflow-hidden"
                  >
                    {/* Image placeholder */}
                    <Skeleton className="aspect-video w-full rounded-none" />

                    {/* CardHeader area */}
                    <div className="p-6 space-y-3">
                      {/* Category badge */}
                      <Skeleton className="h-5 w-20 rounded-full" />
                      {/* Title */}
                      <Skeleton className="h-6 w-full" />
                      <Skeleton className="h-6 w-4/5" />
                    </div>

                    {/* CardContent - excerpt */}
                    <div className="px-6 pb-4 space-y-2">
                      <Skeleton className="h-4 w-full" />
                      <Skeleton className="h-4 w-full" />
                      <Skeleton className="h-4 w-3/5" />
                    </div>

                    {/* CardFooter - date & read time */}
                    <div className="px-6 pb-6 flex items-center gap-4">
                      <div className="flex items-center gap-1">
                        <Skeleton className="h-4 w-4 rounded-full" />
                        <Skeleton className="h-4 w-20" />
                      </div>
                      <div className="flex items-center gap-1">
                        <Skeleton className="h-4 w-4 rounded-full" />
                        <Skeleton className="h-4 w-16" />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : posts.length === 0 ? (
              /* No Results */
              <div className="text-center py-20">
                <p className="text-xl text-muted-foreground">
                  {searchQuery || selectedCategory !== 'all'
                    ? 'No articles found. Try adjusting your filters.'
                    : 'No articles published yet. Check back soon.'}
                </p>
              </div>
            ) : (
              /* Blog Posts Grid */
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
                {posts.map((post, index) => (
                  <div
                    key={post.id}
                    style={{ transitionDelay: `${index * 100}ms` }}
                    className="transition-all duration-300"
                  >
                    <BlogCard post={post} />
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </section>

      <Footer />
      <SocialProofNotifications />
    </main>
  );
};

export default Blog;
