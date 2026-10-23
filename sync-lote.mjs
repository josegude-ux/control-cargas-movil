// Sincronización manual por lotes, v0.5.25. Nunca sobrescribe datos locales ni remotos.
// Los PDF originales siguen exclusivamente en IndexedDB local.
const TABLA = 'cargas_compartidas';
const TAMANO_PAGINA = 200;
const MAXIMO_FILAS = 10000;

function claveDe(carga) { return String(carga?.id ?? '').trim(); }
function valida(carga, clave) {
  return Boolean(clave && carga && typeof carga === 'object' && !Array.isArray(carga) && claveDe(carga) === clave);
}
function ordenEstable(valor) {
  if (valor === null || typeof valor !== 'object') return JSON.stringify(valor);
  if (Array.isArray(valor)) return '[' + valor.map(item => ordenEstable(item) ?? 'null').join(',') + ']';
  return '{' + Object.keys(valor).sort().filter(k => valor[k] !== undefined)
    .map(k => JSON.stringify(k) + ':' + ordenEstable(valor[k])).join(',') + '}';
}
export function datosIguales(a, b) {
  return ordenEstable(a) === ordenEstable(b);
}
export async function leerRemotas(client) {
  if (!client) throw new Error('No hay conexión con Supabase.');
  const filas = [];
  for (let inicio = 0; inicio < MAXIMO_FILAS; inicio += TAMANO_PAGINA) {
    const {data, error} = await client.from(TABLA)
      .select('id,propietario_id,clave_local,datos,actualizado_en')
      .order('clave_local', {ascending: true})
      .order('id', {ascending: true})
      .range(inicio, inicio + TAMANO_PAGINA - 1);
    if (error) throw error;
    if (!Array.isArray(data)) throw new Error('Respuesta inesperada del servidor.');
    filas.push(...data);
    if (data.length < TAMANO_PAGINA) return filas;
  }
  throw new Error('Demasiados registros para una sincronización segura. Ningún dato se modificó.');
}
export function planificarCargas(locales, remotas) {
  if (!Array.isArray(locales) || !Array.isArray(remotas)) throw new Error('Formato de cargas no válido.');
  const gruposLocales = new Map(), gruposRemotos = new Map();
  const conflictos = new Set(), iguales = [];
  const aSubir = [], aRecibir = [];
  for (const carga of locales) {
    const id = claveDe(carga);
    if (!valida(carga, id)) { conflictos.add(id || '(carga local inválida)'); continue; }
    if (!gruposLocales.has(id)) gruposLocales.set(id, []);
    gruposLocales.get(id).push(carga);
  }
  for (const fila of remotas) {
    const id = String(fila?.clave_local ?? '').trim();
    if (!id || !valida(fila?.datos, id)) { conflictos.add(id || '(carga remota inválida)'); continue; }
    if (!gruposRemotos.has(id)) gruposRemotos.set(id, []);
    gruposRemotos.get(id).push(fila);
  }
  for (const [id, registros] of gruposLocales) if (registros.length !== 1) conflictos.add(id);
  for (const [id, registros] of gruposRemotos) if (registros.length !== 1) conflictos.add(id);
  const ids = new Set([...gruposLocales.keys(), ...gruposRemotos.keys()]);
  for (const id of ids) {
    if (conflictos.has(id)) continue;
    const local = gruposLocales.get(id)?.[0];
    const remota = gruposRemotos.get(id)?.[0]?.datos;
    if (local && !remota) aSubir.push(local);
    else if (!local && remota) aRecibir.push(remota);
    else if (local && remota) {
      if (datosIguales(local, remota)) iguales.push(id);
      else conflictos.add(id); // Dos versiones distintas: revisión humana, nunca sobrescribir.
    }
  }
  return {aSubir, aRecibir, iguales, conflictos: [...conflictos].sort()};
}
export async function enviarNueva(client, user, carga) {
  const id = claveDe(carga);
  if (!user?.id || !valida(carga,id)) throw new Error('Sesión o carga inválida.');
  const {data,error}=await client.from(TABLA).insert({
    propietario_id:user.id, clave_local:id,
    datos:JSON.parse(JSON.stringify(carga)), actualizado_en:new Date().toISOString()
  }).select('clave_local').single();
  if (error) throw error;
  if (data?.clave_local !== id) throw new Error('Confirmación de envío incorrecta para '+id);
  return id;
}
