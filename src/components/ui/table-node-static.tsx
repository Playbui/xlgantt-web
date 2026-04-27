import * as React from 'react';

import type { TTableCellElement, TTableElement } from 'platejs';
import type { SlateElementProps } from 'platejs/static';

import { BaseTablePlugin, type BorderDirection } from '@platejs/table';
import { SlateElement } from 'platejs/static';

import { cn } from '@/lib/utils';

type TableCellBorder = {
  color?: string;
  size?: number;
  style?: string;
};

function getCellBorderStyle(
  borders?: Partial<Record<BorderDirection, TableCellBorder>>
): React.CSSProperties {
  const getBorder = (direction: BorderDirection) => borders?.[direction];
  const getSize = (direction: BorderDirection) =>
    `${getBorder(direction)?.size ?? 1}px`;
  const getStyle = (direction: BorderDirection) =>
    getBorder(direction)?.style ?? 'solid';
  const getColor = (direction: BorderDirection) =>
    getBorder(direction)?.color;

  return {
    borderBottomColor: getColor('bottom'),
    borderBottomStyle: getStyle('bottom'),
    borderBottomWidth: getSize('bottom'),
    borderLeftColor: getColor('left'),
    borderLeftStyle: getStyle('left'),
    borderLeftWidth: getSize('left'),
    borderRightColor: getColor('right'),
    borderRightStyle: getStyle('right'),
    borderRightWidth: getSize('right'),
    borderTopColor: getColor('top'),
    borderTopStyle: getStyle('top'),
    borderTopWidth: getSize('top'),
  } as React.CSSProperties;
}

export function TableElementStatic({
  children,
  ...props
}: SlateElementProps<TTableElement>) {
  const { disableMarginLeft } = props.editor.getOptions(BaseTablePlugin);
  const marginLeft = disableMarginLeft ? 0 : props.element.marginLeft;

  return (
    <SlateElement
      {...props}
      className="overflow-visible py-5"
      style={{ paddingLeft: marginLeft }}
    >
      <div className="group/table relative w-fit">
        <table
          className="mr-0 ml-px table h-px table-fixed border-collapse"
          style={{ borderCollapse: 'collapse', width: '100%' }}
        >
          <tbody className="min-w-full">{children}</tbody>
        </table>
      </div>
    </SlateElement>
  );
}

export function TableRowElementStatic(props: SlateElementProps) {
  return (
    <SlateElement {...props} as="tr" className="h-full">
      {props.children}
    </SlateElement>
  );
}

export function TableCellElementStatic({
  isHeader,
  ...props
}: SlateElementProps<TTableCellElement> & {
  isHeader?: boolean;
}) {
  const { editor, element } = props;
  const { api } = editor.getPlugin(BaseTablePlugin);

  const { minHeight, width } = api.table.getCellSize({ element });
  const borders = api.table.getCellBorders({ element });

  return (
    <SlateElement
      {...props}
      as={isHeader ? 'th' : 'td'}
      className={cn(
        'h-full overflow-visible border border-border/70 bg-background p-0',
        element.background && 'bg-(--cellBackground)',
        isHeader && 'text-left font-normal *:m-0',
        borders &&
          cn(
            borders.bottom?.size && 'border-b-border',
            borders.right?.size && 'border-r-border',
            borders.left?.size && 'border-l-border',
            borders.top?.size && 'border-t-border'
          )
      )}
      style={
        {
          '--cellBackground': element.background,
          backgroundColor: element.background,
          ...getCellBorderStyle(borders),
          maxWidth: width || 240,
          minWidth: width || 120,
        } as React.CSSProperties
      }
      attributes={{
        ...props.attributes,
        colSpan: api.table.getColSpan(element),
        rowSpan: api.table.getRowSpan(element),
      }}
    >
      <div
        className="relative z-20 box-border h-full px-4 py-2"
        style={{ minHeight }}
      >
        {props.children}
      </div>
    </SlateElement>
  );
}

export function TableCellHeaderElementStatic(
  props: SlateElementProps<TTableCellElement>
) {
  return <TableCellElementStatic {...props} isHeader />;
}
