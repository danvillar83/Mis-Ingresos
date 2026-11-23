(() => {
  'use strict';
  const KEY = 'finanzas_mensajeria_v1';
  const $ = id => document.getElementById(id);
  const C = window.CsvTools;
  const now = () => new Date().toISOString();
  const uid = () => (globalThis.crypto?.randomUUID?.() || 'm-'+Date.now()+'-'+Math.random().toString(36).slice(2));
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const isMonth = v => /^\d{4}-(0[1-9]|1[0-2])$/.test(v);
  const isDate = v => /^\d{4}-(0[1-9]|1[0-2])-([0-2]\d|3[01])$/.test(v) && !Number.isNaN(Date.parse(v+'T12:00:00'));
  const isReturnLabel = detail => /^devoluci[oó]n(?:es)?$/i.test(String(detail||'').trim());
  const empty = () => ({version:1,records:[],taxByMonth:{}});
  let db = empty(), editId = null, pending = [], damagedStore = false;

  function load() {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) {
        const incoming = JSON.parse(raw);
        db = normalize(incoming);
        // Reclasificación semántica de v11/v12: solo cambia la categoría, no cifras ni identificadores.
        if (incoming.records.some((r,i)=>r.kind!==db.records[i].kind)) save();
      }
    } catch (err) {
      console.error(err);
      damagedStore = true;
      alert('No se pudieron leer los datos de mensajería. Se bloqueará el guardado para no sobrescribirlos. Restaura un respaldo JSON válido.');
      db = empty();
    }
  }
  function normalize(source) {
    if (!source || !Array.isArray(source.records) || !source.taxByMonth || typeof source.taxByMonth !== 'object') throw Error('Formato de respaldo empresarial no válido.');
    if (source.records.length > 250000) throw Error('El respaldo contiene demasiados movimientos.');
    const records = source.records.map(r => {
      if (!r || !isMonth(r.period) || !isDate(r.date) || !['day','pickup','return','extra','expense'].includes(r.kind)) throw Error('Movimiento con fecha o tipo inválido.');
      const income = C.integer(r.income), expense = C.integer(r.expense);
      if (income && expense) throw Error('Un movimiento no puede ser ingreso y egreso a la vez.');
      const detail=String(r.detail||'').slice(0,160);
      const kind=isReturnLabel(detail)&&['extra','pickup'].includes(r.kind)?'return':r.kind;
      return {id:String(r.id||uid()),period:r.period,date:r.date,kind,detail,income,expense,
        packages:Number.isSafeInteger(r.packages)&&r.packages>=0?r.packages:0,category:String(r.category||'Otros').slice(0,60),iec:C.integer(r.iec||0),
        sourceKey:String(r.sourceKey||''),sourceFile:String(r.sourceFile||''),originalDate:String(r.originalDate||''),createdAt:String(r.createdAt||now())};
    });
    return {version:1,records,taxByMonth:source.taxByMonth};
  }
  function save() {
    if(damagedStore){alert('Guardado bloqueado: primero restaura un respaldo JSON de la empresa para proteger tus datos anteriores.');return false}
    try {localStorage.setItem(KEY,JSON.stringify(db));return true;}
    catch(err) {console.error(err);alert('No se pudo guardar la empresa en este dispositivo. Descarga un respaldo y revisa el almacenamiento.');return false;}
  }
  function month() {return $('monthPicker').value || new Date().toISOString().slice(0,7)}
  function dataForMonth() {return db.records.filter(r=>r.period===month())}
  function money(n) {return C.money(n)}
  function sum(arr,field) {return arr.reduce((acc,x)=>acc+x[field],0)}
  function notify(msg) {const toast=$('toast');toast.textContent=msg;toast.hidden=false;setTimeout(()=>toast.hidden=true,3600)}
  function defaultDate() {
    const d = new Date(), local = d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
    return local.startsWith(month()) ? local : month()+'-01';
  }
  function resetForm() {
    editId=null;$('bizFormTitle').textContent='Registrar movimiento';$('bizSave').textContent='Guardar movimiento';$('bizCancelEdit').hidden=true;
    $('bizDate').value=defaultDate();$('bizType').value='day';$('bizDesc').value='';$('bizAmount').value='';$('bizPackageCount').value='';$('bizCategory').value='Combustible';$('bizIec').value='';
  }
  function saveRecord() {
    const date=$('bizDate').value,kind=$('bizType').value,detail=$('bizDesc').value.trim(), amount=Number($('bizAmount').value),pkgs=$('bizPackageCount').value===''?0:Number($('bizPackageCount').value),iec=$('bizIec').value===''?0:Number($('bizIec').value);
    if (!isDate(date) || !date.startsWith(month())) {notify('La fecha debe estar dentro del mes seleccionado.');return}
    if (!detail || !Number.isSafeInteger(amount) || amount<0 || !Number.isSafeInteger(pkgs) || pkgs<0 || !Number.isSafeInteger(iec) || iec<0 || (!amount&&!pkgs)) {notify('Completa la descripción y valores válidos.');return}
    if (iec && kind!=='expense') {notify('El impuesto específico solo corresponde a egresos.');return}
    const old = db.records.find(x=>x.id===editId);
    const r={id:old?.id||uid(),period:month(),date,kind,detail,income:kind==='expense'?0:amount,expense:kind==='expense'?amount:0,packages:pkgs,
      category:kind==='expense'?$('bizCategory').value:'Ingresos',iec:kind==='expense'?iec:0,sourceKey:old?.sourceKey||'',sourceFile:old?.sourceFile||'',originalDate:old?.originalDate||'',createdAt:old?.createdAt||now()};
    if(old)Object.assign(old,r);else db.records.push(r);
    if(!save())return;
    resetForm();render();notify(old?'Movimiento actualizado.':'Movimiento registrado.');
  }
  function editRecord(id) {
    const r=db.records.find(x=>x.id===id);if(!r)return;
    editId=id;$('bizFormTitle').textContent='Editar movimiento';$('bizSave').textContent='Guardar cambios';$('bizCancelEdit').hidden=false;
    $('bizDate').value=r.date.startsWith(r.period)?r.date:r.period+'-01';$('bizType').value=r.kind;$('bizDesc').value=r.detail;
    $('bizAmount').value=r.kind==='expense'?r.expense:r.income;$('bizPackageCount').value=r.packages||'';$('bizCategory').value=['Combustible','Peajes/TAG','Mantención','Insumos','Otros'].includes(r.category)?r.category:'Otros';$('bizIec').value=r.iec||'';
    $('bizDate').focus();window.scrollTo({top:0,behavior:'smooth'});
  }
  function deleteRecord(id) {
    const r=db.records.find(x=>x.id===id);if(!r||!confirm('¿Eliminar el movimiento «'+r.detail+'» de '+money(r.income||r.expense)+'?'))return;
    db.records=db.records.filter(x=>x.id!==id);if(editId===id)resetForm();if(save())render();
  }
  function taxForMonth() {
    if(!db.taxByMonth[month()])db.taxByMonth[month()]={salesMode:'',debit:null,credit:null,remanent:null,ppmRate:0.3,ppmBase:null};
    return db.taxByMonth[month()];
  }
  function nullableMoney(value) {if(value===''||value==null)return null;const n=Number(value);return Number.isSafeInteger(n)&&n>=0?n:null}
  function taxInputs(tax, totalIncome) {
    const mode=tax.salesMode||'';
    $('bizSalesMode').value=mode;
    const estimatedDebit=mode==='gross'?Math.round(totalIncome*19/119):mode==='net'?Math.round(totalIncome*0.19):null;
    $('bizVatDebit').disabled=mode==='gross'||mode==='net';$('bizVatDebit').value=estimatedDebit===null?(tax.debit??''):estimatedDebit;
    $('bizVatCredit').value=tax.credit??'';$('bizRemainder').value=tax.remanent??'';
    $('bizPpmRate').value=tax.ppmRate??0.3;
    const estimatedBase=mode==='gross'?Math.round(totalIncome*100/119):mode==='net'?totalIncome:null;
    $('bizPpmBase').disabled=estimatedBase!==null;$('bizPpmBase').value=estimatedBase===null?(tax.ppmBase??''):estimatedBase;
    const debit=estimatedDebit===null?tax.debit:estimatedDebit,base=estimatedBase===null?tax.ppmBase:estimatedBase;
    const ready=(mode!=='' && debit!==null && tax.credit!==null && tax.remanent!==null && base!==null && Number.isFinite(tax.ppmRate));
    $('bizVatPay').textContent=ready?money(Math.max(0,debit-tax.credit-tax.remanent)):'Por completar';
    $('bizTaxPay').textContent=ready?money(Math.max(0,debit-tax.credit-tax.remanent)+Math.round(base*tax.ppmRate/100)):'Por completar';
    const cautions=[];
    if(!ready)cautions.push('Falta clasificar los ingresos o completar IVA crédito, remanente y base PPM (escribe 0 si no corresponde).');
    if(mode==='gross'||mode==='net')cautions.push('El IVA de ventas es teórico: supone que todos los ingresos registrados del mes están afectos al 19% y usan el criterio seleccionado.');
    if(ready)cautions.push('Estimación F29 parcial: IVA + PPM; no considera otros impuestos, retenciones o ajustes. Revisa contra SII.');
    cautions.push('El IVA del combustible y su impuesto específico no se acreditan automáticamente. Verifica la situación del vehículo y la factura.');
    $('bizTaxNote').textContent=cautions.join(' ');
  }
  function render() {
    const rows=dataForMonth(),income=sum(rows,'income'),expense=sum(rows,'expense'),fuel=rows.filter(r=>r.category==='Combustible'),shownFilter=$('bizFilter').value;
    $('bizDeliveryIncome').textContent=money(sum(rows.filter(r=>r.kind==='day'),'income'));
    $('bizPickupIncome').textContent=money(sum(rows.filter(r=>r.kind==='pickup'),'income'));
    $('bizReturnIncome').textContent=money(sum(rows.filter(r=>r.kind==='return'),'income'));
    $('bizOtherIncome').textContent=money(sum(rows.filter(r=>r.kind==='extra'),'income'));
    $('bizIncome').textContent=money(income);$('bizExpense').textContent=money(expense);$('bizProfit').textContent=money(income-expense);$('bizFuel').textContent=money(sum(fuel,'expense'));
    $('bizPackages').textContent=rows.reduce((n,r)=>n+r.packages,0)+' paquetes identificados';
    $('bizImportStatus').textContent=db.records.length?'Historial empresarial: '+db.records.length+' movimientos registrados en total. En este mes: '+rows.length+'. Los documentos tributarios deben revisarse aparte.':'Importa los reportes CSV de mensajería para cargar tu historial. Los gastos del hogar permanecen intactos.';
    const ordered=rows.filter(r=>shownFilter==='all'||(shownFilter==='income'?r.kind!=='expense':r.kind===shownFilter)).sort((a,b)=>b.date.localeCompare(a.date)||b.createdAt.localeCompare(a.createdAt));
    $('bizCount').textContent=String(ordered.length);
    $('bizList').innerHTML=ordered.length?ordered.map(r=>`<div class="item"><div><h3>${esc(r.detail)}</h3><small>${esc(r.date)}${r.originalDate&&r.originalDate!==r.date?' · Fecha original: '+esc(r.originalDate):''}${r.sourceFile?' · '+esc(r.sourceFile):''}</small><div class="tags"><span class="tag">${r.kind==='expense'?'Egreso':r.kind==='pickup'?'Retiro':r.kind==='return'?'Devolución':r.kind==='extra'?'Otros ingresos':'Entrega'}</span>${r.packages?`<span class="tag">${r.packages} paquetes</span>`:''}${r.kind==='expense'?`<span class="tag">${esc(r.category)}</span>`:''}${r.iec?`<span class="tag">IEC: ${money(r.iec)}</span>`:''}</div></div><div class="right"><strong class="${r.kind==='expense'?'negative':'positive'}">${r.kind==='expense'?'-':'+'}${money(r.income||r.expense)}</strong><div class="actions"><button class="secondary" type="button" data-act="edit" data-id="${esc(r.id)}">Editar</button><button class="secondary dangerbtn" type="button" data-act="delete" data-id="${esc(r.id)}">Eliminar</button></div></div></div>`).join(''):'<div class="empty">No hay movimientos de este tipo para el mes seleccionado.</div>';
    taxInputs(taxForMonth(),income);
  }

  function packageCount(detail) {const m=String(detail).match(/(\d+)\s*paq(?:uetes)?\b/i);return m?Number(m[1]):0}
  function importSourceKey(file,line,raw) {return 'reporte:'+file.toLowerCase()+':'+line+':'+[raw.Fecha,raw.Tipo,raw.Nota,raw.Ingreso,raw.Egreso].join('|')}
  function parseReport(file,text) {
    const match=/^reporte_(\d{4}-(?:0[1-9]|1[0-2]))\.csv$/i.exec(file);
    if(!match)throw Error('Nombre de archivo no reconocido: '+file+'. Se espera reporte_AAAA-MM.csv');
    const reportMonth=match[1],parsed=C.parse(text,',');
    for(const name of ['Fecha','Tipo','Nota','Ingreso','Egreso'])if(!parsed.header.includes(name))throw Error(file+': falta la columna '+name);
    let anomalous=0,zero=0;
    const rows=[];
    for(const {line,data:r} of C.rowsAsObjects(parsed)) {
      let originalDate=r.Fecha, date=r.Fecha, kind=r.Tipo, detail=r.Nota, income=C.integer(r.Ingreso),expense=C.integer(r.Egreso),packages=packageCount(detail);
      const legacy=isMonth(r.Fecha)&&isDate(r.Tipo)&&/^\d+$/.test(detail);
      if(legacy) {
        // Exportación anterior: la fecha está desplazada a la segunda columna; Nota contiene los paquetes.
        date=r.Tipo;originalDate=date;kind='day';packages=Number(detail);detail=packages+' paquetes (ingreso no informado)';anomalous++;zero++;
      }
      if(!isDate(date)||!['day','pickup','return','extra','expense'].includes(kind)||income&&expense)throw Error(file+': fila '+line+' con fecha, tipo o montos incompatibles.');
      if(kind==='extra'&&isReturnLabel(detail))kind='return';
      if(!date.startsWith(reportMonth))anomalous++;
      if(!income&&!expense&&!packages&&!legacy)zero++;
      const category=kind!=='expense'?'Ingresos':/gasol|benc|combust|di[eé]sel|petr[oó]leo/i.test(detail)?'Combustible':/tag|peaje/i.test(detail)?'Peajes/TAG':'Otros';
      rows.push({id:uid(),period:reportMonth,date,originalDate,kind,detail:detail.slice(0,160),income,expense,packages,category,iec:0,
        sourceKey:importSourceKey(file,line,r),sourceFile:file,createdAt:now()});
    }
    return {file,rows,anomalous,zero};
  }
  async function previewImport(files) {
    pending=[];$('bizConfirmImport').hidden=true;$('bizPreview').hidden=true;
    if(!files.length)return;
    try {
      if(files.length>24)throw Error('Selecciona 24 archivos o menos.');
      const reports=[];
      for(const file of files){if(file.size>3*1024*1024)throw Error(file.name+' supera el máximo de 3 MB.');reports.push(parseReport(file.name,await file.text()))}
      const existingKeys=new Set(db.records.map(r=>r.sourceKey).filter(Boolean));
      const seenKeys=new Set();let repeated=0;
      for(const report of reports)for(const r of report.rows){if(existingKeys.has(r.sourceKey)||seenKeys.has(r.sourceKey))repeated++;else{pending.push(r);seenKeys.add(r.sourceKey)}}
      const irregular=reports.reduce((s,r)=>s+r.anomalous,0),empty=reports.reduce((s,r)=>s+r.zero,0);
      $('bizPreview').textContent=reports.length+' archivos revisados.\n'+pending.length+' movimientos nuevos para importar.\n'+repeated+' registros ya importados o repetidos.\n'+irregular+' filas con formato o fecha irregular.\n'+empty+' filas sin importe monetario (se conservan paquetes cuando existen).\nIngresos nuevos: '+money(sum(pending,'income'))+' · Egresos nuevos: '+money(sum(pending,'expense'))+'.\nLos meses se tomarán del nombre de cada archivo; la fecha original seguirá visible.';
      $('bizPreview').hidden=false;$('bizConfirmImport').hidden=pending.length===0;
    }catch(err){pending=[];$('bizPreview').textContent='No se pudo preparar la importación: '+err.message;$('bizPreview').hidden=false;$('bizConfirmImport').hidden=true}
  }
  function confirmImport() {
    if(!pending.length)return;
    const count=pending.length;
    if(!confirm('¿Incorporar '+count+' movimientos empresariales? No se modificará el hogar ni se reemplazarán registros previos.'))return;
    const before=db.records.length;db.records.push(...pending);
    if(!save()){db.records.length=before;return}
    pending=[];$('bizFiles').value='';$('bizPreview').hidden=true;$('bizConfirmImport').hidden=true;render();alert('Importación completada: '+count+' movimientos incorporados. Descarga ahora un respaldo JSON de la empresa.');
  }
  function exportBackup() {C.download('respaldo-mensajeria-'+month()+'.json',JSON.stringify(db,null,2),'application/json;charset=utf-8');notify('Respaldo empresarial descargado.')}
  async function restoreBackup(file) {
    if(!file)return;
    try {
      if(file.size>20*1024*1024)throw Error('El respaldo supera los 20 MB.');
      const incoming=normalize(JSON.parse(await file.text()));
      if(!confirm('El respaldo contiene '+incoming.records.length+' movimientos. Restaurar reemplazará SOLO los registros de la empresa guardados en este navegador. ¿Ya hiciste una copia?'))return;
      const previous=db, previousDamage=damagedStore;db=incoming;damagedStore=false;
      if(!save()){db=previous;damagedStore=previousDamage;return}
      resetForm();render();notify('Respaldo empresarial restaurado.');
    }catch(err){alert('No se pudo restaurar el respaldo: '+err.message)}
    finally{$('bizRestoreFile').value=''}
  }
  function exportCsv() {
    const cols=['Mes','Fecha','Tipo','Nota','Ingreso','Egreso','Paquetes','Categoría','Impuesto específico','Archivo origen','Fecha original'];
    const rows=[cols,...db.records.map(r=>[r.period,r.date,r.kind,r.detail,r.income,r.expense,r.packages,r.category,r.iec,r.sourceFile,r.originalDate])];
    C.download('movimientos-mensajeria-'+month()+'.csv','\uFEFF'+rows.map(row=>row.map(C.csvCell).join(';')).join('\r\n'));notify('CSV empresarial descargado.');
  }
  function storeTax(id,key) {
    const t=taxForMonth();const el=$(id);
    if(key==='salesMode')t.salesMode=el.value;
    else if(key==='ppmRate') {const n=Number(el.value);if(!Number.isFinite(n)||n<0||n>100){notify('Tasa PPM inválida.');return}t[key]=n;}
    else {const n=nullableMoney(el.value);if(el.value!==''&&n===null){notify('Monto de impuestos inválido.');return}t[key]=n;}
    if(save())render();
  }

  $('bizSave').addEventListener('click',saveRecord);$('bizCancelEdit').addEventListener('click',resetForm);
  $('bizList').addEventListener('click',e=>{const button=e.target.closest('button[data-act]');if(!button)return;if(button.dataset.act==='edit')editRecord(button.dataset.id);else if(button.dataset.act==='delete')deleteRecord(button.dataset.id)});
  $('bizFilter').addEventListener('change',render);
  $('bizFiles').addEventListener('change',e=>previewImport([...e.target.files]));$('bizConfirmImport').addEventListener('click',confirmImport);
  $('bizBackup').addEventListener('click',exportBackup);$('bizRestoreButton').addEventListener('click',()=>$('bizRestoreFile').click());$('bizRestoreFile').addEventListener('change',e=>restoreBackup(e.target.files[0]));$('bizExportCsv').addEventListener('click',exportCsv);
  for(const [id,key] of [['bizSalesMode','salesMode'],['bizVatDebit','debit'],['bizVatCredit','credit'],['bizRemainder','remanent'],['bizPpmRate','ppmRate'],['bizPpmBase','ppmBase']])$(id).addEventListener('change',()=>storeTax(id,key));
  $('monthPicker').addEventListener('change',()=>{resetForm();render()});
  document.querySelector('[data-tab="empresa"]').addEventListener('click',render);
  load();resetForm();render();
  window.FinanzasEmpresaTest = Object.freeze({parseReport, getData:()=>JSON.parse(JSON.stringify(db))});
})();
