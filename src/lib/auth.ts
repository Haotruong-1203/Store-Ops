import { supabase } from './supabase';

export interface UserAccount {
  id: string;
  username: string;
  name: string;
  role: 'admin' | 'user';
  avatarBg: string;
}

export interface StoredUserProfile {
  username: string;
  name: string;
  password: string;
  avatarBg: string;
  role: 'user';
  createdAt?: string;
}

export const PRESET_USERS: Record<string, { name: string; password: string; adminPassword?: string; avatarBg: string }> = {
  conghao: {
    name: 'Công Hào',
    password: 'Haotruong1203%',
    adminPassword: 'admin',
    avatarBg: 'bg-blue-600'
  }
};

const SESSION_KEY = 'quanlyhang_session_user';
const CUSTOM_USERS_KEY = 'quanlyhang_custom_users';

const AVATAR_COLORS = [
  'bg-emerald-600',
  'bg-purple-600',
  'bg-rose-500',
  'bg-amber-600',
  'bg-indigo-600',
  'bg-teal-600',
  'bg-cyan-600',
  'bg-orange-500',
  'bg-pink-600',
  'bg-violet-600'
];

export const getSavedUser = (): { username: string; name: string; role: 'admin' | 'user' } | null => {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
};

export const saveUserSession = (user: { username: string; name: string; role: 'admin' | 'user' }) => {
  localStorage.setItem(SESSION_KEY, JSON.stringify(user));
};

export const clearUserSession = () => {
  localStorage.removeItem(SESSION_KEY);
};

// Đọc danh sách tài khoản tự tạo từ LocalStorage (loại bỏ hoàn toàn Thử Nghiệm)
export const getCustomUsers = (): StoredUserProfile[] => {
  try {
    const raw = localStorage.getItem(CUSTOM_USERS_KEY);
    if (!raw) return [];
    const list: StoredUserProfile[] = JSON.parse(raw);
    const filtered = list.filter(u => 
      u.name.trim().toLowerCase() !== 'thử nghiệm' && 
      !u.username.toLowerCase().includes('thunghiem')
    );
    if (filtered.length !== list.length) {
      localStorage.setItem(CUSTOM_USERS_KEY, JSON.stringify(filtered));
    }
    return filtered;
  } catch {
    return [];
  }
};

// Lưu tài khoản mới
export const saveCustomUser = async (name: string, password: string): Promise<StoredUserProfile> => {
  const users = getCustomUsers();
  
  // Tạo slug định danh an toàn từ tên
  const slug = name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]/g, '_')
    .replace(/^_+|_+$/g, '');
  
  const baseUsername = slug || 'user';
  const existingCount = users.filter(u => u.username.startsWith(baseUsername)).length;
  const username = existingCount > 0 ? `${baseUsername}_${Date.now().toString().slice(-4)}` : baseUsername;
  
  const avatarBg = AVATAR_COLORS[users.length % AVATAR_COLORS.length];
  
  const newUser: StoredUserProfile = {
    username,
    name: name.trim(),
    password: password.trim(),
    avatarBg,
    role: 'user',
    createdAt: new Date().toISOString()
  };

  // Lưu vào LocalStorage
  users.push(newUser);
  localStorage.setItem(CUSTOM_USERS_KEY, JSON.stringify(users));

  try {
    await supabase.from('app_users').upsert({
      username: newUser.username,
      name: newUser.name,
      password: newUser.password,
      avatarBg: newUser.avatarBg,
      role: 'user',
      createdAt: newUser.createdAt
    }, { onConflict: 'username' });
  } catch (err) {
    console.warn('Lỗi khi đồng bộ user lên Supabase:', err);
  }

  return newUser;
};

export const fetchRemoteCustomUsers = async (): Promise<StoredUserProfile[]> => {
  try {
    const { data, error } = await supabase.from('app_users').select('*');
    if (error) throw error;
    const remoteUsers: StoredUserProfile[] = [];
    (data || []).forEach((row: any) => {
      const isTestUser = row.name?.trim().toLowerCase() === 'thử nghiệm' || row.username?.toLowerCase().includes('thunghiem');
      if (row.username && row.name && row.password && !isTestUser) {
        remoteUsers.push({
          username: row.username,
          name: row.name,
          password: row.password,
          avatarBg: row.avatarBg || 'bg-indigo-600',
          role: 'user',
          createdAt: row.createdAt
        });
      }
    });

    if (remoteUsers.length > 0) {
      const local = getCustomUsers();
      const map = new Map<string, StoredUserProfile>();
      local.forEach(u => map.set(u.username, u));
      remoteUsers.forEach(u => map.set(u.username, u));
      const merged = Array.from(map.values());
      localStorage.setItem(CUSTOM_USERS_KEY, JSON.stringify(merged));
      return merged;
    }
  } catch (err) {
    console.warn('Lấy danh sách user từ Supabase thất bại:', err);
  }
  return getCustomUsers();
};

// Lấy danh sách tất cả profile để hiển thị trên màn hình đăng nhập
export const getAllProfiles = () => {
  const customUsers = getCustomUsers();
  const profiles: Array<{
    key: string;
    username: string;
    name: string;
    avatarBg: string;
    isPreset?: boolean;
  }> = [];

  // 1. Công Hào
  profiles.push({
    key: 'conghao',
    username: 'conghao',
    name: PRESET_USERS.conghao.name,
    avatarBg: PRESET_USERS.conghao.avatarBg,
    isPreset: true
  });

  // 2. Các profile người dùng đã tạo
  customUsers.forEach(u => {
    profiles.push({
      key: u.username,
      username: u.username,
      name: u.name,
      avatarBg: u.avatarBg,
      isPreset: false
    });
  });

  return profiles;
};

// Tìm tên hiển thị của bất kỳ username nào
export const getUserDisplayName = (username: string): string => {
  if (username === 'conghao') return 'Công Hào';
  const customUsers = getCustomUsers();
  const found = customUsers.find(u => u.username === username);
  if (found) return found.name;
  return username || 'Người dùng';
};

export const authenticateUser = (identifier: string, inputPass: string) => {
  const cleanId = identifier.trim().toLowerCase();
  const trimmedPass = inputPass.trim();

  // 1. Kiểm tra tài khoản mặc định (Công Hào)
  if (
    cleanId === 'conghao' || 
    PRESET_USERS.conghao.name.toLowerCase() === cleanId ||
    PRESET_USERS.conghao.name.toLowerCase().replace(/\s+/g, '') === cleanId
  ) {
    if (trimmedPass === PRESET_USERS.conghao.adminPassword) {
      return {
        username: 'conghao',
        name: 'Công Hào (Admin)',
        role: 'admin' as const
      };
    }
    if (trimmedPass === PRESET_USERS.conghao.password) {
      return {
        username: 'conghao',
        name: 'Công Hào',
        role: 'user' as const
      };
    }
    return null;
  }

  // 2. Kiểm tra các tài khoản người dùng tự tạo
  const customUsers = getCustomUsers();
  const found = customUsers.find(
    u => u.username.toLowerCase() === cleanId || 
         u.name.toLowerCase() === cleanId ||
         u.name.toLowerCase().replace(/\s+/g, '') === cleanId
  );

  if (found) {
    if (trimmedPass === found.password) {
      return {
        username: found.username,
        name: found.name,
        role: 'user' as const
      };
    }
  }

  return null;
};
