import { db, newId, type DocumentCategory, type TripDocument } from './schema'
import {
  assertWritable,
  deleteDocumentRemote,
  documentPath,
  downloadDocumentFile,
  removeDocumentFile,
  uploadDocumentFile,
  upsertDocument,
} from './remote'

/** Storage 버킷 상한과 맞춰둔다 (0006_documents.sql) */
export const MAX_FILE_BYTES = 10 * 1024 * 1024

export const DOCUMENT_CATEGORIES: { value: DocumentCategory; label: string }[] = [
  { value: 'voucher', label: '바우처' },
  { value: 'ticket', label: '항공·교통권' },
  { value: 'lodging', label: '숙소 예약' },
  { value: 'insurance', label: '보험' },
  { value: 'id', label: '신분·여권' },
  { value: 'other', label: '기타' },
]

export function categoryLabel(c: DocumentCategory): string {
  return DOCUMENT_CATEGORIES.find((x) => x.value === c)?.label ?? '기타'
}

export function formatBytes(n: number): string {
  if (n < 1024) return `${n}B`
  if (n < 1024 * 1024) return `${Math.round(n / 1024)}KB`
  return `${(n / (1024 * 1024)).toFixed(1)}MB`
}

/**
 * 서류를 올린다.
 *
 * 순서: Storage 업로드 → 메타데이터 → 로컬 캐시.
 * 메타데이터를 먼저 쓰면 파일 없는 레코드가 남을 수 있고, 목록에는 보이는데
 * 열리지 않는 서류가 된다.
 *
 * 올린 파일은 곧바로 IndexedDB에 넣는다. 업로드한 바이트가 이미 손에 있으니
 * 다시 내려받을 이유가 없다.
 */
export async function addDocument(input: {
  tripId: string
  title: string
  category: DocumentCategory
  file: File
  note?: string
}): Promise<string> {
  if (input.file.size > MAX_FILE_BYTES) {
    throw new Error(
      `파일이 너무 큽니다 (${formatBytes(input.file.size)}). ${formatBytes(MAX_FILE_BYTES)} 이하만 올릴 수 있습니다.`,
    )
  }
  assertWritable()

  const id = newId()
  const path = documentPath(input.tripId, id)
  const mimeType = input.file.type || 'application/octet-stream'

  await uploadDocumentFile(path, input.file, mimeType)

  const doc: TripDocument = {
    id,
    tripId: input.tripId,
    title: input.title.trim() || input.file.name,
    category: input.category,
    fileName: input.file.name,
    mimeType,
    sizeBytes: input.file.size,
    storagePath: path,
    note: input.note?.trim() || undefined,
    createdAt: Date.now(),
  }

  try {
    await upsertDocument(doc)
  } catch (err) {
    // 메타데이터가 실패하면 올라간 파일을 남겨두지 않는다 — 고아 파일은
    // 용량만 먹고 아무도 못 찾는다
    await removeDocumentFile(path)
    throw err
  }

  await db.transaction('rw', [db.documents, db.documentBlobs], async () => {
    await db.documents.put(doc)
    await db.documentBlobs.put({
      id,
      tripId: input.tripId,
      blob: input.file,
      cachedAt: Date.now(),
    })
  })
  return id
}

export async function updateDocument(
  id: string,
  patch: Partial<Pick<TripDocument, 'title' | 'category' | 'note'>>,
): Promise<void> {
  assertWritable()
  const cur = await db.documents.get(id)
  if (!cur) return
  const next = { ...cur, ...patch }
  await upsertDocument(next)
  await db.documents.put(next)
}

export async function deleteDocument(id: string): Promise<void> {
  const doc = await db.documents.get(id)
  if (!doc) return
  assertWritable()
  await deleteDocumentRemote(id)
  await removeDocumentFile(doc.storagePath)
  await db.transaction('rw', [db.documents, db.documentBlobs], async () => {
    await db.documents.delete(id)
    await db.documentBlobs.delete(id)
  })
}

/**
 * 파일 바이트를 얻는다. 캐시가 있으면 그걸 쓰고, 없으면 내려받아 캐시한다.
 *
 * 온라인에서도 캐시를 먼저 보는 이유: 경로가 하나뿐이라 오프라인 분기가
 * 필요 없고, 같은 서류를 여러 번 열어도 트래픽이 들지 않는다.
 */
export async function getDocumentBlob(id: string): Promise<Blob> {
  const cached = await db.documentBlobs.get(id)
  if (cached) return cached.blob

  const doc = await db.documents.get(id)
  if (!doc) throw new Error('document_not_found')
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    throw new Error('offline_not_cached')
  }

  const blob = await downloadDocumentFile(doc.storagePath)
  await db.documentBlobs.put({
    id,
    tripId: doc.tripId,
    blob,
    cachedAt: Date.now(),
  })
  return blob
}

export interface CacheProgress {
  total: number
  cached: number
  failed: number
}

/**
 * 아직 캐시되지 않은 서류를 모두 내려받는다.
 *
 * 여행 전에 한 번 눌러두면 현지에서 데이터 없이도 열린다. 이게 이 기능의
 * 존재 이유라서 화면에서 상태를 명확히 보여준다.
 */
export async function cacheAllDocuments(
  tripId: string,
  onProgress?: (p: CacheProgress) => void,
): Promise<CacheProgress> {
  const docs = await db.documents.where('tripId').equals(tripId).toArray()
  const cachedIds = new Set(
    await db.documentBlobs.where('tripId').equals(tripId).primaryKeys(),
  )
  const missing = docs.filter((d) => !cachedIds.has(d.id))

  const progress: CacheProgress = {
    total: docs.length,
    cached: docs.length - missing.length,
    failed: 0,
  }
  onProgress?.(progress)

  for (const d of missing) {
    try {
      const blob = await downloadDocumentFile(d.storagePath)
      await db.documentBlobs.put({
        id: d.id,
        tripId,
        blob,
        cachedAt: Date.now(),
      })
      progress.cached++
    } catch (err) {
      console.error('서류 캐시 실패', d.title, err)
      progress.failed++
    }
    onProgress?.({ ...progress })
  }
  return progress
}

export async function cachedDocumentIds(tripId: string): Promise<Set<string>> {
  return new Set(
    await db.documentBlobs.where('tripId').equals(tripId).primaryKeys(),
  )
}
