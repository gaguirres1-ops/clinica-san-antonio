import * as storage from './core/storage.js';
import {
  alCambiarRuta,
  construirHash,
  iniciarNavegacion,
  leerRutaActual,
  navegar,
  puedeAcceder,
  refrescarVista,
  registrarRutas,
  rutasDelMenu,
} from './core/navigation.js';
import {
  ROLES,
  esCitaActiva,
  esCitaFutura,
  listarCitas,
  listarCitasPorAtender,
  marcarNotificacionLeida,
  marcarNotificacionesLeidas,
  notificacionesDe,
  usuarioDeSesion,
} from './core/dominio.js';
import { formatearHace } from './core/fechas.js';
import { confirmarAccion, escaparHtml, icono, mostrarToast, obtenerIniciales } from './core/ui.js';
import inicio from './core/inicio.js';
import detalleCita from './core/detalleCita.js';
import reservarCita from './modules/reservarCita.js';
import reprogramarCita from './modules/reprogramarCita.js';
import diagnostico from './modules/diagnostico.js';
import gestionarAgenda from './modules/gestionarAgenda.js';
import citasExistentes from './modules/citasExistentes.js';
import reasignarMedico from './modules/reasignarMedico.js';

const SECCIONES_DEL_MENU = ['General', 'Citas', 'Atención médica', 'Gestión'];
const LIMITE_NOTIFICACIONES = 20;

const elementos = {
  navegacion: document.getElementById('navegacion'),
  navegacionSuperior: document.getElementById('navegacionSuperior'),
  vista: document.getElementById('vista'),
  botonRol: document.getElementById('botonRol'),
  menuRol: document.getElementById('menuRol'),
  botonNotificaciones: document.getElementById('botonNotificaciones'),
  contadorNotificaciones: document.getElementById('contadorNotificaciones'),
  panelNotificaciones: document.getElementById('panelNotificaciones'),
  listaNotificaciones: document.getElementById('listaNotificaciones'),
  botonMarcarLeidas: document.getElementById('botonMarcarLeidas'),
  usuarioIniciales: document.getElementById('usuarioIniciales'),
  usuarioNombre: document.getElementById('usuarioNombre'),
  usuarioDetalle: document.getElementById('usuarioDetalle'),
  botonMenu: document.getElementById('botonMenu'),
  fondoMenu: document.getElementById('fondoMenu'),
  botonRestablecer: document.getElementById('botonRestablecer'),
};

let sesion = storage.obtenerSesion();

function obtenerContexto() {
  return { sesion, rol: sesion.rol, usuario: usuarioDeSesion(sesion) };
}

function renderizarUsuario() {
  const usuario = usuarioDeSesion(sesion);
  elementos.usuarioIniciales.textContent = obtenerIniciales(usuario?.nombre ?? '');
  elementos.usuarioNombre.textContent = usuario?.nombre ?? 'Usuario';
  elementos.usuarioDetalle.textContent = `${ROLES[sesion.rol].etiqueta} · ${usuario?.detalle ?? ''}`;
}

function renderizarMenuRol() {
  elementos.menuRol.innerHTML = `
    <p class="menu-rol__titulo">Cambiar perfil</p>
    ${Object.values(ROLES).map((rol) => {
    const usuario = usuarioDeSesion(storage.crearSesionDemo(rol.id));
    return `
      <button class="menu-rol__opcion" type="button" role="menuitemradio" aria-checked="${rol.id === sesion.rol}" data-rol="${escaparHtml(rol.id)}">
        <span class="avatar avatar--claro" aria-hidden="true">${escaparHtml(obtenerIniciales(usuario?.nombre ?? ''))}</span>
        <span class="menu-rol__texto"><strong>${escaparHtml(rol.etiqueta)}</strong><small>${escaparHtml(usuario?.nombre ?? '')}</small></span>
        ${rol.id === sesion.rol ? icono('check') : ''}
      </button>`;
  }).join('')}`;
}

function alternarMenuRol(abrir = elementos.menuRol.hidden) {
  elementos.menuRol.hidden = !abrir;
  elementos.botonRol.setAttribute('aria-expanded', String(abrir));
  if (abrir) renderizarMenuRol();
}

function cambiarRol(rol) {
  alternarMenuRol(false);
  if (rol === sesion.rol || !ROLES[rol]) return;
  sesion = storage.crearSesionDemo(rol);
  storage.guardarSesion(sesion);
  alternarPanelNotificaciones(false);
  renderizarShell();
  if (puedeAcceder(leerRutaActual().id, rol)) {
    refrescarVista();
  } else {
    navegar('inicio');
  }
  mostrarToast(`Ahora navegas como ${ROLES[rol].etiqueta.toLowerCase()}.`, 'info');
}

function buscarCitaParaDetalle() {
  const usuarioId = sesion.usuarios[sesion.rol];
  if (sesion.rol === 'paciente') {
    return listarCitas((cita) => cita.pacienteId === usuarioId && esCitaActiva(cita) && esCitaFutura(cita))[0] ?? null;
  }
  if (sesion.rol === 'medico') return listarCitasPorAtender(usuarioId)[0] ?? null;
  return null;
}

function crearEntradasDelMenu() {
  const entradas = rutasDelMenu(sesion.rol).map((ruta) => ({
    id: ruta.id, titulo: ruta.titulo, icono: ruta.icono, seccion: ruta.seccion, href: construirHash(ruta.id),
  }));
  const cita = buscarCitaParaDetalle();
  if (cita) {
    entradas.push({
      id: 'detalle-cita',
      titulo: 'Detalle de cita',
      icono: 'documento',
      seccion: sesion.rol === 'medico' ? 'Atención médica' : 'Citas',
      href: construirHash('detalle-cita', { id: cita.id }),
    });
  }
  return entradas;
}

function renderizarMenu() {
  const rutaActiva = leerRutaActual().id;
  const entradas = crearEntradasDelMenu();
  const atributoActivo = (entrada) => (entrada.id === rutaActiva ? ' aria-current="page"' : '');
  elementos.navegacionSuperior.innerHTML = entradas
    .map((entrada) => `<a class="navegacion-superior__enlace" href="${entrada.href}"${atributoActivo(entrada)}>${escaparHtml(entrada.titulo)}</a>`)
    .join('');
  elementos.navegacion.innerHTML = SECCIONES_DEL_MENU
    .map((seccion) => ({ seccion, enlaces: entradas.filter((entrada) => entrada.seccion === seccion) }))
    .filter(({ enlaces }) => enlaces.length)
    .map(({ seccion, enlaces }) => `
      <div class="menu-seccion">
        <p class="menu-seccion__titulo">${escaparHtml(seccion)}</p>
        <ul class="menu-seccion__lista">
          ${enlaces.map((entrada) => `
            <li>
              <a class="menu-enlace" href="${entrada.href}"${atributoActivo(entrada)}>
                ${icono(entrada.icono)}<span>${escaparHtml(entrada.titulo)}</span>
              </a>
            </li>`).join('')}
        </ul>
      </div>`)
    .join('');
}

function renderizarNotificaciones() {
  const notificaciones = notificacionesDe(sesion);
  const noLeidas = notificaciones.filter((notificacion) => !notificacion.leida).length;

  elementos.contadorNotificaciones.hidden = noLeidas === 0;
  elementos.contadorNotificaciones.textContent = noLeidas > 9 ? '9+' : String(noLeidas);
  elementos.botonNotificaciones.setAttribute('aria-label', noLeidas ? `Notificaciones, ${noLeidas} sin leer` : 'Notificaciones');
  elementos.botonMarcarLeidas.disabled = noLeidas === 0;

  elementos.listaNotificaciones.innerHTML = notificaciones.length
    ? notificaciones.slice(0, LIMITE_NOTIFICACIONES).map((notificacion) => `
        <li>
          <button class="notificacion${notificacion.leida ? '' : ' notificacion--no-leida'}" type="button" data-notificacion="${escaparHtml(notificacion.id)}">
            <strong>${escaparHtml(notificacion.titulo)}</strong>
            <span>${escaparHtml(notificacion.mensaje)}</span>
            <time datetime="${escaparHtml(notificacion.fecha)}">${escaparHtml(formatearHace(notificacion.fecha))}</time>
          </button>
        </li>`).join('')
    : '<li class="panel-notificaciones__vacio">No tienes notificaciones.</li>';
}

function alternarPanelNotificaciones(abrir = elementos.panelNotificaciones.hidden) {
  elementos.panelNotificaciones.hidden = !abrir;
  elementos.botonNotificaciones.setAttribute('aria-expanded', String(abrir));
  if (abrir) renderizarNotificaciones();
}

function alternarMenuLateral(abrir = !document.body.classList.contains('menu-abierto')) {
  document.body.classList.toggle('menu-abierto', abrir);
  elementos.fondoMenu.hidden = !abrir;
  elementos.botonMenu.setAttribute('aria-expanded', String(abrir));
  elementos.botonMenu.setAttribute('aria-label', abrir ? 'Cerrar menú' : 'Abrir menú');
}

function abrirNotificacion(id) {
  const notificacion = notificacionesDe(sesion).find((item) => item.id === id);
  if (!notificacion) return;
  marcarNotificacionLeida(id);
  alternarPanelNotificaciones(false);
  if (notificacion.citaId) navegar('detalle-cita', { id: notificacion.citaId });
}

async function restablecerDatos() {
  const confirmado = await confirmarAccion({
    titulo: 'Restablecer datos de demostración',
    mensaje: 'Se eliminarán las citas, pagos, notificaciones y cuentas creadas en este navegador y se cargarán los datos iniciales. Esta acción no se puede deshacer.',
    textoConfirmar: 'Restablecer datos',
    peligro: true,
  });
  if (!confirmado) return;
  storage.restablecer();
  alternarMenuLateral(false);
  navegar('inicio');
  mostrarToast('Datos de demostración restablecidos.');
}

function renderizarShell() {
  renderizarUsuario();
  renderizarMenu();
  renderizarNotificaciones();
}

function registrarEventosDelShell() {
  elementos.botonNotificaciones.addEventListener('click', (evento) => {
    evento.stopPropagation();
    alternarPanelNotificaciones();
  });

  elementos.listaNotificaciones.addEventListener('click', (evento) => {
    const boton = evento.target.closest('[data-notificacion]');
    if (boton) abrirNotificacion(boton.dataset.notificacion);
  });

  elementos.botonMarcarLeidas.addEventListener('click', () => marcarNotificacionesLeidas(sesion));
  elementos.botonMenu.addEventListener('click', () => alternarMenuLateral());
  elementos.fondoMenu.addEventListener('click', () => alternarMenuLateral(false));
  elementos.botonRestablecer.addEventListener('click', restablecerDatos);
  elementos.botonRol.addEventListener('click', (evento) => {
    evento.stopPropagation();
    alternarMenuRol();
  });
  elementos.menuRol.addEventListener('click', (evento) => {
    const opcion = evento.target.closest('[data-rol]');
    if (opcion) cambiarRol(opcion.dataset.rol);
  });

  document.addEventListener('click', (evento) => {
    if (!elementos.panelNotificaciones.hidden && !evento.target.closest('.notificaciones')) {
      alternarPanelNotificaciones(false);
    }
    if (!elementos.menuRol.hidden && !evento.target.closest('.rol-actual')) alternarMenuRol(false);
  });

  document.addEventListener('keydown', (evento) => {
    if (evento.key !== 'Escape' || document.querySelector('.modal-fondo')) return;
    if (!elementos.panelNotificaciones.hidden) {
      alternarPanelNotificaciones(false);
      elementos.botonNotificaciones.focus();
    }
    if (!elementos.menuRol.hidden) {
      alternarMenuRol(false);
      elementos.botonRol.focus();
    }
    alternarMenuLateral(false);
  });
}

function iniciarAplicacion() {
  registrarRutas([inicio, reservarCita, reprogramarCita, diagnostico, gestionarAgenda, citasExistentes, reasignarMedico, detalleCita]);
  registrarEventosDelShell();
  storage.suscribir(() => {
    renderizarUsuario();
    renderizarMenu();
    renderizarNotificaciones();
  });
  alCambiarRuta(() => {
    renderizarMenu();
    alternarMenuLateral(false);
  });
  renderizarShell();
  iniciarNavegacion({ contenedor: elementos.vista, contexto: obtenerContexto });
}

iniciarAplicacion();
