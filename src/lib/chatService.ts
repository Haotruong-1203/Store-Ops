import { supabase } from './supabase';

export interface ChatMessage {
  id?: string;
  senderId: string;
  senderName: string;
  text: string;
  imageUrl?: string;
  isDeleted?: boolean;
  isPinned?: boolean;
  pinnedAt?: Date | string;
  pinnedBy?: string;
  productInfo?: {
    name: string;
    barcode: string;
    internalCode?: string;
    price?: number;
  };
  replyTo?: {
    id: string;
    senderName: string;
    text: string;
    isImage: boolean;
    isProduct: boolean;
  };
  createdAt: Date | string;
}

const TABLE_NAME = 'messages';

const messageSubscribers = new Set<(messages: ChatMessage[]) => void>();
const pinnedSubscribers = new Set<(messages: ChatMessage[]) => void>();

const mapRowToChatMessage = (row: any): ChatMessage => {
  let senderId = row.userName || 'user';
  let productInfo = undefined;
  let replyTo = undefined;
  let isDeleted = row.isDeleted ?? false;
  let pinnedBy = row.pinnedBy;

  if (row.userRole) {
    try {
      if (typeof row.userRole === 'string' && row.userRole.startsWith('{')) {
        const meta = JSON.parse(row.userRole);
        if (meta.senderId) senderId = meta.senderId;
        if (meta.productInfo) productInfo = meta.productInfo;
        if (meta.replyTo) replyTo = meta.replyTo;
        if (meta.isDeleted !== undefined) isDeleted = meta.isDeleted;
        if (meta.pinnedBy) pinnedBy = meta.pinnedBy;
      } else if (typeof row.userRole === 'string') {
        senderId = row.userRole;
      }
    } catch {}
  }

  if (senderId === 'Công Hào' || row.userName === 'Công Hào') {
    senderId = 'conghao';
  }

  return {
    id: row.id,
    senderId,
    senderName: row.userName || 'Thành viên',
    text: row.text || '',
    imageUrl: row.imageUrl,
    isDeleted,
    isPinned: row.isPinned ?? false,
    pinnedAt: row.pinnedAt ? new Date(row.pinnedAt) : undefined,
    pinnedBy,
    productInfo,
    replyTo,
    createdAt: row.createdAt ? new Date(row.createdAt) : new Date()
  };
};

export const notifyMessageSubscribers = async () => {
  if (messageSubscribers.size === 0) return;
  try {
    const { data, error } = await supabase
      .from(TABLE_NAME)
      .select('*')
      .order('createdAt', { ascending: false })
      .limit(100);
    if (!error && data) {
      const msgs = data.map(mapRowToChatMessage).reverse();
      messageSubscribers.forEach(cb => {
        try { cb(msgs); } catch {}
      });
    }
  } catch {}
};

export const notifyPinnedSubscribers = async () => {
  if (pinnedSubscribers.size === 0) return;
  try {
    const { data, error } = await supabase
      .from(TABLE_NAME)
      .select('*')
      .eq('isPinned', true)
      .order('createdAt', { ascending: false });
    if (!error && data) {
      const msgs = data.map(mapRowToChatMessage).filter(m => !m.isDeleted);
      msgs.sort((a, b) => {
        const tA = a.pinnedAt ? new Date(a.pinnedAt).getTime() : new Date(a.createdAt).getTime();
        const tB = b.pinnedAt ? new Date(b.pinnedAt).getTime() : new Date(b.createdAt).getTime();
        return tB - tA;
      });
      pinnedSubscribers.forEach(cb => {
        try { cb(msgs); } catch {}
      });
    }
  } catch {}
};

export const subscribeMessages = (
  onData: (messages: ChatMessage[]) => void,
  onError?: (error: Error) => void
) => {
  let isCancelled = false;
  messageSubscribers.add(onData);

  const loadMessages = async () => {
    try {
      const { data, error } = await supabase
        .from(TABLE_NAME)
        .select('*')
        .order('createdAt', { ascending: false })
        .limit(100);

      if (error) throw error;
      if (isCancelled) return;

      const messages: ChatMessage[] = (data || []).map(mapRowToChatMessage);
      onData(messages.reverse());
    } catch (err: any) {
      if (isCancelled) return;
      if (onError) onError(err);
    }
  };

  loadMessages();

  const channel = supabase
    .channel('messages-realtime')
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: TABLE_NAME },
      () => {
        if (!isCancelled) loadMessages();
      }
    )
    .subscribe();

  const pollInterval = setInterval(() => {
    if (!isCancelled) loadMessages();
  }, 2500);

  return () => {
    isCancelled = true;
    messageSubscribers.delete(onData);
    clearInterval(pollInterval);
    supabase.removeChannel(channel);
  };
};

export const togglePinMessage = async (messageId: string, isPinned: boolean, pinnedBy?: string) => {
  const payload = {
    isPinned,
    pinnedAt: isPinned ? new Date().toISOString() : null,
    pinnedBy: isPinned ? (pinnedBy || null) : null
  };
  const { error } = await supabase
    .from(TABLE_NAME)
    .update(payload)
    .eq('id', messageId);
  if (error) throw error;
  notifyMessageSubscribers();
  notifyPinnedSubscribers();
};

export const subscribePinnedMessages = (
  onData: (messages: ChatMessage[]) => void,
  onError?: (error: Error) => void
) => {
  let isCancelled = false;
  pinnedSubscribers.add(onData);

  const loadPinned = async () => {
    try {
      const { data, error } = await supabase
        .from(TABLE_NAME)
        .select('*')
        .eq('isPinned', true)
        .order('createdAt', { ascending: false });

      if (error) throw error;
      if (isCancelled) return;

      const messages: ChatMessage[] = (data || [])
        .map(mapRowToChatMessage)
        .filter(m => !m.isDeleted);

      messages.sort((a, b) => {
        const tA = a.pinnedAt ? new Date(a.pinnedAt).getTime() : new Date(a.createdAt).getTime();
        const tB = b.pinnedAt ? new Date(b.pinnedAt).getTime() : new Date(b.createdAt).getTime();
        return tB - tA;
      });

      onData(messages);
    } catch (err: any) {
      if (isCancelled) return;
      if (onError) onError(err);
    }
  };

  loadPinned();

  const channel = supabase
    .channel('pinned-realtime')
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: TABLE_NAME },
      () => {
        if (!isCancelled) loadPinned();
      }
    )
    .subscribe();

  const pollInterval = setInterval(() => {
    if (!isCancelled) loadPinned();
  }, 4000);

  return () => {
    isCancelled = true;
    pinnedSubscribers.delete(onData);
    clearInterval(pollInterval);
    supabase.removeChannel(channel);
  };
};

export const sendMessage = async (
  senderId: string, 
  senderName: string, 
  text: string,
  imageUrl?: string,
  productInfo?: { name: string; barcode: string; internalCode?: string; price?: number },
  replyTo?: { id: string; senderName: string; text: string; isImage: boolean; isProduct: boolean }
): Promise<ChatMessage> => {
  if (!text.trim() && !imageUrl && !productInfo) {
    throw new Error('Tin nhắn rỗng');
  }

  const docId = 'msg_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7);
  const now = new Date();
  const meta = {
    senderId,
    productInfo: productInfo || null,
    replyTo: replyTo || null
  };

  const payload = {
    id: docId,
    text: text.trim(),
    userName: senderName,
    userRole: JSON.stringify(meta),
    imageUrl: imageUrl || null,
    isPinned: false,
    createdAt: now.toISOString()
  };

  const { error } = await supabase.from(TABLE_NAME).insert([payload]);
  if (error) throw error;

  const createdMsg: ChatMessage = {
    id: docId,
    senderId,
    senderName,
    text: text.trim(),
    imageUrl,
    productInfo,
    replyTo,
    isPinned: false,
    createdAt: now
  };

  notifyMessageSubscribers();
  return createdMsg;
};

export const revokeMessage = async (messageId: string) => {
  const { error } = await supabase
    .from(TABLE_NAME)
    .delete()
    .eq('id', messageId);
  if (error) throw error;
  notifyMessageSubscribers();
};
