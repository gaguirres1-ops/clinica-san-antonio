import * as storage from './core/storage.js';
import { ErrorDeAcceso, iniciarSesion, registrarPaciente } from './core/autenticacion.js';
import { icono } from './core/ui.js';

const DESTINO_TRAS_ACCESO = 'index.html#/inicio';

const TEXTOS_POR_MODO = {
  ingreso: { titulo: 'Iniciar sesión', alterno: '¿Primera vez en la clínica?', accionAlterna: 'Crear cuenta de paciente', modoAlterno: 'registro' },
  registro: { titulo: 'Crear cuenta de paciente', alterno: '¿Ya tienes una cuenta?', accionAlterna: 'Iniciar sesión', modoAlterno: 'ingreso' },
};

const elementos = {
  titulo: document.getElementById('tituloAcceso'),
  tipos: document.getElementById('tiposDeAcceso'),
  aviso: document.getElementById('avisoAcceso'),
  formularioIngreso: document.getElementById('formularioIngreso'),
  formularioRegistro: document.getElementById('formularioRegistro'),
  alterno: document.getElementById('alternoAcceso'),
};

const CAMPOS_DE_IDENTIFICACION = {
  paciente: { etiqueta: 'DNI', placeholder: '8 dígitos', modoTeclado: 'numeric', longitudMaxima: 8 },
  personal: { etiqueta: 'ID de usuario', placeholder: 'Ej. MED-001 o ADM-001', modoTeclado: 'text', longitudMaxima: 12 },
};

const estado = { grupo: 'paciente', modo: 'ingreso', enviando: false };

function leerCampos(formulario) {
  return Object.fromEntries([...new FormData(formulario)].map(([nombre, valor]) => [nombre, String(valor).trim()]));
}

function limpiarErrores(formulario) {
  formulario.querySelectorAll('[data-error-de]').forEach((error) => {
    error.hidden = true;
    error.textContent = '';
  });
  formulario.querySelectorAll('.entrada').forEach((entrada) => entrada.removeAttribute('aria-invalid'));
  elementos.aviso.hidden = true;
}

function mostrarError(formulario, error) {
  const esErrorConocido = error instanceof ErrorDeAcceso;
  const mensaje = esErrorConocido ? error.message : 'No se pudo completar la operación. Inténtalo nuevamente.';
  const entrada = esErrorConocido && error.campo ? formulario.elements.namedItem(error.campo) : null;
  const marcador = entrada ? formulario.querySelector(`[data-error-de="${error.campo}"]`) : null;

  if (!entrada || !marcador) {
    elementos.aviso.textContent = mensaje;
    elementos.aviso.hidden = false;
    return;
  }
  marcador.textContent = mensaje;
  marcador.hidden = false;
  entrada.setAttribute('aria-invalid', 'true');
  entrada.focus();
}

function renderizarAlterno() {
  const { alterno, accionAlterna, modoAlterno } = TEXTOS_POR_MODO[estado.modo];
  elementos.alterno.hidden = estado.grupo !== 'paciente';
  elementos.alterno.innerHTML = `${alterno} <button class="acceso__enlace" type="button" data-modo="${modoAlterno}">${accionAlterna}</button>`;
}

function renderizar() {
  const enRegistro = estado.modo === 'registro';
  elementos.titulo.textContent = TEXTOS_POR_MODO[estado.modo].titulo;
  elementos.tipos.hidden = enRegistro;
  elementos.formularioIngreso.hidden = enRegistro;
  elementos.formularioRegistro.hidden = !enRegistro;
  elementos.tipos.querySelectorAll('[data-grupo]').forEach((boton) => {
    boton.setAttribute('aria-pressed', String(boton.dataset.grupo === estado.grupo));
  });
  renderizarIdentificacion();
  renderizarAlterno();
}

function renderizarIdentificacion() {
  const { etiqueta, placeholder, modoTeclado, longitudMaxima } = CAMPOS_DE_IDENTIFICACION[estado.grupo];
  const entrada = document.getElementById('ingresoIdentificador');
  document.getElementById('etiquetaIdentificador').textContent = etiqueta;
  entrada.placeholder = placeholder;
  entrada.inputMode = modoTeclado;
  entrada.maxLength = longitudMaxima;
  entrada.value = '';
}

function cambiarModo(modo) {
  estado.modo = modo;
  limpiarErrores(elementos.formularioIngreso);
  limpiarErrores(elementos.formularioRegistro);
  renderizar();
  const formulario = modo === 'registro' ? elementos.formularioRegistro : elementos.formularioIngreso;
  formulario.querySelector('.entrada').focus();
}

function cambiarGrupo(grupo) {
  estado.grupo = grupo;
  limpiarErrores(elementos.formularioIngreso);
  renderizar();
}

function alternarEnvio(formulario, enviando) {
  estado.enviando = enviando;
  const boton = formulario.querySelector('[type="submit"]');
  boton.disabled = enviando;
  boton.setAttribute('aria-busy', String(enviando));
}

async function enviarFormulario(evento, accion) {
  evento.preventDefault();
  if (estado.enviando) return;
  const formulario = evento.currentTarget;
  limpiarErrores(formulario);
  alternarEnvio(formulario, true);
  try {
    await accion(leerCampos(formulario));
    location.replace(DESTINO_TRAS_ACCESO);
  } catch (error) {
    mostrarError(formulario, error);
    alternarEnvio(formulario, false);
  }
}

function alternarVisibilidadContrasena(boton) {
  const entrada = boton.parentElement.querySelector('.entrada');
  const visible = entrada.type === 'password';
  entrada.type = visible ? 'text' : 'password';
  boton.setAttribute('aria-pressed', String(visible));
  boton.setAttribute('aria-label', visible ? 'Ocultar contraseña' : 'Mostrar contraseña');
  boton.innerHTML = icono(visible ? 'ojoCerrado' : 'ojo');
}

function registrarEventos() {
  elementos.tipos.addEventListener('click', (evento) => {
    const boton = evento.target.closest('[data-grupo]');
    if (boton) cambiarGrupo(boton.dataset.grupo);
  });

  elementos.alterno.addEventListener('click', (evento) => {
    const boton = evento.target.closest('[data-modo]');
    if (boton) cambiarModo(boton.dataset.modo);
  });

  elementos.formularioIngreso.addEventListener('submit', (evento) => enviarFormulario(
    evento,
    (campos) => iniciarSesion({ identificador: campos.identificador, contrasena: campos.contrasena, grupo: estado.grupo }),
  ));
  elementos.formularioRegistro.addEventListener('submit', (evento) => enviarFormulario(evento, registrarPaciente));

  document.addEventListener('click', (evento) => {
    const boton = evento.target.closest('[data-accion="mostrar-contrasena"]');
    if (boton) alternarVisibilidadContrasena(boton);
  });

  document.addEventListener('input', (evento) => {
    const { target } = evento;
    const esDni = target.name === 'dni' || (target.name === 'identificador' && estado.grupo === 'paciente');
    if (esDni) target.value = target.value.replace(/\D/g, '').slice(0, 8);
    if (target.name === 'telefono') target.value = target.value.replace(/[^\d\s]/g, '');
  });
}

if (storage.obtenerSesion()) {
  location.replace(DESTINO_TRAS_ACCESO);
} else {
  document.querySelectorAll('[data-accion="mostrar-contrasena"]').forEach((boton) => {
    boton.innerHTML = icono('ojo');
  });
  registrarEventos();
  renderizar();
}
