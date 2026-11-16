import React, { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, Images, ArrowRight, Package, Search } from 'lucide-react';
import { BoxItem, BoxPhoto } from '../lib/boxService';

interface BoxLibraryModalProps {
  isOpen: boolean;
  onClose: () => void;
  photos: BoxPhoto[];
  boxes: BoxItem[];
  onSelectBox: (boxId: string) => void;
  currentBoxId?: string;
}

export const BoxLibraryModal: React.FC<BoxLibraryModalProps> = ({
  isOpen,
  onClose,
  photos,
  boxes,
  onSelectBox,
  currentBoxId
}) => {
  const [selectedBoxFilter, setSelectedBoxFilter] = useState<string>('all');
  const [selectedPhoto, setSelectedPhoto] = useState<BoxPhoto | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  const availableBoxIds = useMemo(() => {
    const ids = new Set<string>();
    boxes.forEach((b) => ids.add(b.id));
    photos.forEach((p) => ids.add(p.boxId));
    return Array.from(ids).sort();
  }, [boxes, photos]);

  const filteredPhotos = useMemo(() => {
    return photos.filter((p) => {
      const matchBox = selectedBoxFilter === 'all' || p.boxId.toLowerCase() === selectedBoxFilter.toLowerCase();
      const matchSearch = !searchQuery.trim() || 
        p.boxId.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (p.caption && p.caption.toLowerCase().includes(searchQuery.toLowerCase())) ||
        (p.updatedBy && p.updatedBy.toLowerCase().includes(searchQuery.toLowerCase()));
      return matchBox && matchSearch;
    });
  }, [photos, selectedBoxFilter, searchQuery]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex flex-col justify-end sm:justify-center p-0 sm:p-4">
      <motion.div
        initial={{ y: '100%', opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: '100%', opacity: 0 }}
        className="bg-white w-full sm:max-w-xl h-[88vh] rounded-t-[2.5rem] sm:rounded-[2.5rem] shadow-apple-lg border-0 flex flex-col overflow-hidden shadow-2xl"
      >
        <div className="px-5 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Images size={18} className="text-slate-700" />
            <h3 className="font-bold text-slate-800 text-sm">Thư viện</h3>
            <span className="px-2.5 py-1 rounded-full bg-slate-100 text-slate-700 font-semibold text-xs border-0 shadow-apple-soft">
              {filteredPhotos.length}
            </span>
          </div>
          <button 
            onClick={onClose}
            className="w-7 h-7 rounded-full bg-slate-100 text-slate-500 flex items-center justify-center cursor-pointer"
          >
            <X size={16} />
          </button>
        </div>

        <div className="px-4 py-3 bg-white/90 space-y-2">
          <div className="relative">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Tìm kiếm..."
              className="w-full pl-8 pr-3 py-1.5 bg-slate-100 rounded-xl text-xs font-medium text-slate-800 focus:outline-none"
            />
            <Search size={14} className="absolute left-2.5 top-2 text-slate-400" />
          </div>

          <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar text-xs">
            <button
              onClick={() => setSelectedBoxFilter('all')}
              className={`px-3 py-1 rounded-xl font-medium whitespace-nowrap cursor-pointer transition-all ${
                selectedBoxFilter === 'all'
                  ? 'bg-slate-900 text-white'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              Tất cả ({photos.length})
            </button>
            {availableBoxIds.map((bId) => {
              const count = photos.filter((p) => p.boxId.toLowerCase() === bId.toLowerCase()).length;
              return (
                <button
                  key={bId}
                  onClick={() => setSelectedBoxFilter(bId)}
                  className={`px-3 py-1 rounded-xl font-medium whitespace-nowrap cursor-pointer uppercase font-mono transition-all ${
                    selectedBoxFilter.toLowerCase() === bId.toLowerCase()
                      ? 'bg-slate-900 text-white'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  {bId} ({count})
                </button>
              );
            })}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-3">
          {filteredPhotos.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-center p-6 text-slate-400">
              <Package size={36} strokeWidth={1.5} className="text-slate-300 mb-1" />
              <div className="text-xs font-bold text-slate-500">Chưa có ảnh</div>
            </div>
          ) : (
            <div className="grid grid-cols-3 gap-2">
              {filteredPhotos.map((photo) => (
                <div
                  key={photo.id}
                  onClick={() => setSelectedPhoto(photo)}
                  className="group relative aspect-[3/4] rounded-xl overflow-hidden bg-slate-100 cursor-pointer shadow-xs active:scale-95 transition-all"
                >
                  <img
                    src={photo.imageUrl}
                    alt=""
                    className="w-full h-full object-cover"
                    loading="lazy"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent pointer-events-none" />
                  
                  <div className="absolute top-1 left-1 bg-black/50 px-1.5 py-0.5 rounded text-[0.6rem] font-bold text-white uppercase font-mono">
                    {photo.boxId}
                  </div>

                  {photo.caption && (
                    <div className="absolute bottom-1 left-1 right-1 text-white text-[0.62rem] font-bold truncate">
                      {photo.caption}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </motion.div>

      <AnimatePresence>
        {selectedPhoto && (
          <div className="fixed inset-0 z-60 bg-black/95 flex flex-col items-center justify-between p-4">
            <div className="w-full max-w-sm flex items-center justify-between text-white py-2">
              <span className="px-2 py-0.5 rounded-lg bg-white/20 font-mono font-bold text-xs uppercase">
                {selectedPhoto.boxId}
              </span>
              <button
                onClick={() => setSelectedPhoto(null)}
                className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center text-white cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>

            <div className="w-full max-w-sm flex-1 flex items-center justify-center p-2 overflow-hidden">
              <img
                src={selectedPhoto.imageUrl}
                alt=""
                className="max-h-[65vh] w-auto max-w-full rounded-xl object-contain"
              />
            </div>

            <div className="w-full max-w-sm bg-white/10 backdrop-blur-xl rounded-2xl p-3 text-white space-y-2">
              <div className="text-xs font-semibold text-slate-100">
                {selectedPhoto.caption || 'Không có ghi chú'}
              </div>

              <div className="flex items-center justify-between pt-2 text-xs">
                <span className="text-slate-300 text-[0.68rem]">{selectedPhoto.updatedBy || ''}</span>

                <button
                  onClick={() => {
                    onSelectBox(selectedPhoto.boxId);
                    setSelectedPhoto(null);
                    onClose();
                  }}
                  className="px-3 py-1.5 bg-[#0071e3] hover:bg-[#0077ed] font-semibold rounded-xl text-xs flex items-center gap-1 active:scale-95 cursor-pointer"
                >
                  <span>Mở {selectedPhoto.boxId.toUpperCase()}</span>
                  <ArrowRight size={13} />
                </button>
              </div>
            </div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};
