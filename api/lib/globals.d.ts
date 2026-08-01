import type SwalType from "sweetalert2";
// ExcelJS, not SheetJS (neither the stock "xlsx" package nor the "xlsx-js-style" fork tried
// before it) — see export.ts for why: it's the only one of the three whose writer actually
// emits frozen-pane XML, on top of the cell-style/number-format support the others also have.
import type * as ExcelJSType from "exceljs";
import type { Chart as ChartType } from "chart.js";

declare global {
  interface Window {
    Swal: typeof SwalType;
    ExcelJS: typeof ExcelJSType;
    Chart: typeof ChartType;
  }
}
