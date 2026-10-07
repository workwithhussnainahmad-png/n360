"use client";

import { useState, useEffect } from "react";
import dynamic from "next/dynamic";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toaster";
import { Loader2, Plus, Sparkles, Settings2, Eye, PenTool, Trash2, X } from "lucide-react";

const MDEditor = dynamic(() => import("@uiw/react-md-editor"), { ssr: false });
const MDPreview = dynamic(() => import("@uiw/react-md-editor").then(mod => mod.default.Markdown), { ssr: false });

export default function BlogClient({
  initialBlogs,
  initialPage = 1,
  initialTotalCount = 0,
  initialTotalPages = 1,
}: {
  initialBlogs?: any[];
  initialPage?: number;
  initialTotalCount?: number;
  initialTotalPages?: number;
}) {
  const seededFromServer = initialBlogs !== undefined;
  const [blogs, setBlogs] = useState<any[]>(initialBlogs ?? []);
  const [page, setPage] = useState(initialPage);
  const [totalPages, setTotalPages] = useState(initialTotalPages);
  const [totalCount, setTotalCount] = useState(initialTotalCount);

  const [title, setTitle] = useState("");
  const [slug, setSlug] = useState("");
  const [content, setContent] = useState("");
  const [excerpt, setExcerpt] = useState("");
  const [metaTitle, setMetaTitle] = useState("");
  const [metaDescription, setMetaDescription] = useState("");
  const [status, setStatus] = useState("PUBLISHED");
  const [publishedAt, setPublishedAt] = useState("");
  
  const [isLoading, setIsLoading] = useState(!seededFromServer);
  const [isSaving, setIsSaving] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const { toast } = useToast();

  useEffect(() => {
    if (seededFromServer && page === initialPage) return;
    fetchBlogs(page);
  }, [page]);

  const fetchBlogs = async (currentPage = 1) => {
    setIsLoading(true);
    try {
      const res = await fetch(`/api/admin/blogs?page=${currentPage}`);
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data)) {
          setBlogs(data);
          setTotalCount(data.length);
          setTotalPages(1);
        } else {
          setBlogs(data.blogs);
          setTotalCount(data.totalCount);
          setTotalPages(Math.ceil(data.totalCount / data.limit));
        }
      }
    } catch (error) {
      console.error("Failed to fetch blogs", error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSave = async () => {
    if (!title || !content) return;
    setIsSaving(true);
    
    // Auto-generate slug if empty
    let finalSlug = slug;
    if (!finalSlug) {
      finalSlug = title
        .toLowerCase()
        .trim()
        .replace(/[^\w\s-]/g, "")
        .replace(/[\s_-]+/g, "-")
        .replace(/^-+|-+$/g, "");
    }

    try {
      const url = editingId ? `/api/admin/blogs/${editingId}` : "/api/admin/blogs";
      const method = editingId ? "PUT" : "POST";
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          title, 
          slug: finalSlug, 
          content,
          excerpt,
          metaTitle,
          metaDescription,
          status,
          publishedAt: publishedAt || undefined
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to save");
      }

      toast({ title: "Success", description: `Blog ${editingId ? 'updated' : 'saved'} successfully.` });
      resetForm();
      await fetchBlogs();
    } catch (error: any) {
      toast({ title: "Error", description: error.message || "Failed to save blog.", variant: "destructive" });
    } finally {
      setIsSaving(false);
    }
  };

  const handleEdit = (blog: any) => {
    setEditingId(blog.id);
    setTitle(blog.title);
    setSlug(blog.slug);
    setContent(blog.content);
    setExcerpt(blog.excerpt || "");
    setMetaTitle(blog.metaTitle || "");
    setMetaDescription(blog.metaDescription || "");
    setStatus(blog.status);
    setPublishedAt(blog.publishedAt ? new Date(blog.publishedAt).toISOString().slice(0, 16) : "");
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleDelete = async (id: number) => {
    if (!confirm("Are you sure you want to delete this blog?")) return;
    try {
      const res = await fetch(`/api/admin/blogs/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed to delete");
      toast({ title: "Success", description: "Blog deleted successfully." });
      if (editingId === id) resetForm();
      await fetchBlogs();
    } catch (error) {
      toast({ title: "Error", description: "Failed to delete blog.", variant: "destructive" });
    }
  };

  const resetForm = () => {
    setEditingId(null);
    setTitle("");
    setSlug("");
    setContent("");
    setExcerpt("");
    setMetaTitle("");
    setMetaDescription("");
    setStatus("PUBLISHED");
    setPublishedAt("");
  };

  if (isLoading && blogs.length === 0) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="relative">
          <div className="absolute inset-0 rounded-full blur-xl bg-brand-500/20 animate-pulse"></div>
          <Loader2 className="w-10 h-10 animate-spin text-brand-600 relative z-10" />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-10 max-w-7xl mx-auto pb-12">
      {/* Creation Section */}
      <div className="grid lg:grid-cols-3 gap-8">
        {/* Main Content Column */}
        <div className="lg:col-span-2 space-y-6">
          <div className="relative group">
            <div className="absolute -inset-0.5 bg-gradient-to-r from-brand-500 to-indigo-500 rounded-2xl blur opacity-20 group-hover:opacity-40 transition duration-500"></div>
            <div className="relative bg-white p-4 sm:p-8 rounded-2xl shadow-sm border border-stone-100/50 backdrop-blur-sm">
              <div className="flex items-center justify-between gap-3 mb-6">
                <div className="flex items-center gap-3">
                  <div className="p-2.5 bg-brand-50 rounded-xl">
                    <PenTool className="w-5 h-5 text-brand-600" />
                  </div>
                  <h2 className="text-xl font-bold font-display text-stone-900 tracking-tight">
                    {editingId ? "Edit Content" : "Write Content"}
                  </h2>
                </div>
                {editingId && (
                  <Button variant="ghost" size="sm" onClick={resetForm} className="text-stone-500 hover:text-stone-700">
                    <X className="w-4 h-4 mr-1" /> Cancel Edit
                  </Button>
                )}
              </div>
              
              <div className="space-y-6">
                <div>
                  <label className="block text-sm font-medium text-stone-700 mb-2">Post Title *</label>
                  <input
                    type="text"
                    placeholder="Give your blog an engaging title..."
                    className="w-full bg-stone-50 border border-stone-200 focus:bg-white focus:border-brand-500 rounded-xl text-lg px-4 py-3 font-medium placeholder:font-normal transition-all duration-200 outline-none ring-0 focus:ring-4 focus:ring-brand-500/10"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-stone-700 mb-2">Content *</label>
                  <div className="rounded-xl overflow-hidden border border-stone-200 shadow-inner" data-color-mode="light">
                    <MDEditor
                      value={content}
                      onChange={(val) => setContent(val || "")}
                      height={450}
                      className="!border-none"
                      previewOptions={{ style: { padding: '1rem' } }}
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-stone-700 mb-2">Short Excerpt</label>
                  <textarea
                    placeholder="A brief summary for blog listings..."
                    className="w-full bg-stone-50 border border-stone-200 focus:bg-white focus:border-brand-500 rounded-xl text-sm px-4 py-3 transition-all outline-none focus:ring-4 focus:ring-brand-500/10 min-h-[100px]"
                    value={excerpt}
                    onChange={(e) => setExcerpt(e.target.value)}
                  />
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Sidebar Column */}
        <div className="lg:col-span-1 space-y-6">
          <div className="bg-white p-6 rounded-2xl shadow-sm border border-stone-100/50 space-y-6">
            <div className="flex items-center gap-2 mb-2 pb-4 border-b border-stone-100">
              <Settings2 className="w-5 h-5 text-stone-400" />
              <h3 className="font-bold text-stone-800">Publish Settings</h3>
            </div>

            <div>
              <label className="block text-sm font-medium text-stone-700 mb-2">Status</label>
              <select 
                className="w-full bg-stone-50 border border-stone-200 rounded-lg px-3 py-2 text-sm focus:border-brand-500 focus:ring-brand-500 outline-none"
                value={status}
                onChange={(e) => setStatus(e.target.value)}
              >
                <option value="PUBLISHED">Published</option>
                <option value="DRAFT">Draft</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-stone-700 mb-2">Custom Slug</label>
              <input
                type="text"
                placeholder="Auto-generated if empty"
                className="w-full bg-stone-50 border border-stone-200 rounded-lg text-sm px-3 py-2 outline-none focus:border-brand-500"
                value={slug}
                onChange={(e) => setSlug(e.target.value)}
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-stone-700 mb-2">Publish Date Override</label>
              <input
                type="datetime-local"
                className="w-full bg-stone-50 border border-stone-200 rounded-lg text-sm px-3 py-2 outline-none focus:border-brand-500"
                value={publishedAt}
                onChange={(e) => setPublishedAt(e.target.value)}
              />
            </div>
          </div>

          <div className="bg-white p-6 rounded-2xl shadow-sm border border-stone-100/50 space-y-6">
            <div className="flex items-center gap-2 mb-2 pb-4 border-b border-stone-100">
              <Eye className="w-5 h-5 text-stone-400" />
              <h3 className="font-bold text-stone-800">SEO Settings</h3>
            </div>

            <div>
              <label className="block text-sm font-medium text-stone-700 mb-2">Meta Title</label>
              <input
                type="text"
                placeholder="SEO Title"
                className="w-full bg-stone-50 border border-stone-200 rounded-lg text-sm px-3 py-2 outline-none focus:border-brand-500"
                value={metaTitle}
                onChange={(e) => setMetaTitle(e.target.value)}
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-stone-700 mb-2">Meta Description</label>
              <textarea
                placeholder="SEO Description"
                className="w-full bg-stone-50 border border-stone-200 rounded-lg text-sm px-3 py-2 outline-none focus:border-brand-500 min-h-[100px]"
                value={metaDescription}
                onChange={(e) => setMetaDescription(e.target.value)}
              />
            </div>
          </div>

          <Button 
            onClick={handleSave} 
            disabled={isSaving || !title || !content} 
            className="w-full bg-brand-600 hover:bg-brand-700 text-white rounded-xl py-6 h-auto font-medium shadow-lg shadow-brand-500/20 transition-all hover:shadow-brand-500/40 hover:-translate-y-0.5"
          >
            {isSaving ? <Loader2 className="w-5 h-5 mr-2 animate-spin" /> : <Sparkles className="w-5 h-5 mr-2" />}
            {editingId ? "Save Changes" : "Save & Publish"}
          </Button>
        </div>
      </div>

      {/* Published Section */}
      {blogs.length > 0 && (
        <div className="space-y-6 pt-12 border-t border-stone-200">
          <h2 className="text-2xl font-bold font-display tracking-tight text-stone-900 flex items-center gap-3">
            Manage Blogs
            <span className="text-sm font-medium px-3 py-1 bg-stone-100 text-stone-600 rounded-full">{blogs.length}</span>
          </h2>
          
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {blogs.map((b) => (
              <div key={b.id} className="group bg-white rounded-2xl shadow-sm hover:shadow-xl border border-stone-100 transition-all duration-300 overflow-hidden flex flex-col">
                <div className="p-6 border-b border-stone-100/50 bg-stone-50/50 flex-1">
                  <div className="flex justify-between items-start mb-3">
                    <span className={`text-xs font-bold px-2 py-1 rounded uppercase ${b.status === 'PUBLISHED' ? 'bg-green-100 text-green-700' : 'bg-stone-200 text-stone-600'}`}>
                      {b.status}
                    </span>
                    <time className="text-xs text-stone-400 font-medium">
                      {new Date(b.createdAt).toLocaleDateString()}
                    </time>
                  </div>
                  <h3 className="font-bold font-display tracking-tight text-xl text-stone-900 mb-2 group-hover:text-brand-600 transition-colors line-clamp-2">
                    {b.title}
                  </h3>
                  <p className="text-sm text-stone-500 line-clamp-3">
                    {b.excerpt || b.content.substring(0, 100).replace(/[#*`_>-]/g, "") + '...'}
                  </p>
                </div>
                
                <div className="px-6 py-4 bg-white flex justify-between items-center text-sm font-medium border-t border-stone-100">
                  <span className="text-stone-500">/{b.slug}</span>
                  <div className="flex gap-4">
                    <span onClick={() => handleEdit(b)} className="text-brand-600 hover:text-brand-700 hover:underline cursor-pointer flex items-center gap-1">
                      Edit
                    </span>
                    <span onClick={() => handleDelete(b.id)} className="text-red-500 hover:text-red-600 hover:underline cursor-pointer flex items-center gap-1">
                      <Trash2 className="w-4 h-4" /> Delete
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-4 mt-8">
              <Button
                variant="outline"
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
              >
                Previous
              </Button>
              <span className="text-sm font-medium text-stone-500">
                Page {page} of {totalPages}
              </span>
              <Button
                variant="outline"
                disabled={page >= totalPages}
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              >
                Next
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
