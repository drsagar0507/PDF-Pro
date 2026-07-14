import { useEffect, useState } from 'react';
import type { PageRef } from '../../lib/types';
import { getPdfjsDoc } from '../../lib/docCache';
import { nativeRectToDisplay, pageTotalRotation } from '../../lib/geometry';
import { useDocStore } from '../../store/useDocStore';

interface PdfjsFieldAnnotation {
  fieldType?: string;
  fieldName?: string;
  fieldValue?: string;
  rect: [number, number, number, number];
  checkBox?: boolean;
  radioButton?: boolean;
  buttonValue?: string;
  exportValue?: string;
  multiLine?: boolean;
  options?: { exportValue: string; displayValue: string }[];
  readOnly?: boolean;
  fontSize?: number;
}

interface Props {
  page: PageRef;
  sourceBytes: Uint8Array;
  zoom: number;
}

export default function FormFieldLayer({ page, sourceBytes, zoom }: Props) {
  const [fields, setFields] = useState<PdfjsFieldAnnotation[]>([]);
  const formValues = useDocStore((s) => s.formValues[page.sourceId]);
  const setFormValue = useDocStore((s) => s.setFormValue);
  const rotation = pageTotalRotation(page);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const doc = await getPdfjsDoc(page.sourceId, sourceBytes);
        const pdfjsPage = await doc.getPage(page.pageIndex + 1);
        const annots = (await pdfjsPage.getAnnotations({ intent: 'display' })) as PdfjsFieldAnnotation[];
        if (!cancelled) setFields(annots.filter((a) => !!a.fieldType && a.fieldName));
      } catch {
        if (!cancelled) setFields([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [page.sourceId, page.pageIndex, sourceBytes]);

  if (fields.length === 0) return null;

  return (
    <div className="pointer-events-none absolute inset-0">
      {fields.map((field, i) => {
        const [x0, y0, x1, y1] = field.rect;
        const box = nativeRectToDisplay(x0, y0, x1, y1, page.width, page.height, rotation);
        const style: React.CSSProperties = {
          position: 'absolute',
          left: box.x * zoom,
          top: box.y * zoom,
          width: box.width * zoom,
          height: box.height * zoom,
        };
        const fieldName = field.fieldName!;
        const current = formValues?.[fieldName];

        if (field.fieldType === 'Tx') {
          const value = (current?.value as string) ?? field.fieldValue ?? '';
          return (
            <div key={i} style={style} className="pointer-events-auto">
              {field.multiLine ? (
                <textarea
                  className="h-full w-full resize-none rounded-sm border border-indigo-400/70 bg-indigo-50/70 px-1 text-[11px] leading-tight text-neutral-900 outline-none focus:border-indigo-500 focus:bg-white dark:bg-indigo-950/40 dark:text-neutral-100"
                  style={{ fontSize: Math.max(9, (field.fontSize || 10) * zoom * 0.9) }}
                  defaultValue={value}
                  readOnly={field.readOnly}
                  onBlur={(e) => setFormValue(page.sourceId, fieldName, { type: 'text', value: e.target.value })}
                />
              ) : (
                <input
                  type="text"
                  className="h-full w-full rounded-sm border border-indigo-400/70 bg-indigo-50/70 px-1 text-[11px] text-neutral-900 outline-none focus:border-indigo-500 focus:bg-white dark:bg-indigo-950/40 dark:text-neutral-100"
                  style={{ fontSize: Math.max(9, (field.fontSize || 10) * zoom * 0.9) }}
                  defaultValue={value}
                  readOnly={field.readOnly}
                  onBlur={(e) => setFormValue(page.sourceId, fieldName, { type: 'text', value: e.target.value })}
                />
              )}
            </div>
          );
        }

        if (field.fieldType === 'Btn' && field.radioButton) {
          const checked = (current?.value as string) === (field.buttonValue ?? field.exportValue);
          return (
            <label key={i} style={style} className="pointer-events-auto flex items-center justify-center">
              <input
                type="radio"
                name={`${page.sourceId}:${fieldName}`}
                defaultChecked={checked}
                disabled={field.readOnly}
                className="h-full w-full cursor-pointer accent-indigo-600"
                onChange={() =>
                  setFormValue(page.sourceId, fieldName, {
                    type: 'radio',
                    value: field.buttonValue ?? field.exportValue ?? 'Yes',
                  })
                }
              />
            </label>
          );
        }

        if (field.fieldType === 'Btn' && field.checkBox) {
          const checked = current ? !!current.value : field.fieldValue === 'Yes' || field.fieldValue === 'On';
          return (
            <label key={i} style={style} className="pointer-events-auto flex items-center justify-center">
              <input
                type="checkbox"
                defaultChecked={checked}
                disabled={field.readOnly}
                className="h-full w-full cursor-pointer accent-indigo-600"
                onChange={(e) => setFormValue(page.sourceId, fieldName, { type: 'checkbox', value: e.target.checked })}
              />
            </label>
          );
        }

        if (field.fieldType === 'Ch') {
          const value = (current?.value as string) ?? field.fieldValue ?? '';
          return (
            <div key={i} style={style} className="pointer-events-auto">
              <select
                className="h-full w-full rounded-sm border border-indigo-400/70 bg-indigo-50/70 text-[11px] text-neutral-900 outline-none focus:border-indigo-500 dark:bg-indigo-950/40 dark:text-neutral-100"
                defaultValue={value}
                disabled={field.readOnly}
                onChange={(e) => setFormValue(page.sourceId, fieldName, { type: 'dropdown', value: e.target.value })}
              >
                <option value="" />
                {(field.options ?? []).map((opt) => (
                  <option key={opt.exportValue} value={opt.exportValue}>
                    {opt.displayValue}
                  </option>
                ))}
              </select>
            </div>
          );
        }

        return null;
      })}
    </div>
  );
}
