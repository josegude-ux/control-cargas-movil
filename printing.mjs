// Impresión del PDF original: únicamente MERCANCÍA, sin envases, palés ni firmas.
// Los PDF se almacenan localmente en IndexedDB, separados de los registros de preparación.
const DB_NAME='control_cargas_movil_originales', STORE='originales';
const openDB=()=>new Promise((resolve,reject)=>{
 const request=indexedDB.open(DB_NAME,1);
 request.onupgradeneeded=()=>{if(!request.result.objectStoreNames.contains(STORE))request.result.createObjectStore(STORE)};
 request.onsuccess=()=>resolve(request.result);
 request.onerror=()=>reject(request.error||new Error('No se puede abrir el almacén local de PDF'));
});
export async function guardarOriginal(id,file){
 if(!id||!file)throw new Error('Falta el PDF o su número de carga');
 const db=await openDB();
 return new Promise((resolve,reject)=>{
  const tx=db.transaction(STORE,'readwrite');
  tx.objectStore(STORE).put(file,id);
  tx.oncomplete=()=>{db.close();resolve(true)};
  tx.onerror=()=>{db.close();reject(tx.error||new Error('Sin espacio para almacenar el PDF'))};
  tx.onabort=()=>{db.close();reject(tx.error||new Error('Guardado cancelado'))};
 });
}
export async function borrarTodosOriginales(){
 const db=await openDB();
 return new Promise((resolve,reject)=>{
  const tx=db.transaction(STORE,'readwrite');
  tx.objectStore(STORE).clear();
  tx.oncomplete=()=>{db.close();resolve()};
  tx.onerror=()=>{db.close();reject(tx.error||new Error('No se pudieron eliminar los PDF'))};
  tx.onabort=()=>{db.close();reject(tx.error||new Error('Eliminación cancelada'))};
 });
}
export async function leerOriginal(id){
 const db=await openDB();
 return new Promise((resolve,reject)=>{
  const tx=db.transaction(STORE,'readonly');
  const req=tx.objectStore(STORE).get(id);
  req.onsuccess=()=>resolve(req.result||null);
  req.onerror=()=>reject(req.error||new Error('No se puede leer el PDF guardado'));
  tx.oncomplete=()=>db.close();
 });
}
const norm=s=>String(s||'').toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^A-Z]/g,'');
async function recortarMercancia(original){
 const pdfjs=await import('https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.10.38/pdf.min.mjs');
 pdfjs.GlobalWorkerOptions.workerSrc='https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.10.38/pdf.worker.min.mjs';
 const doc=await pdfjs.getDocument({data:new Uint8Array(await original.arrayBuffer())}).promise;
 const images=[];let found=false;
 try {
  for(let pageNumber=1;pageNumber<=doc.numPages;pageNumber++){
   const page=await doc.getPage(pageNumber);
   const content=await page.getTextContent();
   const lines=new Map();
   for(const item of content.items){
    if(typeof item.str!=='string'||!item.transform)continue;
    const y=Math.round(item.transform[5]/3)*3;
    if(!lines.has(y))lines.set(y,[]);
    lines.get(y).push(item);
   }
   const ordered=[...lines.values()].map(items=>{
    items.sort((a,b)=>a.transform[4]-b.transform[4]);
    return {items,text:norm(items.map(x=>x.str).join(' '))};
   });
   const total=ordered.find(line=>line.text.includes('TOTALREFERENCIASPROD')||line.text.includes('TOTALREFERENCIAS'));
   const boundary=ordered.find(line=>line.text.includes('CONTROLENVASES')||line.text==='PALETS'||line.text.includes('CONFORMIDADCARGA'));
   // En estas hojas, la línea «Total referencias prod.» cierra la mercancía.
   // Si solo aparece el encabezado de envases, se corta antes de ese encabezado.
   const marker=total||boundary;
   const viewport=page.getViewport({scale:1});
   let bottom=viewport.height;
   if(marker){
    const baseline=viewport.height-Math.max(...marker.items.map(item=>item.transform[5]));
    bottom=baseline+(total?15:-16);
    if(bottom<80||bottom>viewport.height)throw new Error('Límite de mercancía no válido');
    found=true;
   }
   const scale=1.5, view=page.getViewport({scale});
   const canvas=document.createElement('canvas');
   canvas.width=Math.ceil(view.width);canvas.height=Math.ceil(view.height);
   await page.render({canvasContext:canvas.getContext('2d',{alpha:false}),viewport:view}).promise;
   const crop=document.createElement('canvas');
   crop.width=canvas.width;crop.height=Math.max(1,Math.min(canvas.height,Math.ceil(bottom*scale)));
   const ctx=crop.getContext('2d',{alpha:false});
   ctx.fillStyle='#fff';ctx.fillRect(0,0,crop.width,crop.height);
   ctx.drawImage(canvas,0,0,crop.width,crop.height,0,0,crop.width,crop.height);
   const image=await new Promise((resolve,reject)=>crop.toBlob(b=>b?resolve(b):reject(new Error('No se pudo crear imagen de la mercancía')),'image/png'));
   images.push(image);canvas.width=canvas.height=0;crop.width=crop.height=0;
   if(found)break;
  }
  if(!found||!images.length)throw new Error('No se ha localizado el final de MERCANCÍA: impresión cancelada para no incluir envases');
  return images;
 } finally {await doc.destroy()}
}
let imageURLs=[];
export function limpiarVista(contenedor){
 for(const url of imageURLs)URL.revokeObjectURL(url);
 imageURLs=[];if(contenedor)contenedor.replaceChildren();
}
export async function prepararMercancia(id,contenedor,{append=false}={}){
 const original=await leerOriginal(id);
 if(!original)throw new Error('No se conserva el PDF de esta carga. Vuelve a importarlo desde Archivos o OneDrive; se mantendrán el operario y los horarios.');
 const images=await recortarMercancia(original);
 if(!append)limpiarVista(contenedor);
 for(let i=0;i<images.length;i++){
  const url=URL.createObjectURL(images[i]);imageURLs.push(url);
  const page=document.createElement('div');page.className='original-print-page';
  const image=document.createElement('img');image.alt='Hoja de carga original: mercancía '+(i+1);
  page.appendChild(image);contenedor.appendChild(page);
  await new Promise((resolve,reject)=>{image.onload=resolve;image.onerror=()=>reject(new Error('Error al preparar una página original'));image.src=url});
 }
 return images.length;
}
