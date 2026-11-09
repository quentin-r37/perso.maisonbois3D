import type { jsPDF } from 'jspdf';
import type { PieceSpec } from '../build/grid';
import { countPieces } from '../guide/models/build';
import type { Step } from '../guide/models/helpers';
import { CATALOG, getDef } from '../pieces/catalog';
import { COVER_SIZE, STEP_SIZE, renderNotice } from './render';
import { generateSteps } from './steps';

// A4 portrait, in millimeters
const PAGE_W = 210;
const PAGE_H = 297;
const MARGIN = 15;
const INNER = PAGE_W - 2 * MARGIN;

const INK: [number, number, number] = [62, 44, 28];
const SOFT: [number, number, number] = [128, 108, 90];
const GREEN: [number, number, number] = [95, 174, 46];
const CARD: [number, number, number] = [246, 239, 227];

export interface NoticeOptions {
  /** Name of the model, printed on the cover and at the bottom of each page. */
  name: string;
  pieces: readonly PieceSpec[];
  /** Picture of each piece type (PNG data URLs), for the parts lists. */
  thumbs: Record<string, string>;
  onProgress?: (done: number, total: number) => void;
}

/** Piece types in the order of the box, with how many of each. */
function partsOf(steps: Step[]): [string, number][] {
  const counts = countPieces(steps);
  return CATALOG.filter((d) => counts.has(d.id)).map((d) => [d.id, counts.get(d.id)!]);
}

// the built-in PDF fonts only know Latin-1
const latin1 = (s: string) => s.replace(/[^\x20-\x7e\xa0-\xff]/g, '?');

function fileName(name: string) {
  const slug = name
    .normalize('NFD')
    .replace(/[^\w\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .toLowerCase();
  return `instructions-${slug || 'chalet'}.pdf`;
}

/** A piece picture and its count; returns nothing, draws at (x, y) in a box `size` high. */
function part(doc: jsPDF, thumbs: Record<string, string>, type: string, n: number, x: number, y: number, size: number, withName: boolean) {
  const img = thumbs[type];
  if (img) doc.addImage(img, 'PNG', x, y, size, size, `piece-${type}`, 'FAST');
  const tx = x + size + 2;
  doc.setTextColor(...INK);
  doc.setFont('helvetica', 'bold');
  if (withName) {
    doc.setFontSize(13);
    doc.text(`×${n}`, tx, y + size / 2 - 0.5);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9.5);
    doc.setTextColor(...SOFT);
    doc.text(getDef(type).name, tx, y + size / 2 + 4.5);
  } else {
    doc.setFontSize(12);
    doc.text(`×${n}`, tx, y + size / 2 + 1.5);
  }
}

function cover(doc: jsPDF, name: string, image: string, pieces: number, steps: number) {
  doc.setFillColor(...GREEN);
  doc.rect(0, 0, PAGE_W, 12, 'F');
  doc.setTextColor(...SOFT);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(14);
  doc.text('BUILDING INSTRUCTIONS', PAGE_W / 2, 38, { align: 'center', charSpace: 1.2 });
  doc.setTextColor(...INK);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(36);
  const title = doc.splitTextToSize(name, INNER) as string[];
  doc.text(title.slice(0, 2), PAGE_W / 2, 56, { align: 'center' });

  const h = (INNER * COVER_SIZE.h) / COVER_SIZE.w;
  doc.addImage(image, 'JPEG', MARGIN, 84, INNER, h, 'cover', 'FAST');

  doc.setFontSize(18);
  doc.text(`${pieces} piece${pieces > 1 ? 's' : ''}  ·  ${steps} step${steps > 1 ? 's' : ''}`, PAGE_W / 2, 84 + h + 18, { align: 'center' });
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.setTextColor(...SOFT);
  doc.text(`Wooden chalet · ${new Date().toLocaleDateString('en-GB', { dateStyle: 'long' })}`, PAGE_W / 2, PAGE_H - 16, { align: 'center' });
  doc.setFillColor(...GREEN);
  doc.rect(0, PAGE_H - 8, PAGE_W, 8, 'F');
}

function heading(doc: jsPDF, text: string, y: number) {
  doc.setTextColor(...INK);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(22);
  doc.text(text, MARGIN, y);
}

function inventory(doc: jsPDF, parts: [string, number][], thumbs: Record<string, string>, total: number) {
  const COLS = 3;
  const CELL_W = INNER / COLS;
  const CELL_H = 25;
  const TOP = 42;
  const perPage = COLS * Math.floor((PAGE_H - TOP - 20) / CELL_H);
  parts.forEach(([type, n], i) => {
    const k = i % perPage;
    if (k === 0) {
      doc.addPage();
      heading(doc, 'What you need', 26);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(11);
      doc.setTextColor(...SOFT);
      doc.text(`${total} pieces`, MARGIN, 33);
    }
    const x = MARGIN + (k % COLS) * CELL_W;
    const y = TOP + Math.floor(k / COLS) * CELL_H;
    doc.setFillColor(...CARD);
    doc.roundedRect(x, y, CELL_W - 3, CELL_H - 3, 3, 3, 'F');
    part(doc, thumbs, type, n, x + 2, y + 2, CELL_H - 7, true);
  });
}

function stepBlock(doc: jsPDF, n: number, step: Step, image: string, thumbs: Record<string, string>, y: number) {
  // number in a green disc, then the title
  doc.setFillColor(...GREEN);
  doc.circle(MARGIN + 6, y + 6, 6, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(n > 99 ? 10 : 14);
  doc.text(String(n), MARGIN + 6, y + 6, { align: 'center', baseline: 'middle' });
  doc.setTextColor(...INK);
  doc.setFontSize(16);
  doc.text(step.title, MARGIN + 16, y + 6, { baseline: 'middle' });

  const w = 156;
  const h = (w * STEP_SIZE.h) / STEP_SIZE.w;
  doc.addImage(image, 'JPEG', (PAGE_W - w) / 2, y + 14, w, h, `step-${n}`, 'FAST');

  // the pieces to take for this step
  const top = y + 14 + h + 3;
  doc.setFillColor(...CARD);
  doc.roundedRect(MARGIN, top, INNER, 16, 3, 3, 'F');
  const parts = partsOf([step]);
  const slot = Math.min(30, (INNER - 4) / parts.length);
  parts.forEach(([type, count], i) => part(doc, thumbs, type, count, MARGIN + 3 + i * slot, top + 2, 12, false));
}

function footers(doc: jsPDF, name: string) {
  const pages = doc.getNumberOfPages();
  for (let p = 2; p <= pages; p++) {
    doc.setPage(p);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(...SOFT);
    doc.text(name, MARGIN, PAGE_H - 9);
    doc.text(`${p} / ${pages}`, PAGE_W - MARGIN, PAGE_H - 9, { align: 'right' });
  }
}

/**
 * Builds the printable booklet of a free build (cover, parts list, one picture per
 * step) and downloads it. Returns false when the pictures can't be drawn (no WebGL).
 */
export async function exportNotice({ name, pieces, thumbs, onProgress }: NoticeOptions): Promise<boolean> {
  const steps = generateSteps(pieces);
  if (!steps.length) return false;
  // the PDF library is only loaded when a booklet is made
  const [{ jsPDF }, images] = await Promise.all([import('jspdf'), renderNotice(steps, onProgress)]);
  if (!images) return false;

  const title = latin1(name.trim()) || 'My chalet';
  const doc = new jsPDF({ unit: 'mm', format: 'a4', compress: true });
  doc.setProperties({ title: `${title} - building instructions` });

  cover(doc, title, images.cover, pieces.length, steps.length);
  inventory(doc, partsOf(steps), thumbs, pieces.length);
  const BLOCK = 130;
  steps.forEach((step, i) => {
    if (i % 2 === 0) doc.addPage();
    stepBlock(doc, i + 1, step, images.steps[i], thumbs, 18 + (i % 2) * BLOCK);
  });
  footers(doc, title);
  doc.save(fileName(title));
  return true;
}
