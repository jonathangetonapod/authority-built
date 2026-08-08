import { useEffect, useState } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { BlogSEO } from '@/components/blog/BlogSEO'
import { BlogCard } from '@/components/blog/BlogCard'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { useToast } from '@/hooks/use-toast'
import {
  getPostBySlug,
  getRelatedPosts,
  incrementViewCount,
  type BlogPost as BlogPostType,
} from '@/services/blog'
import { Calendar, Clock, ArrowLeft, Share2, Loader2 } from 'lucide-react'
import Navbar from '@/components/Navbar'
import Footer from '@/components/Footer'
import DOMPurify from 'dompurify'

export default function BlogPost() {
  const { slug } = useParams<{ slug: string }>()
  const navigate = useNavigate()
  const { toast } = useToast()

  const [post, setPost] = useState<BlogPostType | null>(null)
  const [relatedPosts, setRelatedPosts] = useState<BlogPostType[]>([])
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    if (slug) {
      loadPost(slug)
    }
  }, [slug])

  const loadPost = async (postSlug: string) => {
    setIsLoading(true)
    try {
      const postData = await getPostBySlug(postSlug)
      setPost(postData)

      // Increment view count
      await incrementViewCount(postData.id)

      // Load related posts
      const related = await getRelatedPosts(postData, 3)
      setRelatedPosts(related)
    } catch (error) {
      console.error('Failed to load post:', error)
      toast({
        title: 'Post not found',
        description: 'The blog post you are looking for does not exist.',
        variant: 'destructive',
      })
      navigate('/blog')
    } finally {
      setIsLoading(false)
    }
  }

  const handleShare = async () => {
    if (navigator.share && post) {
      try {
        await navigator.share({
          title: post.title,
          text: post.meta_description,
          url: window.location.href,
        })
      } catch (error) {
        // User cancelled or share failed
      }
    } else {
      // Fallback: Copy to clipboard
      navigator.clipboard.writeText(window.location.href)
      toast({
        title: 'Link copied',
        description: 'Post URL copied to clipboard',
      })
    }
  }

  if (isLoading) {
    return (
      <>
        <Navbar />
        <div className="flex items-center justify-center min-h-screen">
          <Loader2 className="w-8 h-8 animate-spin" />
        </div>
        <Footer />
      </>
    )
  }

  if (!post) {
    return null
  }

  const formattedDate = new Date(post.published_at || post.created_at).toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  })

  return (
    <>
      <Navbar />
      <BlogSEO post={post} />

      <article className="min-h-screen">
        {/* Hero Section */}
        <div className="bg-gradient-to-b from-gray-50 to-white py-12">
          <div className="container mx-auto px-4 max-w-4xl">
            {/* Back Button */}
            <Button
              variant="ghost"
              size="sm"
              onClick={() => navigate('/blog')}
              className="mb-6"
            >
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back to Blog
            </Button>

            {/* Category */}
            {post.blog_categories && (
              <div className="mb-4">
                <Badge variant="secondary" className="text-sm">
                  {post.blog_categories.name}
                </Badge>
              </div>
            )}

            {/* Title */}
            <h1 className="text-4xl md:text-5xl font-bold mb-6 leading-tight">
              {post.title}
            </h1>

            {/* Meta Info */}
            <div className="flex flex-wrap items-center gap-6 text-muted-foreground mb-8">
              <div className="flex items-center gap-2">
                <img
                  src={`https://ui-avatars.com/api/?name=${encodeURIComponent(post.author_name)}&background=3b82f6&color=fff`}
                  alt={post.author_name}
                  className="w-10 h-10 rounded-full"
                />
                <span className="font-medium">{post.author_name}</span>
              </div>

              <div className="flex items-center gap-2">
                <Calendar className="w-4 h-4" />
                <span>{formattedDate}</span>
              </div>

              <div className="flex items-center gap-2">
                <Clock className="w-4 h-4" />
                <span>{post.read_time_minutes} min read</span>
              </div>

              <Button variant="ghost" size="sm" onClick={handleShare}>
                <Share2 className="w-4 h-4 mr-2" />
                Share
              </Button>
            </div>

            {/* Featured Image */}
            {post.featured_image_url && (
              <div className="rounded-lg overflow-hidden shadow-lg">
                <img
                  src={post.featured_image_url}
                  alt={post.featured_image_alt || post.title}
                  className="w-full h-auto"
                />
              </div>
            )}
          </div>
        </div>

        {/* Content Section */}
        <div className="container mx-auto px-4 py-12">
          <div className="max-w-4xl mx-auto">
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-12">
              {/* Main Content */}
              <div className="lg:col-span-2">
                <div
                  className="prose prose-lg max-w-none prose-headings:font-bold prose-h2:text-3xl prose-h2:mt-12 prose-h2:mb-4 prose-h3:text-2xl prose-h3:mt-8 prose-h3:mb-3 prose-p:text-gray-700 prose-p:leading-relaxed prose-a:text-blue-600 prose-a:no-underline hover:prose-a:underline prose-strong:text-gray-900 prose-ul:my-6 prose-ol:my-6 prose-li:my-2"
                  dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(post.content) }}
                />

                {/* Tags */}
                {post.tags && post.tags.length > 0 && (
                  <div className="mt-12 pt-8 border-t">
                    <h3 className="text-sm font-semibold text-gray-900 mb-3">Tagged with:</h3>
                    <div className="flex flex-wrap gap-2">
                      {post.tags.map((tag) => (
                        <Badge key={tag} variant="outline">
                          {tag}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}

                {/* CTA Section */}
                <div className="mt-12 bg-gradient-to-r from-blue-600 to-purple-600 rounded-lg p-8 text-white">
                  <h2 className="text-2xl md:text-3xl font-bold mb-4">
                    Ready to Get Booked on Top Podcasts?
                  </h2>
                  <p className="text-lg mb-6 text-blue-50">
                    We handle the entire process - from research to booking. Get featured on premium podcasts in your industry.
                  </p>
                  <Button
                    size="lg"
                    variant="secondary"
                    className="bg-white text-blue-600 hover:bg-gray-100"
                    asChild
                  >
                    <a href="https://calendly.com/getonapodjg/30min" target="_blank" rel="noopener noreferrer">
                      Book a Shortlist Call →
                    </a>
                  </Button>
                </div>
              </div>

              {/* Sidebar */}
              <div className="lg:col-span-1">
                <div className="sticky top-8 space-y-8">
                  {/* Author Card */}
                  <div className="bg-gray-50 rounded-lg p-6">
                    <h3 className="font-bold text-lg mb-3">About the Author</h3>
                    <div className="flex items-center gap-3 mb-3">
                      <img
                        src={`https://ui-avatars.com/api/?name=${encodeURIComponent(post.author_name)}&background=3b82f6&color=fff&size=48`}
                        alt={post.author_name}
                        className="w-12 h-12 rounded-full"
                      />
                      <div>
                        <p className="font-semibold">{post.author_name}</p>
                        <p className="text-sm text-muted-foreground">Get On A Pod</p>
                      </div>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      Helping entrepreneurs and thought leaders get booked on top podcasts to build authority and grow their businesses.
                    </p>
                  </div>

                  {/* Quick Links */}
                  <div className="bg-gray-50 rounded-lg p-6">
                    <h3 className="font-bold text-lg mb-4">Quick Links</h3>
                    <div className="space-y-3">
                      <Link
                        to="/what-to-expect"
                        className="block text-sm text-blue-600 hover:underline"
                      >
                        → What to Expect
                      </Link>
                      <Link
                        to="/resources"
                        className="block text-sm text-blue-600 hover:underline"
                      >
                        → Free Resources
                      </Link>
                      <Link
                        to="/blog"
                        className="block text-sm text-blue-600 hover:underline"
                      >
                        → All Blog Posts
                      </Link>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Related Posts */}
        {relatedPosts.length > 0 && (
          <div className="bg-gray-50 py-16">
            <div className="container mx-auto px-4">
              <div className="max-w-6xl mx-auto">
                <h2 className="text-3xl font-bold mb-8">Related Articles</h2>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  {relatedPosts.map((relatedPost) => (
                    <BlogCard key={relatedPost.id} post={relatedPost} />
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}
      </article>

      <Footer />
    </>
  )
}
