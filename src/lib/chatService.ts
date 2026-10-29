import { 
  collection, 
  addDoc, 
  onSnapshot, 
  query, 
  where,
  orderBy, 
  limit,
  serverTimestamp,
  Timestamp,
  doc,
  updateDoc
} from 'firebase/firestore';
import { db } from './firebase';

export interface ChatMessage {
  id?: string;
  senderId: string;
  senderName: string;
  text: string;
  imageUrl?: string;
  isDeleted?: boolean;
  isPinned?: boolean;
  pinnedAt?: Timestamp | Date;
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
  createdAt: Timestamp | Date;
}

const COLLECTION_NAME = 'messages';

// Lắng nghe tin nhắn realtime
export const subscribeMessages = (
  onData: (messages: ChatMessage[]) => void,
  onError?: (error: Error) => void
) => {
  const q = query(
    collection(db, COLLECTION_NAME),
    orderBy('createdAt', 'desc'),
    limit(100)
  );

  return onSnapshot(
    q,
    (snapshot) => {
      const messages: ChatMessage[] = [];
      snapshot.forEach((doc) => {
        const data = doc.data();
        messages.push({
          id: doc.id,
          senderId: data.senderId,
          senderName: data.senderName,
          text: data.text,
          imageUrl: data.imageUrl,
          isDeleted: data.isDeleted,
          isPinned: data.isPinned ?? false,
          pinnedAt: data.pinnedAt?.toDate?.() || data.pinnedAt,
          pinnedBy: data.pinnedBy,
          productInfo: data.productInfo,
          replyTo: data.replyTo,
          createdAt: data.createdAt?.toDate?.() || new Date(),
        } as ChatMessage);
      });
      // Đảo ngược để tin nhắn cũ nhất ở trên, mới nhất ở dưới
      onData(messages.reverse());
    },
    (error) => {
      if (onError) onError(error);
    }
  );
};

// Ghim hoặc bỏ ghim tin nhắn
export const togglePinMessage = async (messageId: string, isPinned: boolean, pinnedBy?: string) => {
  try {
    const docRef = doc(db, COLLECTION_NAME, messageId);
    await updateDoc(docRef, {
      isPinned: isPinned,
      pinnedAt: isPinned ? serverTimestamp() : null,
      pinnedBy: isPinned ? (pinnedBy || null) : null
    });
  } catch (error) {
    console.error("Lỗi khi ghim/bỏ ghim tin nhắn:", error);
    throw error;
  }
};

// Lắng nghe các tin nhắn được ghim realtime
export const subscribePinnedMessages = (
  onData: (messages: ChatMessage[]) => void,
  onError?: (error: Error) => void
) => {
  const q = query(
    collection(db, COLLECTION_NAME),
    where('isPinned', '==', true)
  );

  return onSnapshot(
    q,
    (snapshot) => {
      const messages: ChatMessage[] = [];
      snapshot.forEach((doc) => {
        const data = doc.data();
        if (!data.isDeleted) {
          messages.push({
            id: doc.id,
            senderId: data.senderId,
            senderName: data.senderName,
            text: data.text,
            imageUrl: data.imageUrl,
            isDeleted: data.isDeleted,
            isPinned: true,
            pinnedAt: data.pinnedAt?.toDate?.() || data.pinnedAt,
            pinnedBy: data.pinnedBy,
            productInfo: data.productInfo,
            replyTo: data.replyTo,
            createdAt: data.createdAt?.toDate?.() || new Date(),
          } as ChatMessage);
        }
      });

      // Sắp xếp tin nhắn được ghim mới nhất lên đầu
      messages.sort((a, b) => {
        const getTime = (val: any) => {
          if (!val) return 0;
          if (typeof val.toMillis === 'function') return val.toMillis();
          if (typeof val.toDate === 'function') return val.toDate().getTime();
          if (val instanceof Date) return val.getTime();
          return new Date(val).getTime() || 0;
        };
        const tA = a.pinnedAt ? getTime(a.pinnedAt) : getTime(a.createdAt);
        const tB = b.pinnedAt ? getTime(b.pinnedAt) : getTime(b.createdAt);
        return tB - tA;
      });

      onData(messages);
    },
    (error) => {
      console.error("Lỗi khi lắng nghe tin nhắn ghim:", error);
      if (onError) onError(error);
    }
  );
};

// Gửi tin nhắn mới
export const sendMessage = async (
  senderId: string, 
  senderName: string, 
  text: string,
  imageUrl?: string,
  productInfo?: { name: string; barcode: string; internalCode?: string; price?: number },
  replyTo?: { id: string; senderName: string; text: string; isImage: boolean; isProduct: boolean }
) => {
  if (!text.trim() && !imageUrl && !productInfo) return;
  
  try {
    await addDoc(collection(db, COLLECTION_NAME), {
      senderId,
      senderName,
      text: text.trim(),
      imageUrl: imageUrl || null,
      productInfo: productInfo || null,
      replyTo: replyTo || null,
      isDeleted: false,
      createdAt: serverTimestamp()
    });
  } catch (error) {
    console.error("Lỗi khi gửi tin nhắn:", error);
    throw error;
  }
};

export const revokeMessage = async (messageId: string) => {
  try {
    const docRef = doc(db, COLLECTION_NAME, messageId);
    await updateDoc(docRef, {
      isDeleted: true
    });
  } catch (error) {
    console.error("Lỗi khi thu hồi tin nhắn:", error);
    throw error;
  }
};
