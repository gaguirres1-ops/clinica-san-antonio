import * as storage from './storage.js';
import { hoyISO } from './fechas.js';

const LONGITUD_DNI = 8;
const LONGITUD_MINIMA_CONTRASENA = 8;
const ERROR_CREDENCIALES = 'Las credenciales no son correctas.';

export class ErrorDeAcceso extends Error {
  constructor(mensaje, campo = null) {
    super(mensaje);
    this.name = 'ErrorDeAcceso';
    this.campo = campo;
  }
}

export function esDniValido(dni) {
  return new RegExp(`^\d{${LONGITUD_DNI}}$`).test(dni);
}

export function validarContrasena(contrasena) {
  if (contrasena.length < LONGITUD_MINIMA_CONTRASENA) return `Usa al menos ${LONGITUD_MINIMA_CONTRASENA} caracteres.`;
  if (!/[A-Za-z]/.test(contrasena) || !/\d/.test(contrasena)) return 'Combina letras y números.';
  return '';
}

export async function calcularCredencial(dni, contrasena) {
  const datos = new TextEncoder().encode(`${dni}:${contrasena}`);
  const huella = await crypto.subtle.digest('SHA-256', datos);
  return [...new Uint8Array(huella)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

function buscarCuenta(identificador, grupo) {
  if (grupo === 'paciente') {
    const paciente = storage.buscar('pacientes', (item) => item.dni === identificador);
    return paciente && { registro: paciente, rol: 'paciente' };
  }
  const id = identificador.toUpperCase();
  const candidatos = [{ coleccion: 'medicos', rol: 'medico' }, { coleccion: 'administradores', rol: 'administrador' }];
  for (const { coleccion, rol } of candidatos) {
    const registro = storage.buscar(coleccion, (item) => item.id === id || item.dni === identificador);
    if (registro) return { registro, rol };
  }
  return null;
}

function existeDniRegistrado(dni) {
  return ['pacientes', 'medicos', 'administradores'].some((coleccion) => storage.buscar(coleccion, (item) => item.dni === dni));
}

function abrirSesion(rol, usuarioId) {
  const sesion = { rol, usuarios: { [rol]: usuarioId } };
  storage.guardarSesion(sesion);
  return sesion;
}

export async function iniciarSesion({ identificador, contrasena, grupo }) {
  if (grupo === 'paciente' && !esDniValido(identificador)) {
    throw new ErrorDeAcceso(`El DNI debe tener ${LONGITUD_DNI} dígitos.`, 'identificador');
  }
  if (grupo !== 'paciente' && !identificador) throw new ErrorDeAcceso('Ingresa tu ID de usuario.', 'identificador');
  if (!contrasena) throw new ErrorDeAcceso('Ingresa tu contraseña.', 'contrasena');

  const cuenta = buscarCuenta(identificador, grupo);
  const credencial = cuenta && await calcularCredencial(cuenta.registro.dni, contrasena);
  if (!cuenta || cuenta.registro.credencial !== credencial) throw new ErrorDeAcceso(ERROR_CREDENCIALES);
  if (cuenta.rol === 'medico' && !cuenta.registro.activo) {
    throw new ErrorDeAcceso('Tu cuenta no está activa. Comunícate con administración.');
  }
  return abrirSesion(cuenta.rol, cuenta.registro.id);
}

export function validarDatosDeRegistro(datos) {
  const errores = {};
  if (!esDniValido(datos.dni)) errores.dni = `El DNI debe tener ${LONGITUD_DNI} dígitos.`;
  if (datos.nombres.length < 2) errores.nombres = 'Ingresa tus nombres.';
  if (datos.apellidos.length < 2) errores.apellidos = 'Ingresa tus apellidos.';
  if (!datos.fechaNacimiento || datos.fechaNacimiento > hoyISO()) {
    errores.fechaNacimiento = 'Ingresa una fecha de nacimiento válida.';
  }
  if (!datos.sexo) errores.sexo = 'Selecciona una opción.';
  if (!/^9\d{8}$/.test(datos.telefono.replace(/\s/g, ''))) errores.telefono = 'Ingresa un celular de 9 dígitos que empiece con 9.';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(datos.correo)) errores.correo = 'Ingresa un correo válido.';
  const errorContrasena = validarContrasena(datos.contrasena);
  if (errorContrasena) errores.contrasena = errorContrasena;
  else if (datos.contrasena !== datos.confirmacion) errores.confirmacion = 'Las contraseñas no coinciden.';
  return errores;
}

export async function registrarPaciente(datos) {
  const errores = validarDatosDeRegistro(datos);
  const [primerCampo] = Object.keys(errores);
  if (primerCampo) throw new ErrorDeAcceso(errores[primerCampo], primerCampo);
  if (existeDniRegistrado(datos.dni)) {
    throw new ErrorDeAcceso('Este DNI ya tiene una cuenta. Inicia sesión.', 'dni');
  }

  const credencial = await calcularCredencial(datos.dni, datos.contrasena);
  const paciente = storage.insertar('pacientes', {
    nombre: `${datos.nombres} ${datos.apellidos}`,
    dni: datos.dni,
    credencial,
    fechaNacimiento: datos.fechaNacimiento,
    sexo: datos.sexo,
    telefono: datos.telefono.replace(/\s/g, '').replace(/(\d{3})(\d{3})(\d{3})/, '$1 $2 $3'),
    correo: datos.correo.toLowerCase(),
    seguro: 'Particular',
    alergias: 'Ninguna conocida',
  });
  return abrirSesion('paciente', paciente.id);
}

export function cerrarSesion() {
  storage.cerrarSesionGuardada();
}
