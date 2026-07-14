// Core domain model for the document workspace.
// A "session" is one editing workspace: one or more source PDFs/images whose
// pages have been combined into a single ordered page list (this is what
// lets Merge, Split, Organize, and single-file editing share one engine).

export type Rotation = 0 | 90 | 180 | 270;

export interface SourceDoc {
  id: string;
  name: string;
  bytes: Uint8Array;
  /** number of pages in the original source */
  pageCount: number;
  kind: 'pdf' | 'image';
  /** required when kind === 'image' */
  imageFormat?: 'png' | 'jpg';
}

export interface PageRef {
  id: string;
  sourceId: string;
  /** 0-based page index within the source document */
  pageIndex: number;
  /** the source page's own /Rotate value at import time (immutable) */
  baseRotation: Rotation;
  /** additional rotation the user has applied in-app, on top of baseRotation */
  rotation: Rotation;
  /** unrotated MediaBox page size in PDF points, as found in the source */
  width: number;
  height: number;
}

export type AnnotationKind =
  | 'highlight'
  | 'ink'
  | 'text'
  | 'note'
  | 'image'
  | 'checkmark'
  | 'xmark'
  | 'circle'
  | 'line';

export interface BaseAnnotation {
  id: string;
  kind: AnnotationKind;
  pageId: string;
  color: string;
  createdAt: number;
}

/** Highlight / rectangle-based marker. Coordinates are in display space:
 * origin top-left, x right, y down, in PDF points of the page at rotation 0
 * scale (i.e. un-scaled by zoom). */
export interface HighlightAnnotation extends BaseAnnotation {
  kind: 'highlight';
  x: number;
  y: number;
  width: number;
  height: number;
  opacity: number;
}

export interface InkAnnotation extends BaseAnnotation {
  kind: 'ink';
  points: { x: number; y: number }[];
  strokeWidth: number;
}

export interface TextAnnotation extends BaseAnnotation {
  kind: 'text';
  x: number;
  y: number;
  width: number;
  fontSize: number;
  text: string;
  /** Free-form clockwise rotation in degrees, around the box's center. */
  rotation?: number;
}

export interface NoteAnnotation extends BaseAnnotation {
  kind: 'note';
  x: number;
  y: number;
  text: string;
}

/** Signature / initials / uploaded image stamp / date stamp. */
export interface ImageAnnotation extends BaseAnnotation {
  kind: 'image';
  x: number;
  y: number;
  width: number;
  height: number;
  dataUrl: string;
  /** Free-form clockwise rotation in degrees, around the box's center. */
  rotation?: number;
}

export interface ShapeAnnotation extends BaseAnnotation {
  kind: 'checkmark' | 'xmark' | 'circle' | 'line';
  x: number;
  y: number;
  width: number;
  height: number;
  strokeWidth: number;
}

export type Annotation =
  | HighlightAnnotation
  | InkAnnotation
  | TextAnnotation
  | NoteAnnotation
  | ImageAnnotation
  | ShapeAnnotation;

/** Distributes Omit<> over each member of the Annotation union — plain
 * `Omit<Annotation, ...>` would collapse to only the fields shared by every
 * variant, since `keyof` on a union is an intersection of its members' keys. */
type OmitCommon<T> = Omit<T, 'id' | 'pageId' | 'createdAt'>;
export type NewAnnotation =
  | OmitCommon<HighlightAnnotation>
  | OmitCommon<InkAnnotation>
  | OmitCommon<TextAnnotation>
  | OmitCommon<NoteAnnotation>
  | OmitCommon<ImageAnnotation>
  | OmitCommon<ShapeAnnotation>;

export interface FormFieldValue {
  type: 'text' | 'checkbox' | 'radio' | 'dropdown' | 'optionlist';
  value: string | boolean;
}

export interface SavedSignature {
  id: string;
  name: string;
  kind: 'signature' | 'initials';
  dataUrl: string;
  createdAt: number;
}

export interface RecentFile {
  id: string;
  name: string;
  bytes: Uint8Array;
  pageCount: number;
  updatedAt: number;
  thumbnailDataUrl?: string;
}

export type EditorMode =
  | 'view'
  | 'annotate'
  | 'fillsign'
  | 'organize'
  | 'pagetools'
  | 'protect';

export type AnnotateTool =
  | 'select'
  | 'highlight'
  | 'ink'
  | 'text'
  | 'note'
  | 'eraser';

export type FillSignTool =
  | 'select'
  | 'text'
  | 'signature'
  | 'initials'
  | 'date'
  | 'checkmark'
  | 'xmark'
  | 'circle'
  | 'line';

export interface WatermarkOptions {
  text: string;
  fontSize: number;
  opacity: number;
  rotation: number;
  color: string;
  position:
    | 'center'
    | 'top-left'
    | 'top-right'
    | 'bottom-left'
    | 'bottom-right';
  pageRange: string;
}

export interface CropOptions {
  top: number;
  right: number;
  bottom: number;
  left: number;
  pageRange: string;
}

export interface PageNumberOptions {
  format: string;
  startAt: number;
  fontSize: number;
  color: string;
  position:
    | 'bottom-center'
    | 'bottom-left'
    | 'bottom-right'
    | 'top-center'
    | 'top-left'
    | 'top-right';
  pageRange: string;
}
