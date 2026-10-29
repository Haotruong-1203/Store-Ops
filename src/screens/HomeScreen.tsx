import React, { useState, useEffect, useMemo } from 'react';
import { 
  Package, 
  Search, 
  Clock, 
  Calculator, 
  Database, 
  LogOut, 
  ShieldCheck, 
  Users, 
  MessageCircle, 
  Camera, 
  Settings,
  Pin,
  ChevronRight,
  X,
  ClipboardList
} from 'lucide-react';
import { motion } from 'motion/react';
import { PRESET_USERS, getCustomUsers } from '../lib/auth';
import { Product, ExpiryRecord } from '../lib/firestoreService';
import { ChatMessage, subscribePinnedMessages, togglePinMessage } from '../lib/chatService';
import { formatDate, getStatus, getProductRecords } from '../lib/utils';

interface HomeScreenProps {
  navigate: (screen: string) => void;
  currentUser: { username: string; name: string; role: 'admin' | 'user' };
  onLogout: () => void;
  viewingUserId?: string;
  onSelectViewingUser?: (uid: string) => void;
  productCount: number;
  products?: Product[];
}

const HomeScreen: React.FC<HomeScreenProps> = ({ 
  navigate, 
  currentUser, 
  onLogout,
  viewingUserId,
  onSelectViewingUser,
  productCount,
  products = []
}) => {
  const [pinnedMessages, setPinnedMessages] = useState<ChatMessage[]>([]);
  const [selectedTab, setSelectedTab] = useState<'pinned' | 'expiry'>('pinned');

  useEffect(() => {
    const unsub = subscribePinnedMessages((msgs) => {
      setPinnedMessages(msgs);
    });
    return () => unsub();
  }, []);

  const nearestExpiryItem = useMemo(() => {
    if (!products || products.length === 0) return null;
    const list: Array<{
      product: Product;
      record: ExpiryRecord;
      destructionDate: string;
      status: ReturnType<typeof getStatus>;
    }> = [];

    products.forEach(p => {
      const records = getProductRecords(p);
      records.forEach(rec => {
        if (rec.destructionDate) {
          const st = getStatus(rec.destructionDate);
          list.push({
            product: p,
            record: rec,
            destructionDate: rec.destructionDate,
            status: st
          });
        }
      });
    });

    if (list.length === 0) return null;
    list.sort((a, b) => new Date(a.destructionDate).getTime() - new Date(b.destructionDate).getTime());
    return list[0];
  }, [products]);

  const hasPinned = pinnedMessages.length > 0;
  const hasExpiry = !!nearestExpiryItem;

  const activeTab = (hasPinned && (!hasExpiry || selectedTab === 'pinned')) 
    ? 'pinned' 
    : (hasExpiry ? 'expiry' : (hasPinned ? 'pinned' : 'none'));

  const currentPinned = pinnedMessages[0];

  const shortUserName = currentUser.name.replace(/\s*\(Admin\)/i, '').trim();

  const navItems = [
    { 
      id: 'inventory', 
      icon: <Package size={26} className="text-white" strokeWidth={2.2} />, 
      title: 'Đặt hàng', 
      bg: 'bg-gradient-to-br from-emerald-500 to-teal-600',
      shadow: 'shadow-emerald-500/20' 
    },
    { 
      id: 'check', 
      icon: <Search size={26} className="text-white" strokeWidth={2.2} />, 
      title: 'Kiểm hàng', 
      bg: 'bg-gradient-to-br from-blue-500 to-indigo-600',
      shadow: 'shadow-blue-500/20' 
    },
    { 
      id: 'scanner', 
      icon: <Camera size={26} className="text-white" strokeWidth={2.2} />, 
      title: 'Quét mã / OCR', 
      badge: 'OCR',
      bg: 'bg-gradient-to-br from-violet-500 to-purple-600',
      shadow: 'shadow-purple-500/20' 
    },
    { 
      id: 'destruction', 
      icon: <ClipboardList size={26} className="text-white" strokeWidth={2.2} />, 
      title: 'Hủy hàng', 
      bg: 'bg-gradient-to-br from-amber-500 to-orange-500',
      shadow: 'shadow-amber-500/20' 
    },
    { 
      id: 'expiry', 
      icon: <Clock size={26} className="text-white" strokeWidth={2.2} />, 
      title: 'Kiểm HSD', 
      bg: 'bg-gradient-to-br from-rose-500 to-red-600',
      shadow: 'shadow-rose-500/20' 
    },
    { 
      id: 'calculator', 
      icon: <Calculator size={26} className="text-white" strokeWidth={2.2} />, 
      title: 'Tính ngày', 
      bg: 'bg-gradient-to-br from-sky-400 to-cyan-600',
      shadow: 'shadow-sky-500/20' 
    },
    { 
      id: 'chat', 
      icon: <MessageCircle size={26} className="text-white" strokeWidth={2.2} />, 
      title: 'Trò chuyện', 
      bg: 'bg-gradient-to-br from-pink-500 to-rose-500',
      shadow: 'shadow-pink-500/20' 
    },
    { 
      id: 'data', 
      icon: <Database size={26} className="text-white" strokeWidth={2.2} />, 
      title: 'Dữ liệu', 
      bg: 'bg-gradient-to-br from-teal-500 to-emerald-600',
      shadow: 'shadow-teal-500/20' 
    },
    { 
      id: 'settings', 
      icon: <Settings size={26} className="text-white" strokeWidth={2.2} />, 
      title: 'Cài đặt', 
      bg: 'bg-gradient-to-br from-zinc-700 to-slate-800',
      shadow: 'shadow-zinc-700/20' 
    },
    { 
      id: 'logout', 
      icon: <LogOut size={26} className="text-white" strokeWidth={2.2} />, 
      title: 'Đăng xuất', 
      badge: shortUserName,
      bg: 'bg-gradient-to-br from-red-600 to-rose-700',
      shadow: 'shadow-red-600/20' 
    }
  ];

  return (
    <motion.div 
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.15 }}
      className="flex flex-col min-h-full space-y-4"
    >

      {currentUser.role === 'admin' && onSelectViewingUser && (
        <div className="bg-white border border-zinc-200/80 rounded-2xl p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
          <div className="flex items-center gap-1.5 text-xs font-medium text-zinc-500 px-1">
            <Users size={15} className="text-zinc-400" />
            <span>Phạm vi dữ liệu:</span>
          </div>
          <div className="flex flex-wrap gap-1 bg-zinc-100 p-1 rounded-xl">
            {[
              { id: 'all', label: 'Tất cả' },
              { id: 'conghao', label: 'C.Hào' },
              ...getCustomUsers().map(u => ({
                id: u.username,
                label: u.name.split(' ').pop() || u.name
              }))
            ].map(tab => (
              <button
                key={tab.id}
                onClick={() => onSelectViewingUser(tab.id)}
                className={`py-1.5 px-3 rounded-lg text-xs font-medium transition-all cursor-pointer truncate ${
                  viewingUserId === tab.id 
                    ? 'bg-white text-zinc-900 shadow-2xs font-bold' 
                    : 'text-zinc-600 hover:text-zinc-900'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Hero Widget Card */}
      <div 
        onClick={() => {
          if (activeTab === 'pinned') navigate('chat');
          else navigate('expiry');
        }}
        className="bg-white border border-zinc-200/80 rounded-2xl sm:rounded-3xl p-4 sm:p-5 shadow-xs hover:border-zinc-300 hover:shadow-sm cursor-pointer transition-all group"
      >
        <div className="flex items-center justify-between mb-3">
          {hasPinned && hasExpiry ? (
            <div className="flex items-center gap-1 p-1 bg-zinc-100 rounded-xl" onClick={e => e.stopPropagation()}>
              <button
                type="button"
                onClick={() => setSelectedTab('pinned')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                  activeTab === 'pinned' ? 'bg-white text-zinc-900 shadow-xs' : 'text-zinc-500 hover:text-zinc-900'
                }`}
              >
                <Pin size={13} className={activeTab === 'pinned' ? 'text-amber-500' : ''} />
                <span>Tin ghim ({pinnedMessages.length})</span>
              </button>
              <button
                type="button"
                onClick={() => setSelectedTab('expiry')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                  activeTab === 'expiry' ? 'bg-white text-zinc-900 shadow-xs' : 'text-zinc-500 hover:text-zinc-900'
                }`}
              >
                <Clock size={13} className={activeTab === 'expiry' ? 'text-rose-500' : ''} />
                <span>Cận date</span>
              </button>
            </div>
          ) : hasPinned ? (
            <div className="flex items-center gap-2 text-xs font-bold text-zinc-600 uppercase tracking-wider">
              <div className="w-6 h-6 rounded-lg bg-amber-50 text-amber-600 flex items-center justify-center">
                <Pin size={13} />
              </div>
              <span>Tin nhắn đã ghim</span>
            </div>
          ) : (
            <div className="flex items-center gap-2 text-xs font-bold text-zinc-600 uppercase tracking-wider">
              <div className="w-6 h-6 rounded-lg bg-rose-50 text-rose-600 flex items-center justify-center">
                <Clock size={13} />
              </div>
              <span>Cảnh báo hạn sử dụng</span>
            </div>
          )}

          <div className="flex items-center gap-2">
            {activeTab === 'pinned' && currentPinned ? (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  if (currentPinned.id) togglePinMessage(currentPinned.id, false);
                }}
                className="text-xs font-medium text-zinc-400 hover:text-rose-600 px-2 py-1 rounded-lg transition-colors flex items-center gap-1 cursor-pointer"
              >
                <X size={13} /> Bỏ ghim
              </button>
            ) : nearestExpiryItem ? (
              <span className={`text-xs font-semibold px-2.5 py-1 rounded-full border ${nearestExpiryItem.status.badgeCls}`}>
                {nearestExpiryItem.status.shortTxt}
              </span>
            ) : (
              <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
                ✓ Ổn định
              </span>
            )}
          </div>
        </div>

        <div>
          {activeTab === 'pinned' && currentPinned ? (
            <div>
              <div className="flex items-center gap-2 mb-1.5">
                <span className="text-xs font-bold text-zinc-800">{currentPinned.senderName}</span>
                <span className="text-[11px] text-zinc-400 font-medium">{formatDate(currentPinned.createdAt as any)}</span>
              </div>
              {currentPinned.productInfo ? (
                <div className="bg-zinc-50 border border-zinc-200/80 p-3 rounded-xl flex items-center gap-3 mt-1.5">
                  <div className="w-8 h-8 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center shrink-0">
                    <Package size={16} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="font-semibold text-zinc-900 text-sm truncate">{currentPinned.productInfo.name}</div>
                    <div className="text-xs text-zinc-500 font-mono mt-0.5">{currentPinned.productInfo.barcode}</div>
                  </div>
                  <ChevronRight size={16} className="text-zinc-400 shrink-0" />
                </div>
              ) : (
                <p className="text-sm font-medium text-zinc-800 line-clamp-2">{currentPinned.text || '[Hình ảnh đính kèm]'}</p>
              )}
            </div>
          ) : nearestExpiryItem ? (
            <div className="flex items-center justify-between gap-4">
              <div className="min-w-0 flex-1">
                <div className="font-bold text-zinc-900 text-base sm:text-lg truncate">
                  {nearestExpiryItem.product.name}
                </div>
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-zinc-500 mt-1 font-medium">
                  <span className="font-mono bg-zinc-100 px-1.5 py-0.5 rounded text-zinc-700">{nearestExpiryItem.product.barcode}</span>
                  <span>•</span>
                  <span>Ngày hủy: <strong className="text-rose-600 font-semibold">{formatDate(nearestExpiryItem.destructionDate)}</strong></span>
                  {nearestExpiryItem.record?.quantity && (
                    <>
                      <span>•</span>
                      <span>SL: <strong className="text-zinc-900 font-semibold">{nearestExpiryItem.record.quantity}</strong></span>
                    </>
                  )}
                </div>
              </div>
              <div className="w-9 h-9 rounded-xl bg-zinc-100 flex items-center justify-center text-zinc-500 group-hover:bg-zinc-200 group-hover:text-zinc-900 transition-colors shrink-0">
                <ChevronRight size={18} className="group-hover:translate-x-0.5 transition-transform" />
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-between py-1">
              <div className="flex items-center gap-2.5 text-zinc-500 text-sm">
                <div className="w-2 h-2 rounded-full bg-emerald-500 shrink-0"></div>
                <span>Tất cả hàng hóa trong kho đều trong hạn an toàn.</span>
              </div>
              <ChevronRight size={18} className="text-zinc-400" />
            </div>
          )}
        </div>
      </div>

      {/* Feature Tiles: Bright cohesive color blocks with corner icon & modern concise title */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 sm:gap-4">
        {navItems.map((item) => (
          <button
            key={item.id}
            onClick={() => {
              if (item.id === 'logout') {
                onLogout();
              } else {
                navigate(item.id);
              }
            }}
            className={`relative flex flex-col justify-between p-4 sm:p-5 rounded-2xl sm:rounded-3xl ${item.bg} text-white shadow-md ${item.shadow} hover:brightness-105 active:scale-[0.97] transition-all duration-150 text-left cursor-pointer min-h-[110px] sm:min-h-[125px] group overflow-hidden`}
          >
            <div className="flex items-start justify-between w-full">
              <div className="w-10 h-10 sm:w-11 sm:h-11 rounded-xl sm:rounded-2xl bg-white/20 backdrop-blur-xs flex items-center justify-center text-white transition-transform group-hover:scale-105 shrink-0 shadow-inner">
                {item.icon}
              </div>
              {item.badge && (
                <span className="px-2.5 py-0.5 bg-white/25 backdrop-blur-xs text-white text-[11px] font-bold rounded-full tracking-wide shadow-2xs max-w-[120px] truncate">
                  {item.badge}
                </span>
              )}
            </div>

            <div className="mt-4">
              <span className="font-bold text-base sm:text-lg tracking-tight leading-snug drop-shadow-2xs">
                {item.title}
              </span>
            </div>
          </button>
        ))}
      </div>
    </motion.div>
  );
};

export default HomeScreen;
