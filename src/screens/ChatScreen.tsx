import React, { useState, useEffect, useRef, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Header, InputGroup } from '../components/SharedUI';
import { ChatMessage, subscribeMessages, sendMessage, revokeMessage, togglePinMessage } from '../lib/chatService';
import { Send, ImagePlus, Trash2, Package, Search, X, Reply, Pin } from 'lucide-react';
import { Product } from '../lib/db';

interface ChatScreenProps {
  onBack: () => void;
  currentUser: { username: string; name: string; role: 'admin' | 'user' };
  products: Product[];
}

export const ChatScreen: React.FC<ChatScreenProps> = ({ onBack, currentUser, products }) => {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [isSending, setIsSending] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Product popup state
  const [replyingToMessage, setReplyingToMessage] = useState<ChatMessage | null>(null);
  const [activeMessageId, setActiveMessageId] = useState<string | null>(null);
  const [isProductPopupOpen, setIsProductPopupOpen] = useState(false);
  const [productSearch, setProductSearch] = useState('');

  useEffect(() => {
    const unsubscribe = subscribeMessages((msgs) => {
      setMessages(msgs);
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const getSenderName = () => {
    if (currentUser.username === 'conghao' && currentUser.role === 'admin') {
      return 'Thông báo hệ thống';
    }
    return currentUser.name;
  };

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMessage.trim() || isSending) return;

    setIsSending(true);
    try {
      const replyData = replyingToMessage ? {
        id: replyingToMessage.id || '',
        senderName: replyingToMessage.senderName,
        text: replyingToMessage.text,
        isImage: !!replyingToMessage.imageUrl,
        isProduct: !!replyingToMessage.productInfo
      } : undefined;
      await sendMessage(currentUser.username, getSenderName(), newMessage, undefined, undefined, replyData);
      setNewMessage('');
      setReplyingToMessage(null);
    } catch (error) {
      alert("Không thể gửi tin nhắn. Vui lòng thử lại!");
    } finally {
      setIsSending(false);
    }
  };

  const handleSendProduct = async (product: Product) => {
    setIsSending(true);
    try {
      const replyData = replyingToMessage ? {
        id: replyingToMessage.id || '',
        senderName: replyingToMessage.senderName,
        text: replyingToMessage.text,
        isImage: !!replyingToMessage.imageUrl,
        isProduct: !!replyingToMessage.productInfo
      } : undefined;
      await sendMessage(
        currentUser.username, 
        getSenderName(), 
        '', 
        undefined, 
        {
          name: product.name,
          barcode: product.barcode,
          internalCode: product.internalCode,
          price: product.price
        },
        replyData
      );
      setIsProductPopupOpen(false);
      setProductSearch('');
      setReplyingToMessage(null);
    } catch (error) {
      alert("Lỗi khi gửi thông tin sản phẩm.");
    } finally {
      setIsSending(false);
    }
  };

  const compressImage = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = (event) => {
        const img = new Image();
        img.src = event.target?.result as string;
        img.onload = () => {
          const canvas = document.createElement('canvas');
          const MAX_WIDTH = 800;
          const MAX_HEIGHT = 800;
          let width = img.width;
          let height = img.height;

          if (width > height) {
            if (width > MAX_WIDTH) {
              height *= MAX_WIDTH / width;
              width = MAX_WIDTH;
            }
          } else {
            if (height > MAX_HEIGHT) {
              width *= MAX_HEIGHT / height;
              height = MAX_HEIGHT;
            }
          }
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          if (ctx) {
             ctx.drawImage(img, 0, 0, width, height);
             resolve(canvas.toDataURL('image/jpeg', 0.6));
          } else {
             reject(new Error("Cannot get canvas context"));
          }
        };
        img.onerror = (error) => reject(error);
      };
      reader.onerror = (error) => reject(error);
    });
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsSending(true);
    try {
      const base64Image = await compressImage(file);
      const replyData = replyingToMessage ? {
        id: replyingToMessage.id || '',
        senderName: replyingToMessage.senderName,
        text: replyingToMessage.text,
        isImage: !!replyingToMessage.imageUrl,
        isProduct: !!replyingToMessage.productInfo
      } : undefined;
      await sendMessage(currentUser.username, getSenderName(), '', base64Image, undefined, replyData);
      setReplyingToMessage(null);
    } catch (error) {
      console.error(error);
      alert("Lỗi khi tải ảnh lên.");
    } finally {
      setIsSending(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleRevoke = async (id: string | undefined) => {
    if (!id) return;
    if (confirm('Bạn có chắc muốn thu hồi tin nhắn này?')) {
      try {
        await revokeMessage(id);
      } catch (error) {
         alert("Lỗi khi thu hồi tin nhắn.");
      }
    }
  };

  const handleTogglePin = async (id: string | undefined, willPin: boolean) => {
    if (!id) return;
    try {
      await togglePinMessage(id, willPin, currentUser.name);
      setActiveMessageId(null);
    } catch (error) {
      alert("Lỗi khi cập nhật trạng thái ghim tin nhắn.");
    }
  };

  const formatTime = (date: Date | any) => {
    if (!date) return '';
    try {
      const d = date instanceof Date ? date : new Date(date);
      return d.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
    } catch {
      return '';
    }
  };

  const pinnedMessages = useMemo(() => {
    return messages.filter(m => m.isPinned && !m.isDeleted);
  }, [messages]);

  const filteredProducts = useMemo(() => {
    if (!productSearch.trim()) return [];
    const searchLower = productSearch.toLowerCase();
    
    return products.filter(p => {
      const matchName = p.name.toLowerCase().includes(searchLower);
      const matchBarcode = p.barcode.includes(searchLower);
      const matchInternal = p.internalCode?.toLowerCase().includes(searchLower);
      const isSuffixMatch = /^\d+$/.test(searchLower) && p.barcode.endsWith(searchLower);
      
      return matchName || matchBarcode || matchInternal || isSuffixMatch;
    }).slice(0, 10); // Show max 10 results
  }, [productSearch, products]);

  return (
    <motion.div 
      initial={{ opacity: 0, x: 20 }} 
      animate={{ opacity: 1, x: 0 }} 
      exit={{ opacity: 0, x: -20 }}
      className="flex flex-col h-full absolute inset-0 bg-slate-50"
    >
      <div className="pt-safe px-4 shrink-0 bg-white/80 backdrop-blur-md border-b border-slate-200 z-10 shadow-sm relative">
        <Header title="Trò chuyện chung" onBack={onBack} />
      </div>

      {/* Pinned message banner if any */}
      {pinnedMessages.length > 0 && (
        <div className="bg-amber-50/95 backdrop-blur-md border-b border-amber-200/80 px-4 py-2 flex items-center justify-between text-xs z-10 shadow-xs">
          <div 
            onClick={() => {
              const target = pinnedMessages[0];
              if (target?.id) {
                const el = document.getElementById(`msg-${target.id}`);
                el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
              }
            }}
            className="flex items-center gap-2 flex-1 min-w-0 cursor-pointer hover:opacity-80 transition-opacity"
          >
            <div className="p-1 rounded-md bg-amber-100 text-amber-700 shrink-0">
              <Pin size={13} className="fill-amber-600 text-amber-600" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="font-bold text-amber-900 truncate flex items-center gap-1.5 text-[0.75rem]">
                <span>Tin ghim ra Màn hình chính</span>
                {pinnedMessages.length > 1 && (
                  <span className="text-[0.62rem] px-1.5 py-0.2 rounded-full bg-amber-200/80 text-amber-800 font-semibold">
                    +{pinnedMessages.length - 1}
                  </span>
                )}
              </div>
              <div className="text-amber-700/90 truncate text-[0.72rem]">
                <span className="font-medium">{pinnedMessages[0].senderName}: </span>
                {pinnedMessages[0].productInfo 
                  ? `📦 ${pinnedMessages[0].productInfo.name}` 
                  : pinnedMessages[0].imageUrl 
                    ? '📸 Hình ảnh' 
                    : pinnedMessages[0].text}
              </div>
            </div>
          </div>
          <button 
            onClick={(e) => {
              e.stopPropagation();
              if (pinnedMessages[0]?.id) {
                handleTogglePin(pinnedMessages[0].id, false);
              }
            }}
            title="Bỏ ghim tin nhắn này"
            className="ml-2 p-1 text-amber-600 hover:text-amber-800 hover:bg-amber-100/70 rounded-full transition-colors shrink-0 cursor-pointer"
          >
            <X size={14} />
          </button>
        </div>
      )}

      <div 
        className="flex-1 overflow-y-auto px-4 py-4 space-y-4 no-scrollbar"
        onClick={() => setActiveMessageId(null)}>
        {messages.length === 0 ? (
          <div className="text-center py-12 text-slate-400 text-sm">
            Chưa có tin nhắn nào. Hãy là người đầu tiên gửi tin nhắn!
          </div>
        ) : (
          messages.map((msg) => {
            const isMe = msg.senderId === currentUser.username;
            
            const displaySenderName = (msg.senderId === 'conghao' && (msg.senderName.toLowerCase().includes('admin') || msg.senderName.toLowerCase() === 'thông báo hệ thống')) 
              ? 'Thông báo hệ thống' 
              : msg.senderName;
            
            return (
              <div 
                key={msg.id} 
                id={`msg-${msg.id}`}
                className={`flex w-full ${isMe ? 'justify-end' : 'justify-start'}`}
              >
                <div className={`flex max-w-[85%] flex-col ${isMe ? 'items-end' : 'items-start'} group relative`}>
                  <div className="flex items-center gap-1.5 mb-1 mx-1">
                    {!isMe && (
                      <span className="text-[0.65rem] font-bold text-slate-500 uppercase tracking-wider">
                        {displaySenderName}
                      </span>
                    )}
                    <span className="text-[0.6rem] text-slate-400">
                      {formatTime(msg.createdAt)}
                    </span>
                  </div>
                  
                  {msg.isDeleted ? (
                     <div className="px-4 py-2.5 rounded-[1.2rem] shadow-sm text-[0.9rem] italic bg-white border border-slate-200 text-slate-400 rounded-tl-sm">
                       Tin nhắn đã bị thu hồi
                     </div>
                  ) : (
                    <motion.div 
                      className="relative group/msg flex items-center"
                      drag="x"
                      dragConstraints={{ left: 0, right: 0 }}
                      dragElastic={{ left: 0, right: 0.2 }}
                      onDragEnd={(e, info) => {
                        if (info.offset.x > 40) {
                          setReplyingToMessage(msg);
                          setActiveMessageId(null);
                        }
                      }}
                    >
                      <div className={`absolute top-1/2 -translate-y-1/2 flex items-center gap-1 transition-all z-10 ${isMe ? '-left-[6.2rem]' : '-right-16'} ${activeMessageId === msg.id ? 'opacity-100 scale-100' : 'opacity-0 scale-95 pointer-events-none md:pointer-events-auto md:opacity-0 md:group-hover/msg:opacity-100 md:group-hover/msg:scale-100'}`}>
                        {isMe && (
                           <button 
                             onClick={(e) => {
                               e.stopPropagation();
                               handleRevoke(msg.id);
                             }}
                             className="p-1.5 text-slate-400 hover:text-rose-500 hover:bg-rose-50 rounded-full cursor-pointer transition-colors"
                             title="Thu hồi tin nhắn"
                           >
                             <Trash2 size={16} />
                           </button>
                        )}
                        <button 
                           onClick={(e) => {
                             e.stopPropagation();
                             setReplyingToMessage(msg);
                             setActiveMessageId(null);
                           }}
                           className="p-1.5 text-slate-400 hover:text-blue-500 hover:bg-blue-50 rounded-full cursor-pointer transition-colors"
                           title="Trả lời"
                         >
                           <Reply size={16} />
                         </button>
                        <button 
                           onClick={(e) => {
                             e.stopPropagation();
                             handleTogglePin(msg.id, !msg.isPinned);
                           }}
                           className={`p-1.5 rounded-full cursor-pointer transition-colors ${
                             msg.isPinned 
                               ? 'text-amber-600 bg-amber-50 hover:bg-amber-100' 
                               : 'text-slate-400 hover:text-amber-500 hover:bg-amber-50'
                           }`}
                           title={msg.isPinned ? "Bỏ ghim khỏi màn hình chính" : "Ghim ra màn hình chính"}
                         >
                           <Pin size={16} className={msg.isPinned ? "fill-amber-500" : ""} />
                         </button>
                      </div>
                      
                      <div 
                        onClick={(e) => {
                          e.stopPropagation();
                          setActiveMessageId(activeMessageId === msg.id ? null : msg.id);
                        }}
                        className={`px-4 py-2.5 rounded-[1.2rem] shadow-sm text-[0.95rem] active:scale-[0.98] transition-transform ${
                          isMe 
                            ? 'bg-blue-600 text-white rounded-tr-sm' 
                            : 'bg-white border border-slate-200 text-slate-700 rounded-tl-sm'
                        }`}>
                        {msg.isPinned && (
                          <div className={`flex items-center gap-1.5 text-[0.68rem] font-bold mb-1.5 px-2 py-0.5 rounded-lg w-fit ${
                            isMe 
                              ? 'bg-blue-800/60 text-amber-300' 
                              : 'bg-amber-100/90 text-amber-800 border border-amber-300/70'
                          }`}>
                            <Pin size={10} className="fill-current text-amber-400 shrink-0" />
                            <span>Đã ghim ra màn hình chính</span>
                          </div>
                        )}
                        {msg.replyTo && (
                          <div className={`mb-2 p-2.5 rounded-xl text-sm border-l-4 ${isMe ? 'bg-blue-700/40 border-blue-300 text-blue-50' : 'bg-slate-100 border-slate-300 text-slate-500'}`}>
                            <div className="font-bold mb-0.5 text-xs uppercase opacity-80">{msg.replyTo.senderName}</div>
                            <div className="opacity-90 line-clamp-2 text-xs">
                              {msg.replyTo.isImage ? '📸 Hình ảnh' : msg.replyTo.isProduct ? '📦 Thông tin sản phẩm' : msg.replyTo.text}
                            </div>
                          </div>
                        )}
                        {msg.imageUrl && (
                          <img src={msg.imageUrl} alt="Đính kèm" className="max-w-full max-h-60 rounded-xl mb-1 mt-0.5 object-contain" />
                        )}
                        {msg.productInfo && (
                          <div className={`flex flex-col gap-1.5 p-3 rounded-xl mb-1 mt-0.5 ${isMe ? 'bg-blue-700/50 text-white' : 'bg-slate-50 text-slate-700'}`}>
                            <div className="flex items-center gap-2 font-bold mb-1 border-b border-white/20 pb-1.5">
                              <Package size={16} /> Thông tin sản phẩm
                            </div>
                            <div className="font-semibold">{msg.productInfo.name}</div>
                            <div className="text-sm opacity-90 flex items-center gap-2">
                              <span>Mã vạch: {msg.productInfo.barcode}</span>
                            </div>
                            {msg.productInfo.internalCode && (
                              <div className="text-sm opacity-90">Mã nội bộ: {msg.productInfo.internalCode}</div>
                            )}
                            {msg.productInfo.price !== undefined && (
                               <div className={`text-sm opacity-90 mt-1 font-bold ${isMe ? 'text-emerald-200' : 'text-emerald-600'}`}>
                                 Giá: {new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(msg.productInfo.price)}
                               </div>
                            )}
                          </div>
                        )}
                        {msg.text && <div className="whitespace-pre-wrap">{msg.text}</div>}
                      </div>
                    </motion.div>
                  )}
                </div>
              </div>
            );
          })
        )}
        <div ref={messagesEndRef} />
      </div>

      <div className="shrink-0 p-3 bg-white border-t border-slate-200 z-20 pb-safe">
        {replyingToMessage && (
          <div className="mb-2 bg-slate-50 rounded-2xl p-3 border border-slate-200 flex items-start justify-between">
            <div className="flex-1 min-w-0 border-l-4 border-blue-500 pl-3">
              <div className="text-xs font-bold text-blue-600 mb-0.5 uppercase tracking-wide">
                Trả lời {replyingToMessage.senderName}
              </div>
              <div className="text-sm text-slate-500 line-clamp-1">
                {replyingToMessage.imageUrl ? '📸 Hình ảnh' : replyingToMessage.productInfo ? '📦 Thông tin sản phẩm' : replyingToMessage.text}
              </div>
            </div>
            <button 
              type="button"
              onClick={() => setReplyingToMessage(null)} 
              className="w-8 h-8 flex items-center justify-center rounded-full text-slate-400 hover:bg-slate-200 hover:text-slate-600"
            >
              <X size={16} />
            </button>
          </div>
        )}
        <form 
          onSubmit={handleSend} 
          className="flex items-center gap-2 bg-slate-100 p-1.5 pl-2 rounded-full shadow-inner border border-slate-200"
        >
          <input 
            type="file" 
            accept="image/*" 
            className="hidden" 
            ref={fileInputRef} 
            onChange={handleImageUpload}
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={isSending}
            className="w-9 h-9 shrink-0 text-slate-500 hover:text-blue-600 hover:bg-blue-50 rounded-full flex items-center justify-center transition-all disabled:opacity-50"
            title="Gửi ảnh"
          >
             <ImagePlus size={20} />
          </button>
          
          <button
            type="button"
            onClick={() => setIsProductPopupOpen(true)}
            disabled={isSending}
            className="w-9 h-9 shrink-0 text-slate-500 hover:text-emerald-600 hover:bg-emerald-50 rounded-full flex items-center justify-center transition-all disabled:opacity-50"
            title="Gửi sản phẩm"
          >
             <Package size={20} />
          </button>

          <input
            type="text"
            value={newMessage}
            onChange={(e) => setNewMessage(e.target.value)}
            placeholder="Nhập tin nhắn..."
            className="flex-1 bg-transparent border-none outline-none text-[0.95rem] text-slate-700 placeholder-slate-400 px-2 min-w-0"
          />
          
          <button
            type="submit"
            disabled={!newMessage.trim() || isSending}
            className="w-10 h-10 shrink-0 bg-blue-600 text-white rounded-full flex items-center justify-center disabled:opacity-50 disabled:bg-slate-300 transition-all"
          >
            <Send size={18} className="ml-0.5" />
          </button>
        </form>
      </div>

      {/* Product Popup Overlay */}
      <AnimatePresence>
        {isProductPopupOpen && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 z-50 bg-slate-900/40 backdrop-blur-sm flex items-end sm:items-center justify-center"
          >
            <motion.div 
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              transition={{ type: "spring", damping: 25, stiffness: 300 }}
              className="bg-white w-full sm:w-[28rem] h-[85%] sm:h-[80%] sm:rounded-[2rem] rounded-t-[2rem] flex flex-col overflow-hidden shadow-2xl border border-slate-200/50"
            >
              <div className="p-4 border-b border-slate-100 flex items-center justify-between shrink-0 bg-slate-50/50">
                 <h2 className="font-bold text-slate-800 text-lg flex items-center gap-2">
                   <Package className="text-blue-500" /> Chọn sản phẩm
                 </h2>
                 <button 
                   onClick={() => setIsProductPopupOpen(false)}
                   className="w-8 h-8 flex items-center justify-center bg-slate-200/50 text-slate-500 rounded-full hover:bg-slate-200 active:scale-95 transition-all"
                 >
                   <X size={18} />
                 </button>
              </div>

              <div className="p-4 shrink-0">
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none">
                    <Search size={18} className="text-slate-400" />
                  </div>
                  <input
                    type="text"
                    value={productSearch}
                    onChange={(e) => setProductSearch(e.target.value)}
                    placeholder="Tìm tên, barcode, mã nội bộ..."
                    className="w-full bg-slate-100/80 border-none text-slate-800 rounded-2xl pl-10 pr-4 py-3 focus:outline-none focus:ring-2 focus:ring-blue-500/20 transition-all placeholder:text-slate-400"
                    autoFocus
                  />
                </div>
              </div>

              <div className="flex-1 overflow-y-auto px-4 pb-safe no-scrollbar">
                {productSearch.trim() === '' ? (
                   <div className="h-full flex flex-col items-center justify-center text-slate-400 p-8 text-center space-y-3 opacity-60">
                     <Search size={48} strokeWidth={1} />
                     <p>Nhập từ khóa để tìm sản phẩm muốn gửi</p>
                   </div>
                ) : filteredProducts.length > 0 ? (
                  <div className="space-y-2.5 pb-4">
                    {filteredProducts.map((p, i) => (
                      <motion.div
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: i * 0.03 }}
                        key={p.barcode}
                        onClick={() => handleSendProduct(p)}
                        className="bg-white border border-slate-200 p-3.5 rounded-2xl flex items-center justify-between cursor-pointer hover:border-blue-300 hover:shadow-md active:scale-[0.98] transition-all"
                      >
                        <div className="flex-1 min-w-0 pr-3">
                          <h4 className="font-bold text-slate-800 text-[0.95rem] truncate">{p.name}</h4>
                          <div className="flex items-center gap-3 mt-1">
                            <span className="text-xs text-slate-500 font-medium font-mono">{p.barcode}</span>
                            {p.internalCode && (
                              <span className="text-[0.65rem] px-2 py-0.5 bg-slate-100 text-slate-600 rounded-md font-bold">
                                {p.internalCode}
                              </span>
                            )}
                            {p.price !== undefined && (
                              <span className="text-[0.65rem] px-2 py-0.5 bg-emerald-50 text-emerald-600 rounded-md font-bold">
                                {new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(p.price)}
                              </span>
                            )}
                          </div>
                        </div>
                        <div className="w-8 h-8 rounded-full bg-blue-50 flex items-center justify-center text-blue-600 shrink-0">
                           <Send size={14} className="ml-0.5" />
                        </div>
                      </motion.div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-12 text-slate-400">
                    Không tìm thấy sản phẩm nào
                  </div>
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
};
