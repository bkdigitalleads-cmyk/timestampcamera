/**
 * From the shutter to a saved, stamped photo. The camera's JPEG is kept as
 * the original (inside the app only, so a stamp can be corrected later),
 * the stamp is burned into a full-size copy by src/stamp/burn.ts with
 * native Skia, and a small copy is made for lists. The record goes in the
 * job; a copy goes to Photos when saving is on. Nothing leaves the phone.
 */
import { Asset } from 'expo-asset';
import { File } from 'expo-file-system';
import * as MediaLibrary from 'expo-media-library';
import { Skia, SkTypeface } from '@shopify/react-native-skia';
import { burnStamp, downscaleJpeg } from './stamp/burn';
import { stampLines, StampContext, StampSettings, Place } from './stamp/content';
import type { MapPicture } from './camera/MapThumb';
import type { Photo, PhotoStamp, Role } from './model';
import { newId } from './model';
import { readRel, readUri, uriOf, writeRel } from './store';
import type { Logo } from './settings';

let typeface: Promise<SkTypeface> | null = null;

/** Barlow SemiBold for the stamp, from the app bundle, loaded once. */
export function stampTypeface(): Promise<SkTypeface> {
  if (!typeface) {
    typeface = (async () => {
      const asset = Asset.fromModule(require('../assets/fonts/Barlow-SemiBold.ttf'));
      await asset.downloadAsync();
      const bytes = await new File(asset.localUri ?? asset.uri).bytes();
      const tf = Skia.Typeface.MakeFreeTypeFaceFromData(Skia.Data.fromBytes(bytes));
      if (!tf) throw new Error('The stamp font did not load.');
      return tf;
    })().catch((e) => {
      typeface = null;
      throw e;
    });
  }
  return typeface;
}

const THUMB_SIDE = 480;

export interface StampJob {
  settings: StampSettings;
  ctx: StampContext;
  logo: Logo | null;
  map: MapPicture | null;
}

/** Burns the stamp into `original` and writes the stamped photo and its small copy. */
async function burnAndWrite(original: Uint8Array, s: StampJob, paths: { file: string; thumb: string }): Promise<{ width: number; height: number; stamp: PhotoStamp }> {
  const tf = await stampTypeface();
  const content = stampLines(s.settings, s.ctx);
  const out = burnStamp(Skia, {
    photo: original,
    content,
    corner: s.settings.corner,
    size: s.settings.size,
    singleLine: s.settings.template === 'compact',
    typeface: tf,
    logo: content.logo && s.logo ? readRel(s.logo.file) : null,
    map: content.map && s.map ? s.map.png : null,
  });
  writeRel(paths.file, out.bytes);
  writeRel(paths.thumb, downscaleJpeg(Skia, out.bytes, THUMB_SIDE, 78).bytes);
  return {
    width: out.width,
    height: out.height,
    stamp: { template: s.settings.template, corner: s.settings.corner, size: s.settings.size, lines: content.lines, logo: content.logo && !!out.layout.logo, map: content.map && !!out.layout.map },
  };
}

const pathsFor = (jobId: string, id: string) => ({ file: `photos/${jobId}/${id}.jpg`, original: `photos/${jobId}/${id}-original.jpg`, thumb: `photos/${jobId}/${id}-small.jpg` });

/** Saves a copy of the stamped photo to Photos (add-only access). False when it could not. */
export async function copyToPhotos(rel: string): Promise<boolean> {
  try {
    const perm = await MediaLibrary.getPermissionsAsync(true);
    if (!perm.granted) return false;
    await MediaLibrary.saveToLibraryAsync(uriOf(rel));
    return true;
  } catch {
    return false;
  }
}

/** Asks for add-only access to Photos (only when the person turns saving on). */
export async function askPhotosAccess(): Promise<boolean> {
  try {
    const cur = await MediaLibrary.getPermissionsAsync(true);
    if (cur.granted) return true;
    if (!cur.canAskAgain) return false;
    return (await MediaLibrary.requestPermissionsAsync(true)).granted;
  } catch {
    return false;
  }
}

export interface NewPhoto {
  /** The camera's file (or the imported file). */
  uri: string;
  jobId: string;
  takenAt: number;
  place: Place | null;
  note: string;
  role: Role;
  pairId: string | null;
  itemId: string | null;
  imported: boolean;
  stamp: StampJob;
}

/** One photo, from its file to a record. The camera's temporary file is removed afterwards. */
export async function makePhoto(n: NewPhoto): Promise<Photo> {
  const id = newId(Date.now());
  const paths = pathsFor(n.jobId, id);
  const original = readUri(n.uri);
  writeRel(paths.original, original);
  const done = await burnAndWrite(original, n.stamp, paths);
  if (!n.imported) {
    try {
      new File(n.uri).delete();
    } catch {
      // the camera's cache is cleared by iOS anyway
    }
  }
  return {
    id,
    jobId: n.jobId,
    takenAt: n.takenAt,
    ...paths,
    width: done.width,
    height: done.height,
    lat: n.place?.lat ?? null,
    lng: n.place?.lng ?? null,
    altitude: n.place?.altitude ?? null,
    address: n.place?.address ?? null,
    note: n.note,
    caption: '',
    imported: n.imported,
    role: n.role,
    pairId: n.pairId,
    itemId: n.itemId,
    stamp: done.stamp,
    createdAt: Date.now(),
  };
}

/**
 * Corrects a stamp: burns it again from the kept original with the photo's
 * own time and place, and the settings and note given. The file is replaced
 * in place; the record keeps its id, job and pair.
 */
export async function restamp(p: Photo, s: StampJob, note: string): Promise<Photo> {
  const original = readRel(p.original);
  const done = await burnAndWrite(original, s, { file: p.file, thumb: p.thumb });
  return { ...p, note, width: done.width, height: done.height, stamp: done.stamp };
}
