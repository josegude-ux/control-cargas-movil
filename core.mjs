// Lector por coordenadas para hojas de carga VolDistribución.
// Los formatos pueden incluir cantidades decimales (por ejemplo KG).
const numeric = raw => raw==null ? null : Number(String(raw).trim().replace(/\./g,'').replace(',','.'));
const isQty = text => /^\d+(?:[,.]\d+)?$/.test(String(text).trim());
const validQty = val => typeof val==='number' && Number.isFinite(val) && val>=0;
export function parseDocumentPages(pages, fileName='Documento.pdf') {
 // Business Central puede incluir varios almacenes dentro del MISMO LP.
 // La preparación de Coruña corresponde exclusivamente a COR_01_COR.
 const warehouseOf=page=>{
  const line=page.items.map(it=>it.text||'').join(' ');
  const hit=line.match(/Almac[eé]n\s*:\s*(COR[\s_-]*0?\d{1,2}[\s_-]*[A-Z]{2,})/i);
  if(!hit)return null;
  const cleaned=hit[1].toUpperCase().replace(/[\s-]+/g,'_').replace(/_+/g,'_');
  return cleaned.replace(/^COR_1_/,'COR_01_').replace(/^COR_2_/,'COR_02_');
 };
 const identified=pages.map(warehouseOf);
 const warehouses=[...new Set(identified.filter(Boolean))];
 const mixedWarehouse=warehouses.length>1;
 if(warehouses.length){
  let active=null;
  pages=pages.filter((page,index)=>{
   if(identified[index])active=identified[index];
   return active==='COR_01_COR';
  });
 }
 const every=pages.flatMap(p=>p.items.map(it=>({...it,page:p.number})));
 const textAll=every.map(i=>i.text).join(' ').replace(/\s+/g,' ');
 const extract=(regexp,source=textAll)=>source.match(regexp)?.[1]??null;
 let id=extract(/\b(LP\s*\d{2}\s*[-–]\s*\d{4,6})\b/i);
 if(!id)id=(fileName.match(/LP\d{2}[-_ ]\d{4,6}/i)||[])[0];
 id=(id||fileName.replace(/\.pdf$/i,'')).replace(/\s+/g,'').replace('_','-');
 const weight=numeric(extract(/Peso\s*carga\s*:?\s*([\d.]+,\d+|\d+(?:\.\d+)?)/i));
 const refs=numeric(extract(/Total\s*referencias\s*prod\.?\s*:?\s*(\d+)/i));
 const visits=numeric(extract(/N[º°o.]?\s*visitas\s*:?\s*(\d+)/i));
 const driver=(extract(/Repartidor\s*:\s*(.{1,65}?)(?=N[º°o.]?\s*copias|N[º°o.]?\s*visitas|Peso\s*carga|Almac[eé]n|$)/i)||'').trim();
 const plate=extract(/Matr[ií]cula\s*:?\s*([A-Z0-9-]{5,12})/i)||extract(/Cami[oó]n\s*:\s*CR(\d{4}[A-Z]{3})/i)||'';
 const date=extract(/Fecha\s*carga\s*:\s*(\d{2}\/\d{2}\/\d{2,4})/i);
 let merchandise=false,declaredTotal=null;
 const products=[],warnings=[];
 for(const page of pages){
  const items=page.items.filter(it=>it.text&&it.text.trim()).sort((a,b)=>a.y-b.y||a.x-b.x);
  const goodsTitle=items.find(it=>/M\s*E\s*R\s*C\s*A\s*N\s*C\s*[IÍ]\s*A/i.test(it.text));
  if(goodsTitle)merchandise=true;
  const refsLabel=items.find(it=>/Total\s+referencias\s+prod/i.test(it.text));
  const controlLabel=items.find(it=>/C\s*O\s*N\s*T\s*R\s*O\s*L\s*\s*E\s*N\s*V\s*A\s*S\s*E\s*S/i.test(it.text));
  const palletsLabel=items.find(it=>/P\s*A\s*L\s*E\s*T\s*S/i.test(it.text));
  if(!merchandise&&page.number===1&&refsLabel)merchandise=true;
  if(!merchandise)continue;
  const stop=Math.min(refsLabel?.y??Infinity,controlLabel?.y??Infinity,palletsLabel?.y??Infinity);
  const begin=goodsTitle?goodsTitle.y+2:0;
  const zone=items.filter(it=>it.y>=begin&&it.y<stop);
  const rows=[];
  for(const i of zone){
   if(i.x>page.width*.4)continue;
   const hit=i.text.match(/\bPRD\d{7}\b/i);
   if(!hit)continue;
   // Ubicación estandar y variante impresa K109-3 (pertenece al pasillo K).
   const locPattern=/\b([A-Z]\d{2}-P\d{2}|[A-Z]\d{3}-\d|ZFRIO)\b/i;
   const prev=zone.filter(p=>p.x<i.x+3&&Math.abs(p.y-i.y)<8).map(p=>p.text).join(' ');
   const loc=(i.text.match(locPattern)||[])[0]||(prev.match(locPattern)||[])[0]||'';
   rows.push({sku:hit[0].toUpperCase(),location:loc.toUpperCase(),y:i.y});
  }
  rows.sort((a,b)=>a.y-b.y);
  const unique=[];
  for(const row of rows){if(!unique.some(v=>v.sku===row.sku&&Math.abs(v.y-row.y)<5))unique.push(row)}
  for(let n=0;n<unique.length;n++){
   const r=unique[n];
   const top=n?(unique[n-1].y+r.y)/2:r.y-8;
   const bottom=n+1<unique.length?(r.y+unique[n+1].y)/2:Math.min(stop,r.y+45);
   const cells=zone.filter(i=>i.y>=top&&i.y<bottom);
   const amounts=cells.filter(i=>i.x>page.width*.68&&i.x<page.width*.83&&isQty(i.text)).sort((a,b)=>Math.abs(a.y-r.y)-Math.abs(b.y-r.y));
   const qty=amounts.length?numeric(amounts[0].text):null;
   const units=cells.filter(i=>i.x>=page.width*.88).sort((a,b)=>a.y-b.y||a.x-b.x).map(i=>i.text.trim());
   const rawUnit=units.join('').toUpperCase().replace(/[^A-ZÁÉÍÓÚÑ]/g,'');
   let unit=rawUnit;
   if(/^BOTELLAS?$|^BOTELLA?$/.test(rawUnit))unit='BOTELLA';
   else if(/^PAQUETES?$/.test(rawUnit))unit='PAQUETE';
   else if(/^CAJAS?$/.test(rawUnit))unit='CAJA';
   else if(/^PACKS?$/.test(rawUnit))unit='PACK';
   else if(/^BOLSAS?$/.test(rawUnit))unit='BOLSA';
   else if(/^BARRILES?$/.test(rawUnit))unit='BARRIL';
   else if(/^PALETS?$/.test(rawUnit))unit='PALET';
   else if(/^KGS?$|^KILOS?$|^KILOGRAMOS?$/.test(rawUnit))unit='KG';
   const description=cells.filter(i=>i.x>page.width*.18&&i.x<page.width*.67).sort((a,b)=>a.y-b.y||a.x-b.x).map(i=>i.text.trim()).filter(Boolean).join(' ').replace(/\s+/g,' ');
   const product={...r,qty,unit,description};
   if(!validQty(qty)||!unit)warnings.push('Cantidad o unidad sin reconocer en '+r.sku);
   products.push(product);
  }
  if(refsLabel){
   const totalItem=items.find(i=>i.text.trim().toUpperCase()==='TOTAL:'&&Math.abs(i.y-refsLabel.y)<12);
   if(totalItem){const q=items.filter(i=>i.x>page.width*.68&&i.x<page.width*.78&&Math.abs(i.y-totalItem.y)<9&&isQty(i.text)).sort((a,b)=>Math.abs(a.y-totalItem.y)-Math.abs(b.y-totalItem.y))[0];if(q)declaredTotal=numeric(q.text)}
   merchandise=false;
  }else if(controlLabel||palletsLabel){merchandise=false}
 }
 if(warehouses.length&&!pages.length)warnings.push('El PDF no contiene mercancía de COR_01_COR');
 const sum=products.reduce((a,p)=>a+Number(p.qty||0),0);
 const countOK=refs!==null&&refs===products.length;
 const amountOK=declaredTotal===null?null:Math.abs(declaredTotal-sum)<0.000001;
 if(!countOK)warnings.push('Referencias detectadas: '+products.length+' / declaradas: '+(refs??'no consta'));
 if(amountOK===false)warnings.push('Suma detectada: '+sum.toFixed(3)+' / declarada: '+declaredTotal);
 if(declaredTotal===null)warnings.push('No se pudo contrastar el total del PDF');
 const verified=countOK&&amountOK===true&&warnings.length===0;
 return {id,weight,refs,visits,driver,plate,date,source:fileName,products,declaredTotal,actualTotal:sum,verified,warnings,warehouse:warehouses.length?'COR_01_COR':null,mixedWarehouse,availableWarehouses:warehouses};
}
export function summarize(products){
 const units={},aisles={},unlocated=[];
 for(const p of products){
  const qty=p.qty;
  if(!validQty(qty))continue;
  const unit=p.unit||'DESCONOCIDO';units[unit]=(units[unit]||0)+qty;
  const aisle=p.location==='ZFRIO'?'FRÍO':p.location?p.location[0]:'SIN UBICACIÓN';
  if(!aisles[aisle])aisles[aisle]={};aisles[aisle][unit]=(aisles[aisle][unit]||0)+qty;
  if(!p.location)unlocated.push(p);
 }
 return {units,aisles,unlocated};
}
