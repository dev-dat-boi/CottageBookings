import { useState, useRef } from "react";
import { useGetCottageInfo, useUpdateCottageInfo, getGetCottageInfoQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, Pencil, Save, X, Upload, Trash2, Trees } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

export function HomeTab() {
  const { isAdmin } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { data: info, isLoading } = useGetCottageInfo({ query: { queryKey: getGetCottageInfoQueryKey() } });
  const updateMutation = useUpdateCottageInfo();
  const fileRef = useRef<HTMLInputElement>(null);

  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState("");
  const [desc, setDesc] = useState("");
  const [photos, setPhotos] = useState<string[]>([]);

  function startEdit() {
    setTitle(info?.title ?? "");
    setDesc(info?.description ?? "");
    setPhotos(info?.photos ?? []);
    setEditing(true);
  }

  function handleSave() {
    updateMutation.mutate(
      { data: { title, description: desc, photos } },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getGetCottageInfoQueryKey() });
          setEditing(false);
          toast({ title: "Cottage info updated" });
        },
        onError: () => toast({ title: "Error", description: "Failed to save", variant: "destructive" }),
      }
    );
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    files.forEach(file => {
      const reader = new FileReader();
      reader.onload = ev => {
        const result = ev.target?.result as string;
        if (result) setPhotos(prev => [...prev, result]);
      };
      reader.readAsDataURL(file);
    });
    if (fileRef.current) fileRef.current.value = "";
  }

  if (isLoading) {
    return <div className="flex justify-center p-12"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>;
  }

  const currentPhotos = info?.photos ?? [];
  const currentTitle = info?.title || "Our Cottage";
  const currentDesc = info?.description || "";

  if (editing) {
    return (
      <div className="space-y-6 max-w-3xl mx-auto">
        <Card className="border-border/40 shadow-sm">
          <CardHeader className="bg-muted/30 border-b border-border/40">
            <div className="flex items-center justify-between">
              <CardTitle>Edit Cottage Info</CardTitle>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={() => setEditing(false)}><X className="w-3.5 h-3.5 mr-1" /> Cancel</Button>
                <Button size="sm" onClick={handleSave} disabled={updateMutation.isPending}>
                  {updateMutation.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1" /> : <Save className="w-3.5 h-3.5 mr-1" />} Save
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent className="p-4 sm:p-6 space-y-4">
            <div>
              <label className="text-sm font-medium">Title</label>
              <Input value={title} onChange={e => setTitle(e.target.value)} className="mt-1" placeholder="Our Cottage" />
            </div>
            <div>
              <label className="text-sm font-medium">Description</label>
              <Textarea value={desc} onChange={e => setDesc(e.target.value)} rows={6} className="mt-1"
                placeholder="Describe your cottage — location, amenities, what makes it special..." />
            </div>
            <div>
              <label className="text-sm font-medium">Photos</label>
              <div className="mt-2 grid grid-cols-2 sm:grid-cols-3 gap-3">
                {photos.map((src, i) => (
                  <div key={i} className="relative group aspect-video rounded-lg overflow-hidden border border-border/40 bg-muted/20">
                    <img src={src} alt={`Photo ${i + 1}`} className="w-full h-full object-cover" />
                    <button
                      type="button"
                      onClick={() => setPhotos(prev => prev.filter((_, j) => j !== i))}
                      className="absolute top-1 right-1 bg-red-500 text-white rounded-full w-6 h-6 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>
                ))}
                <button
                  type="button"
                  onClick={() => fileRef.current?.click()}
                  className="aspect-video rounded-lg border-2 border-dashed border-border/40 hover:border-primary/40 flex flex-col items-center justify-center gap-1 text-muted-foreground hover:text-primary transition-colors"
                >
                  <Upload className="w-5 h-5" />
                  <span className="text-xs">Add Photo</span>
                </button>
              </div>
              <input ref={fileRef} type="file" accept="image/*" multiple className="hidden" onChange={handleFileChange} />
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-3xl mx-auto">
      <Card className="border-border/40 shadow-sm overflow-hidden">
        <CardHeader className="bg-muted/30 border-b border-border/40">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                <Trees className="w-5 h-5 text-primary" />
              </div>
              <div>
                <CardTitle className="text-xl">{currentTitle}</CardTitle>
                <CardDescription>Welcome to our cottage rental</CardDescription>
              </div>
            </div>
            {isAdmin && (
              <Button variant="outline" size="sm" onClick={startEdit}>
                <Pencil className="w-3.5 h-3.5 mr-1" /> Edit
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent className="p-4 sm:p-6 space-y-6">
          {currentDesc ? (
            <p className="text-foreground leading-relaxed whitespace-pre-wrap">{currentDesc}</p>
          ) : (
            isAdmin ? (
              <div className="border-2 border-dashed border-border/40 rounded-xl p-8 text-center text-muted-foreground">
                <Trees className="w-8 h-8 mx-auto mb-2 opacity-30" />
                <p className="text-sm">No description yet. Click Edit to add one.</p>
              </div>
            ) : (
              <p className="text-muted-foreground italic">No description provided.</p>
            )
          )}

          {currentPhotos.length > 0 && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {currentPhotos.map((src, i) => (
                <div key={i} className="aspect-video rounded-xl overflow-hidden border border-border/40 shadow-sm bg-muted/20">
                  <img src={src} alt={`Cottage photo ${i + 1}`} className="w-full h-full object-cover" />
                </div>
              ))}
            </div>
          )}

          {currentPhotos.length === 0 && !currentDesc && !isAdmin && (
            <div className="py-8 text-center text-muted-foreground">
              <Trees className="w-10 h-10 mx-auto mb-3 opacity-20" />
              <p className="text-sm">Cottage information coming soon.</p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
