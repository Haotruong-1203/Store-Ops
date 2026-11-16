import { supabase } from './supabase';

export interface BoxItem {
  id: string;
  name: string;
  latestPhotoUrl?: string;
  latestCaption?: string;
  latestUpdatedBy?: string;
  latestUpdatedAt?: any;
  photoCount: number;
  createdAt?: any;
}

export interface BoxPhoto {
  id: string;
  boxId: string;
  imageUrl: string;
  caption: string;
  updatedBy: string;
  createdAt: any;
}

const BOXES_TABLE = 'boxes';
const PHOTOS_TABLE = 'box_photos';

export const subscribeBox = (
  boxId: string,
  onData: (box: BoxItem | null, photos: BoxPhoto[]) => void
) => {
  let isCancelled = false;

  const loadData = async () => {
    try {
      const [boxRes, photosRes] = await Promise.all([
        supabase.from(BOXES_TABLE).select('*').eq('id', boxId).maybeSingle(),
        supabase.from(PHOTOS_TABLE).select('*').eq('boxId', boxId).order('createdAt', { ascending: false }).limit(50)
      ]);

      if (isCancelled) return;

      const currentBox: BoxItem | null = boxRes.data || null;
      const currentPhotos: BoxPhoto[] = (photosRes.data || []) as BoxPhoto[];
      onData(currentBox, currentPhotos);
    } catch (err) {
      console.warn('Error loading box:', err);
    }
  };

  loadData();

  const channel = supabase
    .channel(`box-${boxId}-realtime`)
    .on('postgres_changes', { event: '*', schema: 'public', table: BOXES_TABLE, filter: `id=eq.${boxId}` }, () => {
      if (!isCancelled) loadData();
    })
    .on('postgres_changes', { event: '*', schema: 'public', table: PHOTOS_TABLE, filter: `boxId=eq.${boxId}` }, () => {
      if (!isCancelled) loadData();
    })
    .subscribe();

  return () => {
    isCancelled = true;
    supabase.removeChannel(channel);
  };
};

export const subscribeAllBoxes = (onData: (boxes: BoxItem[]) => void) => {
  let isCancelled = false;

  const loadBoxes = async () => {
    try {
      const { data, error } = await supabase
        .from(BOXES_TABLE)
        .select('*')
        .order('id', { ascending: true })
        .limit(100);

      if (error) throw error;
      if (isCancelled) return;
      onData((data || []) as BoxItem[]);
    } catch (err) {
      console.warn('Error loading boxes:', err);
    }
  };

  loadBoxes();

  const channel = supabase
    .channel('all-boxes-realtime')
    .on('postgres_changes', { event: '*', schema: 'public', table: BOXES_TABLE }, () => {
      if (!isCancelled) loadBoxes();
    })
    .subscribe();

  return () => {
    isCancelled = true;
    supabase.removeChannel(channel);
  };
};

export const subscribeAllPhotos = (onData: (photos: BoxPhoto[]) => void) => {
  let isCancelled = false;

  const loadPhotos = async () => {
    try {
      const { data, error } = await supabase
        .from(PHOTOS_TABLE)
        .select('*')
        .order('createdAt', { ascending: false })
        .limit(120);

      if (error) throw error;
      if (isCancelled) return;
      onData((data || []) as BoxPhoto[]);
    } catch (err) {
      console.warn('Error loading photos:', err);
    }
  };

  loadPhotos();

  const channel = supabase
    .channel('all-photos-realtime')
    .on('postgres_changes', { event: '*', schema: 'public', table: PHOTOS_TABLE }, () => {
      if (!isCancelled) loadPhotos();
    })
    .subscribe();

  return () => {
    isCancelled = true;
    supabase.removeChannel(channel);
  };
};

export const saveBoxPhoto = async (
  boxId: string,
  imageUrl: string,
  caption: string,
  updatedBy: string
): Promise<void> => {
  const photoDocId = 'photo_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7);
  const now = new Date().toISOString();

  await supabase.from(PHOTOS_TABLE).insert([{
    id: photoDocId,
    boxId,
    photoUrl: imageUrl,
    note: caption.trim() || null,
    createdAt: now
  }]);

  const { data: existingBox } = await supabase
    .from(BOXES_TABLE)
    .select('*')
    .eq('id', boxId)
    .maybeSingle();

  const numPart = boxId.replace(/\D/g, '');
  const boxTitle = `Thùng ${numPart ? parseInt(numPart, 10) : boxId}`;

  await supabase.from(BOXES_TABLE).upsert({
    id: boxId,
    boxNumber: numPart || boxId,
    title: existingBox?.title || boxTitle,
    note: caption.trim() || null,
    createdBy: updatedBy.trim() || 'Người quét mã',
    createdAt: existingBox?.createdAt || now,
    updatedAt: now
  }, { onConflict: 'id' });
};

export const getNextBoxId = async (): Promise<string> => {
  try {
    const { data } = await supabase
      .from(BOXES_TABLE)
      .select('id')
      .limit(200);

    let maxNum = 0;
    (data || []).forEach((d: any) => {
      const match = d.id.match(/\d+/);
      if (match) {
        const n = parseInt(match[0], 10);
        if (!isNaN(n) && n > maxNum) {
          maxNum = n;
        }
      }
    });
    const nextNum = maxNum + 1;
    return `id${String(nextNum).padStart(3, '0')}`;
  } catch {
    return 'id001';
  }
};
