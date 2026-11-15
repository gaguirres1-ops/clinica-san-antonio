import { crearDatosIniciales, VERSION_DATOS } from '../data/mockData.js';

const CLAVE_BASE_DATOS = 'clinica-san-antonio:base-datos';
const CLAVE_SESION = 'clinica-san-antonio:sesion';

const PREFIJOS_ID = Object.freeze({
  especialidades: 'ESP',
  medicos: 'MED',
  pacientes: 'PAC',
  administradores: 'ADM',
  horarios: 'HOR',
  citas: 'CIT',
  pagos: 'PAG',
  historialClinico: 'HC',
  notificaciones: 'NOT',
});

export const COLECCIONES = Object.freeze(Object.keys(PREFIJOS_ID));

const suscriptores = new Set();
let coleccionesEnTransaccion = null;
let baseDatos = cargarBaseDatos();

function clonar(valor) {
  return structuredClone(valor);
}

function leerLocal(clave) {
  try {
    const texto = localStorage.getItem(clave);
    return texto ? JSON.parse(texto) : null;
  } catch {
    return null;
  }
}

function escribirLocal(clave, valor) {
  try {
    localStorage.setItem(clave, JSON.stringify(valor));
  } catch (error) {
    console.warn('No se pudo guardar en localStorage; los cambios solo durarán esta sesión.', error);
  }
}

function esBaseDatosValida(datos) {
  return Boolean(datos) && datos.version === VERSION_DATOS && COLECCIONES.every((nombre) => Array.isArray(datos[nombre]));
}

function cargarBaseDatos() {
  const guardada = leerLocal(CLAVE_BASE_DATOS);
  if (esBaseDatosValida(guardada)) return guardada;
  const inicial = crearDatosIniciales();
  escribirLocal(CLAVE_BASE_DATOS, inicial);
  return inicial;
}

function obtenerColeccion(nombre) {
  const registros = baseDatos[nombre];
  if (!Array.isArray(registros)) throw new Error(`La colección "${nombre}" no existe.`);
  return registros;
}

function emitir(colecciones, origen) {
  suscriptores.forEach((suscriptor) => {
    try {
      suscriptor({ colecciones, origen });
    } catch (error) {
      console.error(error);
    }
  });
}

function registrarCambio(nombre) {
  if (coleccionesEnTransaccion) {
    coleccionesEnTransaccion.add(nombre);
    return;
  }
  escribirLocal(CLAVE_BASE_DATOS, baseDatos);
  emitir([nombre], 'local');
}

function generarId(nombre) {
  const prefijo = PREFIJOS_ID[nombre];
  const mayor = obtenerColeccion(nombre).reduce((maximo, registro) => {
    const numero = Number(String(registro.id).split('-').pop());
    return Number.isFinite(numero) ? Math.max(maximo, numero) : maximo;
  }, 0);
  return `${prefijo}-${String(mayor + 1).padStart(4, '0')}`;
}

export function obtenerTodos(nombre) {
  return obtenerColeccion(nombre).map(clonar);
}

export function filtrar(nombre, predicado) {
  return obtenerColeccion(nombre).filter(predicado).map(clonar);
}

export function buscar(nombre, predicado) {
  const encontrado = obtenerColeccion(nombre).find(predicado);
  return encontrado ? clonar(encontrado) : null;
}

export function obtenerPorId(nombre, id) {
  return buscar(nombre, (registro) => registro.id === id);
}

export function contar(nombre, predicado = () => true) {
  return obtenerColeccion(nombre).filter(predicado).length;
}

export function insertar(nombre, registro) {
  const nuevo = { ...clonar(registro), id: registro.id ?? generarId(nombre) };
  obtenerColeccion(nombre).push(nuevo);
  registrarCambio(nombre);
  return clonar(nuevo);
}

export function actualizar(nombre, id, cambios) {
  const existente = obtenerColeccion(nombre).find((registro) => registro.id === id);
  if (!existente) return null;
  Object.assign(existente, clonar(cambios), { id });
  registrarCambio(nombre);
  return clonar(existente);
}

export function eliminar(nombre, id) {
  const registros = obtenerColeccion(nombre);
  const indice = registros.findIndex((registro) => registro.id === id);
  if (indice === -1) return false;
  registros.splice(indice, 1);
  registrarCambio(nombre);
  return true;
}

export function ejecutarTransaccion(operacion) {
  if (coleccionesEnTransaccion) return operacion();

  const respaldo = clonar(baseDatos);
  coleccionesEnTransaccion = new Set();
  try {
    const resultado = operacion();
    const modificadas = [...coleccionesEnTransaccion];
    coleccionesEnTransaccion = null;
    if (modificadas.length) {
      escribirLocal(CLAVE_BASE_DATOS, baseDatos);
      emitir(modificadas, 'local');
    }
    return resultado;
  } catch (error) {
    baseDatos = respaldo;
    coleccionesEnTransaccion = null;
    throw error;
  }
}

export function suscribir(suscriptor) {
  suscriptores.add(suscriptor);
  return () => suscriptores.delete(suscriptor);
}

export function restablecer() {
  baseDatos = crearDatosIniciales();
  escribirLocal(CLAVE_BASE_DATOS, baseDatos);
  emitir([...COLECCIONES], 'reinicio');
}

export function obtenerSesion() {
  const guardada = leerLocal(CLAVE_SESION);
  const rol = guardada?.rol;
  const usuarioId = guardada?.usuarios?.[rol];
  return rol && usuarioId ? { rol, usuarios: { [rol]: usuarioId } } : null;
}

export function guardarSesion(sesion) {
  escribirLocal(CLAVE_SESION, sesion);
}

export function cerrarSesionGuardada() {
  try {
    localStorage.removeItem(CLAVE_SESION);
  } catch (error) {
    console.warn('No se pudo cerrar la sesión guardada.', error);
  }
}

window.addEventListener('storage', (evento) => {
  if (evento.key !== CLAVE_BASE_DATOS || !evento.newValue) return;
  try {
    const recibida = JSON.parse(evento.newValue);
    if (!esBaseDatosValida(recibida)) return;
    baseDatos = recibida;
    emitir([...COLECCIONES], 'externo');
  } catch (error) {
    console.warn('Se ignoraron datos inválidos recibidos desde otra pestaña.', error);
  }
});
