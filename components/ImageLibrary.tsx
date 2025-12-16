import React, { useState, useEffect } from "react";
import { Search, Loader2, X } from "lucide-react";

interface PexelsImage {
  id: number;
  src: { medium: string; large: string };
  photographer: string;
  alt: string;
}

export const ImageLibrary: React.FC<{
  onSelect: (url: string) => void;
  onClose: () => void;
}> = ({ onSelect, onClose }) => {
  const [query, setQuery] = useState("");
  const [images, setImages] = useState<PexelsImage[]>([]);
  const [loading, setLoading] = useState(false);

  const searchImages = async (searchTerm: string = "business") => {
    setLoading(true);
    try {
      const res = await fetch(
        `https://api.pexels.com/v1/search?query=${searchTerm}&per_page=40`,
        {
          headers: {
            Authorization: process.env.PEXELS_API_KEY,
          },
        }
      );
      const data = await res.json();
      setImages(data.photos || []);
    } catch (err) {
      console.error("Pexels error", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    searchImages(); // Initial Load
  }, []);

  return (
    <div className="flex flex-col h-full bg-white border-l border-slate-200 w-80 shadow-xl animate-in slide-in-from-right">
      <div className="p-4 border-b flex justify-between items-center">
        <h3 className="font-bold text-sm uppercase tracking-wider text-slate-500">
          Stock Photos
        </h3>
        <button
          onClick={onClose}
          className="p-1 hover:bg-slate-100 rounded-full"
        >
          <X size={18} />
        </button>
      </div>

      <div className="p-3">
        <div className="relative">
          <Search
            className="absolute left-3 top-2.5 text-slate-400"
            size={16}
          />
          <input
            className="w-full bg-slate-100 border-none rounded-lg py-2 pl-9 pr-4 text-sm focus:ring-2 focus:ring-indigo-500"
            placeholder="Search Pexels..."
            onKeyDown={(e) => e.key === "Enter" && searchImages(query)}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-3 grid grid-cols-2 gap-2">
        {loading ? (
          <div className="col-span-2 flex justify-center py-10">
            <Loader2 className="animate-spin text-indigo-600" />
          </div>
        ) : (
          images.map((img) => (
            <img
              key={img.id}
              src={img.src.medium}
              alt={img.alt}
              className="rounded cursor-pointer hover:opacity-80 transition aspect-square object-cover"
              onClick={() => onSelect(img.src.large)}
            />
          ))
        )}
      </div>
      <div className="p-2 text-[10px] text-center text-slate-400 border-t">
        Photos provided by{" "}
        <a href="https://www.pexels.com" target="_blank" className="underline">
          Pexels
        </a>
      </div>
    </div>
  );
};
