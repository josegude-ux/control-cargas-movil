// Sincronización manual por lotes. Solo inserta cargas nuevas; nunca reemplaza existentes.
// Los PDF originales permanecen en IndexedDB de cada dispositivo.
import {leerRemotas, planificarCargas, enviarNueva, datosIguales} from './sync-lote.mjs';

const KEY_ULTIMA='control_cargas_ultima_sincronizacion_v1';
const el=id=>document.getElementById(id);
const mostrar=id=>String(id??'').slice(0,120);
const resumen=p=>'Para enviar: '+p.aSubir.length+'\nPara recibir: '+p.aRecibir.length
  +'\nYa coinciden: '+p.iguales.length+'\nConflictos sin modificar: '+p.conflictos.length
  +(p.conflictos.length?'\nRevisar: '+p.conflictos.slice(0,15).map(mostrar).join(', '):'');
export function mostrarUltimaSync(){
  let fecha='';
  try{fecha=localStorage.getItem(KEY_ULTIMA)||''}catch{}
  const d=fecha?new Date(fecha):null;
  if(el('cloudLastSync'))el('cloudLastSync').textContent=
   'Última sincronización finalizada sin errores: '+(d&&Number.isFinite(d.getTime())?d.toLocaleString('es-ES'):'ninguna');
}

export async function sincronizarNuevas({client,user,readLocal,saveLocal,notify}){
  const report=el('cloudBatchReport');
  const show=s=>{if(report)report.textContent=s};
  if(!navigator.onLine){notify('Sin conexión. Los registros permanecen en el dispositivo; sincroniza cuando vuelva la cobertura.','warn');return}
  let enviados=0,recibidos=0,omitidos=0;
  const errores=[];
  try{
    notify('Comparando las cargas locales con Supabase…');
    const inicial=planificarCargas(readLocal(),await leerRemotas(client));
    show(resumen(inicial));
    if(!inicial.aSubir.length&&!inicial.aRecibir.length){
      notify(inicial.conflictos.length?'No hay cargas nuevas; revisa las '+inicial.conflictos.length+' cargas con diferencias.':'Las cargas locales y remotas ya coinciden.',inicial.conflictos.length?'warn':'ok');
      return;
    }
    const aviso='SINCRONIZACIÓN POR LOTES\n\n'+resumen(inicial)
      +'\n\nSolo se crearán cargas nuevas. No se reemplazarán las existentes ni se enviarán los PDF originales.\n\n¿Continuar?';
    if(!confirm(aviso)){notify('Sincronización cancelada. No se han modificado datos.');return}
    // Segunda comparación para evitar actuar con un plan obsoleto.
    const actual=planificarCargas(readLocal(),await leerRemotas(client));
    const autorizadas=new Set(inicial.aSubir.map(r=>String(r.id)));
    const descargarInicial=new Map(inicial.aRecibir.map(r=>[String(r.id),r]));
    const subir=actual.aSubir.filter(r=>autorizadas.has(String(r.id)));
    for(const carga of subir){
      const id=String(carga.id);
      notify('Enviando carga nueva '+mostrar(id)+' ('+(enviados+omitidos+errores.length+1)+' de '+subir.length+')…');
      try{
        // Un último control evita duplicar si otra sesión publicó la misma clave.
        const {data,error}=await client.from('cargas_compartidas').select('clave_local').eq('clave_local',id).limit(1);
        if(error)throw error;
        if(data?.length){omitidos++;continue}
        await enviarNueva(client,user,carga);
        enviados++;
      }catch(err){errores.push(mostrar(id)+': '+(err.message||String(err)));}
    }
    // Recibir solo cargas nuevas cuyo contenido no cambió desde la confirmación.
    const resultado=planificarCargas(readLocal(),await leerRemotas(client));
    const nuevos=resultado.aRecibir.filter(r=>descargarInicial.has(String(r.id))
      &&datosIguales(r,descargarInicial.get(String(r.id))));
    if(nuevos.length){
      const actuales=readLocal(),ids=new Set(actuales.map(r=>String(r.id)));
      const seguros=nuevos.filter(r=>!ids.has(String(r.id)));
      if(seguros.length){
        // saveLocal escribe en almacenamiento primero, y solo después actualiza la interfaz.
        await saveLocal(actuales.concat(seguros));
        recibidos=seguros.length;
      }
    }
    const fin=planificarCargas(readLocal(),await leerRemotas(client));
    const detalle='Enviadas: '+enviados+' · Recibidas: '+recibidos
     +' · Omitidas por existir: '+omitidos+' · Diferencias: '+fin.conflictos.length
     +' · Errores: '+errores.length+'.';
    show(detalle+(fin.conflictos.length?'\nRevisar: '+fin.conflictos.slice(0,15).map(mostrar).join(', '):'')
      +(errores.length?'\nErrores: '+errores.slice(0,10).join(' | '):'')
      +'\nLos PDF originales no se han transferido.');
    if(!errores.length){
      try{localStorage.setItem(KEY_ULTIMA,new Date().toISOString())}catch{}
      mostrarUltimaSync();
    }
    notify('Sincronización terminada. '+detalle,errores.length||fin.conflictos.length?'warn':'ok');
  }catch(err){
    const texto='Sincronización incompleta. Enviadas: '+enviados+', recibidas: '+recibidos+'. '
      +(err.message||String(err))+'. No se han borrado datos locales. Revisa antes de reintentar.';
    show(texto);notify(texto,'warn');
  }
}
