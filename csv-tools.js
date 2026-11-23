/* Lector CSV local: admite UTF-8 con BOM, comillas, campos multilínea y ; o ,. */
(() => {
  'use strict';
  function parse(input, delimiter) {
    const str = String(input || '').replace(/^\uFEFF/, '');
    if (!delimiter) {
      const first = str.split(/\r?\n/, 1)[0];
      delimiter = (first.match(/;/g) || []).length > (first.match(/,/g) || []).length ? ';' : ',';
    }
    const rows = [];
    let row = [], field = '', quoted = false;
    for (let i = 0; i < str.length; i++) {
      const ch = str[i];
      if (ch === '"') {
        if (quoted && str[i + 1] === '"') { field += '"'; i++; }
        else if (!quoted && field === '') quoted = true;
        else if (quoted) quoted = false;
        else field += ch;
      } else if (ch === delimiter && !quoted) {
        row.push(field); field = '';
      } else if ((ch === '\r' || ch === '\n') && !quoted) {
        if (ch === '\r' && str[i + 1] === '\n') i++;
        row.push(field); field = '';
        if (row.some(x => x.trim() !== '')) rows.push(row);
        row = [];
      } else {
        field += ch;
      }
    }
    if (quoted) throw new Error('El CSV contiene comillas sin cerrar.');
    row.push(field);
    if (row.some(x => x.trim() !== '')) rows.push(row);
    if (!rows.length) throw new Error('El CSV está vacío.');
    const header = rows.shift().map(h => h.replace(/^\uFEFF/, '').trim());
    return {header, rows: rows.map((values, i) => ({values, line: i + 2})), delimiter};
  }
  function rowsAsObjects(parsed) {
    return parsed.rows.map(({values, line}) => {
      if (values.length !== parsed.header.length) throw new Error('Fila ' + line + ': columnas inconsistentes.');
      return {line, data: Object.fromEntries(parsed.header.map((name, j) => [name, values[j].trim()]))};
    });
  }
  function money(value) {
    return new Intl.NumberFormat('es-CL', {style: 'currency', currency: 'CLP', maximumFractionDigits: 0}).format(value || 0);
  }
  function integer(value) {
    if (value === '' || value == null) return 0;
    const n = Number(String(value).trim().replace(/\s/g, ''));
    if (!Number.isSafeInteger(n) || n < 0) throw new Error('Monto inválido: ' + String(value).slice(0, 32));
    return n;
  }
  function csvCell(value) {
    let text = String(value ?? '');
    if (/^[=+@-]/.test(text)) text = "'" + text;
    return '"' + text.replace(/"/g, '""') + '"';
  }
  function download(filename, text, mime = 'text/csv;charset=utf-8') {
    const blob = new Blob([text], {type: mime});
    const url = URL.createObjectURL(blob), a = document.createElement('a');
    a.href = url; a.download = filename; document.body.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  }
  window.CsvTools = Object.freeze({parse, rowsAsObjects, money, integer, csvCell, download});
})();
