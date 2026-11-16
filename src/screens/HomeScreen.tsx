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
  Lock,
  KeyRound,
  Box,
  PackageX
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
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
  const [isDataPasswordModalOpen, setIsDataPasswordModalOpen] = useState(false);
  const [dataPasswordInput, setDataPasswordInput] = useState('');
  const [dataPasswordError, setDataPasswordError] = useState('');

  const handleConfirmDataPassword = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (dataPasswordInput.trim() === '1203') {
      sessionStorage.setItem('data_access_unlocked', '1203');
      setIsDataPasswordModalOpen(false);
      setDataPasswordInput('');
      setDataPasswordError('');
      navigate('data');
    } else {
      setDataPasswordError('Mật khẩu không đúng!');
    }
  };

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

  const heroCardConfig = useMemo(() => {
    if (activeTab === 'pinned' && currentPinned) {
      return {
        gradient: 'bg-gradient-to-br from-orange-600 via-rose-600 to-pink-700',
        shadow: 'shadow-lg shadow-orange-950/25',
        badgeBg: 'bg-white/20 text-white',
        title: 'Tin nhắn đã ghim',
        icon: <Pin size={15} className="text-white" />
      };
    }
    if (nearestExpiryItem) {
      if (nearestExpiryItem.status.isExpired) {
        return {
          gradient: 'bg-gradient-to-br from-slate-800 via-rose-950/90 to-slate-900',
          shadow: 'shadow-md shadow-slate-900/15',
          badgeBg: 'bg-white/15 text-rose-100',
          title: 'Hạn sử dụng',
          icon: <Clock size={15} className="text-rose-200" />
        };
      }
      return {
        gradient: 'bg-gradient-to-br from-slate-700 via-slate-800 to-zinc-900',
        shadow: 'shadow-md shadow-slate-900/15',
        badgeBg: 'bg-white/15 text-amber-100',
        title: 'Hạn sử dụng',
        icon: <Clock size={15} className="text-amber-200" />
      };
    }
    return {
      gradient: 'bg-gradient-to-br from-slate-700 via-slate-800 to-slate-900',
      shadow: 'shadow-md shadow-slate-900/15',
      badgeBg: 'bg-white/15 text-slate-100',
      title: 'Hạn sử dụng',
      icon: <Clock size={15} className="text-slate-200" />
    };
  }, [activeTab, currentPinned, nearestExpiryItem]);

  const navItems = [
    { 
      id: 'inventory', 
      icon: <Package size={26} className="text-white" strokeWidth={2.2} />, 
      title: 'Đặt hàng', 
      bg: 'bg-gradient-to-br from-emerald-500 via-emerald-600 to-teal-700',
      shadow: 'shadow-emerald-600/30' 
    },
    { 
      id: 'scanner', 
      icon: <Camera size={26} className="text-white" strokeWidth={2.2} />, 
      title: 'Quét mã vạch', 
      badge: 'Giá',
      bg: 'bg-gradient-to-br from-violet-600 via-purple-600 to-indigo-800',
      shadow: 'shadow-purple-600/30' 
    },
    { 
      id: 'check', 
      icon: <Search size={26} className="text-white" strokeWidth={2.2} />, 
      title: 'Tìm & kiểm hàng', 
      bg: 'bg-gradient-to-br from-blue-600 via-indigo-600 to-indigo-800',
      shadow: 'shadow-blue-600/30' 
    },
    { 
      id: 'expiry', 
      icon: <Clock size={26} className="text-white" strokeWidth={2.2} />, 
      title: 'Hạn sử dụng', 
      bg: 'bg-gradient-to-br from-rose-500 via-red-600 to-rose-700',
      shadow: 'shadow-rose-600/30' 
    },
    { 
      id: 'calculator', 
      icon: <Calculator size={26} className="text-white" strokeWidth={2.2} />, 
      title: 'Tính ngày hủy', 
      bg: 'bg-gradient-to-br from-cyan-500 via-teal-500 to-emerald-600',
      shadow: 'shadow-cyan-500/30' 
    },
    { 
      id: 'chat', 
      icon: <MessageCircle size={26} className="text-white" strokeWidth={2.2} />, 
      title: 'Chat', 
      bg: 'bg-gradient-to-br from-fuchsia-600 via-pink-600 to-rose-600',
      shadow: 'shadow-fuchsia-600/30' 
    },
    { 
      id: 'disposal', 
      icon: <PackageX size={26} className="text-white" strokeWidth={2.2} />, 
      title: 'Huỷ hàng', 
      bg: 'bg-gradient-to-br from-rose-600 via-orange-600 to-amber-700',
      shadow: 'shadow-rose-600/30' 
    },
    { 
      id: 'fill', 
      icon: <Box size={26} className="text-white" strokeWidth={2.2} />, 
      title: 'Fill hàng', 
      bg: 'bg-gradient-to-br from-amber-500 via-orange-500 to-amber-700',
      shadow: 'shadow-amber-500/30' 
    },
    { 
      id: 'data', 
      icon: <Database size={26} className="text-white" strokeWidth={2.2} />, 
      title: 'Dữ liệu', 
      bg: 'bg-gradient-to-br from-slate-800 via-indigo-950 to-blue-950',
      shadow: 'shadow-indigo-950/35' 
    },
    { 
      id: 'settings', 
      icon: <Settings size={26} className="text-white" strokeWidth={2.2} />, 
      title: 'Cài đặt', 
      bg: 'bg-gradient-to-br from-slate-600 via-zinc-700 to-zinc-900',
      shadow: 'shadow-zinc-800/30' 
    },
    { 
      id: 'logout', 
      icon: <LogOut size={26} className="text-white" strokeWidth={2.2} />, 
      title: 'Đăng xuất', 
      badge: shortUserName,
      bg: 'bg-gradient-to-br from-red-600 via-rose-700 to-pink-800',
      shadow: 'shadow-red-700/30' 
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
      <div 
        onClick={() => {
          if (activeTab === 'pinned') navigate('chat');
          else navigate('expiry');
        }}
        className={`relative overflow-hidden rounded-2xl sm:rounded-3xl px-4 py-5 sm:p-6 ${heroCardConfig.gradient} ${heroCardConfig.shadow} text-white cursor-pointer transition-all duration-150 hover:brightness-105 active:scale-[0.985] group border-0 outline-none ring-0`}
      >
        <div className="absolute top-0 inset-x-0 h-1/2 bg-gradient-to-b from-white/10 to-transparent pointer-events-none" />
        <div className="absolute -right-8 -bottom-8 w-32 h-32 rounded-full bg-white/5 blur-xl pointer-events-none" />

        <div className="flex items-center justify-between gap-2 mb-3.5 sm:mb-4 relative z-10">
          {hasPinned && hasExpiry ? (
            <div className="flex items-center gap-1 p-1 bg-black/25 backdrop-blur-md rounded-xl border-0" onClick={e => e.stopPropagation()}>
              <button
                type="button"
                onClick={() => setSelectedTab('pinned')}
                className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer border-0 ${
                  activeTab === 'pinned' ? 'bg-white text-slate-950' : 'text-white/80 hover:text-white'
                }`}
              >
                <Pin size={13} className={activeTab === 'pinned' ? 'text-amber-600' : 'text-white'} />
                <span>Tin ghim ({pinnedMessages.length})</span>
              </button>
              <button
                type="button"
                onClick={() => setSelectedTab('expiry')}
                className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer border-0 ${
                  activeTab === 'expiry' ? 'bg-white text-slate-950' : 'text-white/80 hover:text-white'
                }`}
              >
                <Clock size={13} className={activeTab === 'expiry' ? 'text-rose-600' : 'text-white'} />
                <span>Hạn sử dụng</span>
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-2 text-xs font-extrabold uppercase tracking-wider text-white">
              <div className="w-6 h-6 rounded-lg bg-white/15 backdrop-blur-md flex items-center justify-center text-white shrink-0 border-0">
                {heroCardConfig.icon}
              </div>
              <span>{heroCardConfig.title}</span>
            </div>
          )}

          <div className="flex items-center gap-2 shrink-0">
            {activeTab === 'pinned' && currentPinned ? (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  if (currentPinned.id) togglePinMessage(currentPinned.id, false);
                }}
                className="text-xs font-bold text-white/90 hover:text-white bg-white/15 hover:bg-white/25 px-2.5 py-1 rounded-full backdrop-blur-md border-0 transition-all flex items-center gap-1 cursor-pointer"
              >
                <X size={13} /> Bỏ ghim
              </button>
            ) : nearestExpiryItem ? (
              <span className={`text-xs font-extrabold px-3 py-1 rounded-full backdrop-blur-md border-0 ring-0 outline-none ${heroCardConfig.badgeBg}`}>
                {nearestExpiryItem.status.shortTxt}
              </span>
            ) : null}
          </div>
        </div>

        <div className="relative z-10">
          {activeTab === 'pinned' && currentPinned ? (
            <div>
              <div className="flex items-center gap-2 mb-1.5">
                <span className="text-xs font-black text-white">{currentPinned.senderName}</span>
                <span className="text-[11px] text-white/70 font-semibold">{formatDate(currentPinned.createdAt as any)}</span>
              </div>
              {currentPinned.productInfo ? (
                <div className="bg-black/25 backdrop-blur-md border-0 p-3 rounded-2xl flex items-center gap-3 mt-1.5">
                  <div className="w-9 h-9 rounded-xl bg-white/15 text-white flex items-center justify-center shrink-0 border-0">
                    <Package size={18} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="font-extrabold text-white text-sm sm:text-base truncate">{currentPinned.productInfo.name}</div>
                  </div>
                  <ChevronRight size={18} className="text-white/70 shrink-0 group-hover:translate-x-0.5 transition-transform" />
                </div>
              ) : (
                <p className="text-sm font-semibold text-white/95 leading-relaxed line-clamp-2">{currentPinned.text || '[Hình ảnh đính kèm]'}</p>
              )}
            </div>
          ) : nearestExpiryItem ? (
            <div className="flex items-center justify-between gap-3 pt-0.5">
              <div className="min-w-0 flex-1 space-y-2.5">
                <div className="font-black text-white text-lg sm:text-xl leading-normal truncate tracking-tight">
                  {nearestExpiryItem.product.name}
                </div>
                <div className="flex items-center gap-2 text-xs font-medium overflow-x-auto no-scrollbar">
                  <span className="bg-white/15 backdrop-blur-md px-3 py-1.5 rounded-xl text-white/90 font-semibold border-0 ring-0 shrink-0">
                    Hủy: <strong className="text-white font-black">{formatDate(nearestExpiryItem.destructionDate)}</strong>
                  </span>
                  {nearestExpiryItem.record?.quantity && (
                    <span className="bg-white/15 backdrop-blur-md px-3 py-1.5 rounded-xl text-white/90 font-semibold border-0 ring-0 shrink-0">
                      SL: <strong className="text-white font-black">{nearestExpiryItem.record.quantity}</strong>
                    </span>
                  )}
                </div>
              </div>
              <div className="w-9 h-9 rounded-xl bg-white/15 backdrop-blur-md flex items-center justify-center text-white group-hover:bg-white/25 transition-all shrink-0 border-0">
                <ChevronRight size={18} className="group-hover:translate-x-0.5 transition-transform" />
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-between py-1.5">
              <div className="text-white text-sm sm:text-base font-bold">
                <span className="tracking-tight">Tất cả hàng hóa trong kho đều trong hạn an toàn.</span>
              </div>
              <div className="w-9 h-9 rounded-xl bg-white/15 backdrop-blur-md flex items-center justify-center text-white group-hover:bg-white/25 transition-all shrink-0 border-0">
                <ChevronRight size={18} className="group-hover:translate-x-0.5 transition-transform" />
              </div>
            </div>
          )}
        </div>
      </div>

      {currentUser.role === 'admin' && onSelectViewingUser && (
        <div className="bg-white/95 backdrop-blur-md rounded-2xl sm:rounded-3xl p-3 sm:p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 shadow-apple border-0">
          <div className="flex items-center gap-1.5 text-xs font-medium text-zinc-500 px-1">
            <Users size={15} className="text-zinc-400" />
            <span>Phạm vi dữ liệu:</span>
          </div>
          <div className="flex flex-wrap gap-1 bg-zinc-100/80 p-1 rounded-xl">
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
                    ? 'bg-white text-zinc-900 shadow-xs font-bold' 
                    : 'text-zinc-600 hover:text-zinc-900'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3 sm:gap-4">
        {navItems.map((item) => (
          <button
            key={item.id}
            onClick={() => {
              if (item.id === 'logout') {
                onLogout();
              } else if (item.id === 'data') {
                if (currentUser.role === 'admin' || sessionStorage.getItem('data_access_unlocked') === '1203') {
                  navigate('data');
                } else {
                  setDataPasswordInput('');
                  setDataPasswordError('');
                  setIsDataPasswordModalOpen(true);
                }
              } else {
                navigate(item.id);
              }
            }}
            className={`relative flex flex-col justify-between p-4 sm:p-5 rounded-2xl sm:rounded-3xl ${item.bg} text-white shadow-lg ${item.shadow} hover:brightness-105 active:scale-[0.97] transition-all duration-150 text-left cursor-pointer min-h-[114px] sm:min-h-[128px] group overflow-hidden border-0`}
          >
            {/* Subtle glass lighting highlight */}
            <div className="absolute top-0 inset-x-0 h-1/2 bg-gradient-to-b from-white/20 to-transparent pointer-events-none" />
            <div className="absolute -right-6 -bottom-6 w-24 h-24 rounded-full bg-white/10 blur-xl pointer-events-none" />

            <div className="flex items-start justify-between w-full relative z-10">
              <div className="w-10 h-10 sm:w-11 sm:h-11 rounded-xl sm:rounded-2xl bg-white/20 backdrop-blur-md flex items-center justify-center text-white transition-transform group-hover:scale-105 shrink-0 shadow-inner">
                {item.icon}
              </div>
              {item.badge && (
                <span className="px-2.5 py-0.5 bg-white/25 backdrop-blur-md text-white text-[11px] font-bold rounded-full tracking-wide shadow-2xs max-w-[120px] truncate">
                  {item.badge}
                </span>
              )}
            </div>

            <div className="mt-4 relative z-10">
              <span className="font-bold text-base sm:text-lg tracking-tight leading-snug drop-shadow-2xs">
                {item.title}
              </span>
            </div>
          </button>
        ))}
      </div>


      <AnimatePresence>
        {isDataPasswordModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }} 
              animate={{ opacity: 1 }} 
              exit={{ opacity: 0 }} 
              className="absolute inset-0 bg-slate-900/50 backdrop-blur-xs"
              onClick={() => setIsDataPasswordModalOpen(false)}
            />
            <motion.div 
              initial={{ scale: 0.95, opacity: 0, y: 10 }} 
              animate={{ scale: 1, opacity: 1, y: 0 }} 
              exit={{ scale: 0.95, opacity: 0, y: 10 }}
              className="relative w-full max-w-sm bg-white rounded-3xl p-6 shadow-2xl z-10 space-y-4"
            >
              <div className="flex items-center justify-between pb-2 border-b border-slate-100">
                <div className="flex items-center gap-2.5">
                  <div className="w-9 h-9 rounded-xl bg-teal-50 text-teal-600 flex items-center justify-center font-bold">
                    <Lock size={18} />
                  </div>
                  <div>
                    <h3 className="text-base font-bold text-slate-800">Khóa Admin</h3>
                    <p className="text-[0.72rem] text-slate-400">Chỉ dành cho quản trị viên</p>
                  </div>
                </div>
                <button 
                  onClick={() => setIsDataPasswordModalOpen(false)}
                  className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-full"
                >
                  <X size={18} />
                </button>
              </div>

              <form onSubmit={handleConfirmDataPassword} className="space-y-3">
                <div>
                  <label className="block text-xs font-bold text-slate-600 mb-1.5">
                    Nhập mật khẩu:
                  </label>
                  <div className="relative">
                    <input
                      type="password"
                      autoFocus
                      value={dataPasswordInput}
                      onChange={(e) => {
                        setDataPasswordInput(e.target.value);
                        if (dataPasswordError) setDataPasswordError('');
                      }}
                      placeholder="••••••••"
                      className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-center text-lg font-mono tracking-widest text-slate-800 focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500"
                    />
                  </div>
                  {dataPasswordError && (
                    <p className="text-rose-500 text-xs font-semibold mt-1 text-center">
                      {dataPasswordError}
                    </p>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => setIsDataPasswordModalOpen(false)}
                    className="py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl text-xs transition-all active:scale-95"
                  >
                    Hủy
                  </button>
                  <button
                    type="submit"
                    className="py-2.5 bg-teal-600 hover:bg-teal-700 text-white font-bold rounded-xl text-xs transition-all active:scale-95 shadow-sm shadow-teal-500/20"
                  >
                    Xác nhận
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </motion.div>
  );
};

export default HomeScreen;
