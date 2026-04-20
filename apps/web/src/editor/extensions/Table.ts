import { Table as BaseTable } from '@tiptap/extension-table';
import { TableRow as BaseRow } from '@tiptap/extension-table-row';
import { TableHeader as BaseHeader } from '@tiptap/extension-table-header';
import { TableCell as BaseCell } from '@tiptap/extension-table-cell';

const styleAttr = {
  style: {
    default: null as string | null,
    parseHTML: (el: HTMLElement) => el.getAttribute('style'),
    renderHTML: (attrs: { style?: string | null }) =>
      attrs.style ? { style: attrs.style } : {},
  },
};

export const Table = BaseTable;
export const TableRow = BaseRow;

export const TableHeader = BaseHeader.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      ...styleAttr,
    };
  },
});

export const TableCell = BaseCell.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      ...styleAttr,
    };
  },
});
