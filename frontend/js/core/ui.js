import { construirHash } from './navigation.js';
import { formatearFecha, partesDeFecha } from './fechas.js';

const ICONOS = {
  inicio: '<path d="M3 10.5 12 3l9 7.5"/><path d="M5 9.5V21h14V9.5"/><path d="M9.5 21v-6h5v6"/>',
  calendario: '<rect x="3" y="4.5" width="18" height="16.5" rx="2.5"/><path d="M3 9.5h18M8 2.5v4M16 2.5v4"/>',
  calendarioMas: '<rect x="3" y="4.5" width="18" height="16.5" rx="2.5"/><path d="M3 9.5h18M8 2.5v4M16 2.5v4M12 12.5v5.5M9.25 15.25h5.5"/>',
  cancelar: '<rect x="3" y="4.5" width="18" height="16.5" rx="2.5"/><path d="M3 9.5h18M8 2.5v4M16 2.5v4M9.5 13l5 5M14.5 13l-5 5"/>',
  agenda: '<path d="M21 10.5V7a2.5 2.5 0 0 0-2.5-2.5h-13A2.5 2.5 0 0 0 3 7v11.5A2.5 2.5 0 0 0 5.5 21H11"/><path d="M3 9.5h18M8 2.5v4M16 2.5v4"/><circle cx="17.5" cy="17.5" r="4"/><path d="M17.5 15.8v1.9l1.2 1"/>',
  reloj: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  usuario: '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
  usuarios: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0"/><path d="M16 4.6a3.5 3.5 0 0 1 0 6.8M18 14a6.5 6.5 0 0 1 3.5 6"/>',
  estetoscopio: '<path d="M5 3v5a5 5 0 0 0 10 0V3"/><path d="M10 13v2a5 5 0 0 0 10 0v-2.5"/><circle cx="20" cy="10.5" r="2"/>',
  escudo: '<path d="M12 3 4 6v6c0 4.5 3.4 8.3 8 9 4.6-.7 8-4.5 8-9V6z"/><path d="m9 12 2 2 4-4"/>',
  campana: '<path d="M6 8a6 6 0 1 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.9 1.9 0 0 0 3.4 0"/>',
  buscar: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
  flechaDerecha: '<path d="M5 12h14M13 6l6 6-6 6"/>',
  flechaIzquierda: '<path d="M19 12H5M11 6l-6 6 6 6"/>',
  chevronDerecha: '<path d="m9 6 6 6-6 6"/>',
  chevronIzquierda: '<path d="m15 6-6 6 6 6"/>',
  check: '<path d="m5 12.5 4.5 4.5L19 7"/>',
  cerrar: '<path d="M6 6l12 12M18 6 6 18"/>',
  alerta: '<path d="M10.3 3.9 2.4 17.5A2 2 0 0 0 4.1 20.5h15.8a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/><path d="M12 9.5v4M12 17v.01"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 7.5v.01"/>',
  reprogramar: '<path d="M20 11a8 8 0 0 0-14.9-3.5L3 10"/><path d="M3 4v6h6"/><path d="M4 13a8 8 0 0 0 14.9 3.5L21 14"/><path d="M21 20v-6h-6"/>',
  diagnostico: '<rect x="5" y="4" width="14" height="17" rx="2"/><path d="M9 4V2.5h6V4"/><path d="M8 13h2l1.5-3 2 6 1.5-3h1"/>',
  reasignar: '<path d="M7 4 3 8l4 4"/><path d="M3 8h13a4 4 0 0 1 4 4"/><path d="m17 20 4-4-4-4"/><path d="M21 16H8a4 4 0 0 1-4-4"/>',
  dinero: '<rect x="2.5" y="6" width="19" height="12" rx="2"/><circle cx="12" cy="12" r="2.5"/><path d="M6 9.5v.01M18 14.5v.01"/>',
  ubicacion: '<path d="M12 21s7-6.2 7-11.5a7 7 0 0 0-14 0C5 14.8 12 21 12 21z"/><circle cx="12" cy="9.5" r="2.5"/>',
  documento: '<path d="M14 3H6.5A1.5 1.5 0 0 0 5 4.5v15A1.5 1.5 0 0 0 6.5 21h11a1.5 1.5 0 0 0 1.5-1.5V8z"/><path d="M14 3v5h5M9 13h6M9 17h6"/>',
  sol: '<circle cx="12" cy="12" r="4"/><path d="M12 2.5v2M12 19.5v2M4.6 4.6 6 6M18 18l1.4 1.4M2.5 12h2M19.5 12h2M4.6 19.4 6 18M18 6l1.4-1.4"/>',
  luna: '<path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z"/>',
  candado: '<rect x="4.5" y="10.5" width="15" height="10.5" rx="2"/><path d="M8 10.5V7a4 4 0 0 1 8 0v3.5"/>',
  herramienta: '<path d="M14.7 6.3a4.5 4.5 0 0 0 5.6 5.6L12 20.2a2.1 2.1 0 0 1-3-3z"/><path d="m17 3.5-2.3 2.8"/>',
  grafico: '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>',
  pulso: '<path d="M3 12h4l2.5-6 4 12 2.5-6h5"/>',
  salir: '<path d="M9 21H5.5A1.5 1.5 0 0 1 4 19.5v-15A1.5 1.5 0 0 1 5.5 3H9"/><path d="M16 17l5-5-5-5M21 12H9"/>',
  ojo: '<path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
  ojoCerrado: '<path d="M3 3l18 18"/><path d="M10.6 5.1A9.7 9.7 0 0 1 12 5c6.4 0 10 7 10 7a17 17 0 0 1-3.2 4M6.5 6.6C3.6 8.4 2 12 2 12s3.6 7 10 7c1.6 0 3-.4 4.3-1"/><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2"/>',
  bloquear: '<circle cx="12" cy="12" r="9"/><path d="m5.6 5.6 12.8 12.8"/>',
  mas: '<path d="M12 5v14M5 12h14"/>',
  papelera: '<path d="M4 7h16M10 3h4M6 7l1 13h10l1-13M10 11v6M14 11v6"/>',
};

const VARIANTES_POR_ESTADO = {
  'Pendiente de pago': 'alerta',
  Confirmada: 'info',
  Reprogramada: 'violeta',
  Atendida: 'exito',
  Cancelada: 'peligro',
  Pendiente: 'alerta',
  Pagado: 'exito',
  Reembolsado: 'neutro',
  disponible: 'exito',
  ocupado: 'info',
  bloqueado: 'neutro',
};

const MAPA_ESCAPE = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
const DURACION_TOAST_MS = 3800;

const formatoMoneda = new Intl.NumberFormat('es-PE', { style: 'currency', currency: 'PEN' });

export function icono(nombre, clase = '') {
  return `<svg class="icono${clase ? ` ${clase}` : ''}" viewBox="0 0 24 24" aria-hidden="true" focusable="false">${ICONOS[nombre] ?? ICONOS.info}</svg>`;
}

export function escaparHtml(valor) {
  return String(valor ?? '').replace(/[&<>"']/g, (caracter) => MAPA_ESCAPE[caracter]);
}

export function formatearMoneda(monto) {
  return formatoMoneda.format(monto ?? 0);
}

export function obtenerIniciales(nombre = '') {
  return nombre
    .replace(/^(Dr|Dra)\.\s+/i, '')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((parte) => parte[0])
    .join('')
    .toUpperCase();
}

export function renderizarAvatar(nombre, modificador = '') {
  return `<span class="avatar${modificador ? ` avatar--${modificador}` : ''}" aria-hidden="true">${escaparHtml(obtenerIniciales(nombre))}</span>`;
}

export function insigniaEstado(estado) {
  return `<span class="insignia insignia--${VARIANTES_POR_ESTADO[estado] ?? 'neutro'}">${escaparHtml(estado)}</span>`;
}

export function renderizarEncabezado({ titulo, descripcion = '', migas = [], acciones = '', conMigas = true }) {
  const rastro = conMigas
    ? `<nav class="migas" aria-label="Ruta de navegación">
        <a href="${construirHash('inicio')}">Inicio</a>
        ${migas.map((miga) => `${icono('chevronDerecha')}<a href="${miga.href}">${escaparHtml(miga.texto)}</a>`).join('')}
        ${icono('chevronDerecha')}<span aria-current="page">${escaparHtml(titulo)}</span>
      </nav>`
    : '';
  return `
    <header class="encabezado-modulo">
      ${rastro}
      <div class="encabezado-modulo__fila">
        <div>
          <h1 class="encabezado-modulo__titulo">${escaparHtml(titulo)}</h1>
          ${descripcion ? `<p class="encabezado-modulo__descripcion">${escaparHtml(descripcion)}</p>` : ''}
        </div>
        ${acciones ? `<div class="encabezado-modulo__acciones">${acciones}</div>` : ''}
      </div>
    </header>`;
}

export function renderizarStepper(pasos, indiceActual) {
  const elementos = pasos.map((paso, indice) => {
    const estado = indice < indiceActual ? 'completado' : indice === indiceActual ? 'actual' : 'pendiente';
    return `
      <li class="stepper__paso stepper__paso--${estado}"${estado === 'actual' ? ' aria-current="step"' : ''}>
        <span class="stepper__marcador">${estado === 'completado' ? icono('check') : indice + 1}</span>
        <span class="stepper__etiqueta">${escaparHtml(paso)}</span>
      </li>`;
  });
  return `<ol class="stepper" aria-label="Progreso del trámite">${elementos.join('')}</ol>`;
}

export function renderizarAviso({ tipo = 'info', titulo = '', mensaje = '', iconoAviso }) {
  const iconoPorTipo = { info: 'info', alerta: 'alerta', peligro: 'alerta', exito: 'check' };
  return `
    <div class="aviso aviso--${tipo}" role="${tipo === 'peligro' ? 'alert' : 'note'}">
      ${icono(iconoAviso ?? iconoPorTipo[tipo])}
      <div>${titulo ? `<strong>${escaparHtml(titulo)}</strong>` : ''}${escaparHtml(mensaje)}</div>
    </div>`;
}

export function renderizarVacio({ iconoVacio = 'calendario', titulo, mensaje = '', accion = '' }) {
  return `
    <div class="vacio">
      <span class="vacio__icono">${icono(iconoVacio)}</span>
      <strong class="vacio__titulo">${escaparHtml(titulo)}</strong>
      ${mensaje ? `<p class="vacio__mensaje">${escaparHtml(mensaje)}</p>` : ''}
      ${accion}
    </div>`;
}

export function renderizarEnConstruccion({ casoUso, responsable, alcance }) {
  return `
    <div class="en-construccion">
      <span class="en-construccion__icono">${icono('herramienta')}</span>
      <div>
        <p class="en-construccion__etiqueta">${escaparHtml(casoUso)} · En desarrollo</p>
        <p class="en-construccion__texto">${escaparHtml(alcance)}</p>
        <p class="en-construccion__responsable">Responsable: <strong>${escaparHtml(responsable)}</strong></p>
      </div>
    </div>`;
}

const CONTENIDO_FILA_CITA = {
  medico: (cita) => ({
    titulo: cita.medico?.nombre,
    detalle: `${cita.medico?.especialidad?.nombre ?? ''} · ${cita.consultorio}`,
  }),
  paciente: (cita) => ({
    titulo: cita.paciente?.nombre,
    detalle: cita.motivo || 'Sin motivo registrado',
  }),
  ambos: (cita) => ({
    titulo: cita.paciente?.nombre,
    detalle: `${cita.medico?.nombre ?? ''} · ${cita.medico?.especialidad?.nombre ?? ''}`,
  }),
};

export function renderizarFilaCita(cita, { mostrar = 'medico', href, seleccionada = false } = {}) {
  const { dia, mes } = partesDeFecha(cita.fecha);
  const { titulo, detalle } = CONTENIDO_FILA_CITA[mostrar](cita);
  return `
    <li>
      <a class="fila-cita${seleccionada ? ' fila-cita--seleccionada' : ''}" href="${href ?? construirHash('detalle-cita', { id: cita.id })}" aria-label="${escaparHtml(`${titulo}, ${formatearFecha(cita.fecha)} a las ${cita.hora}, ${cita.estado}`)}">
        <span class="fila-cita__fecha"><b>${dia}</b><small>${escaparHtml(mes)}</small></span>
        <span class="fila-cita__info">
          <strong>${escaparHtml(titulo)}</strong>
          <small>${escaparHtml(detalle)}</small>
        </span>
        <span class="fila-cita__meta">
          <span class="fila-cita__hora">${icono('reloj')}${escaparHtml(cita.hora)}</span>
          ${insigniaEstado(cita.estado)}
        </span>
        ${icono('chevronDerecha', 'fila-cita__ir')}
      </a>
    </li>`;
}

export function renderizarListaCitas(citas, { seleccionadaId = null, crearEnlace = null, ...opciones } = {}) {
  const filas = citas.map((cita) => renderizarFilaCita(cita, {
    ...opciones,
    href: crearEnlace ? crearEnlace(cita) : undefined,
    seleccionada: cita.id === seleccionadaId,
  }));
  return `<ul class="lista-citas">${filas.join('')}</ul>`;
}

function obtenerEnfocables(contenedor) {
  return [...contenedor.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])')]
    .filter((elemento) => !elemento.disabled && elemento.offsetParent !== null);
}

export function abrirModal({ titulo, contenido, acciones = [{ texto: 'Cerrar', valor: null }], tamano = 'normal', alMontar }) {
  return new Promise((resolver) => {
    const elementoPrevio = document.activeElement;
    const fondo = document.createElement('div');
    fondo.className = 'modal-fondo';
    fondo.innerHTML = `
      <div class="modal${tamano === 'grande' ? ' modal--grande' : ''}" role="dialog" aria-modal="true" aria-labelledby="tituloModal">
        <header class="modal__cabecera">
          <h2 id="tituloModal">${escaparHtml(titulo)}</h2>
          <button class="modal__cerrar" type="button" data-cerrar-modal aria-label="Cerrar">${icono('cerrar')}</button>
        </header>
        <div class="modal__cuerpo">${contenido}</div>
        <footer class="modal__pie">
          ${acciones.map((accion, indice) => `<button class="boton boton--${accion.variante ?? 'secundario'}" type="button" data-indice-accion="${indice}">${escaparHtml(accion.texto)}</button>`).join('')}
        </footer>
      </div>`;

    const modal = fondo.querySelector('.modal');

    function cerrar(valor) {
      document.removeEventListener('keydown', alPresionarTecla);
      fondo.remove();
      if (!document.querySelector('.modal-fondo')) document.body.classList.remove('modal-abierto');
      elementoPrevio?.focus?.();
      resolver(valor);
    }

    function alPresionarTecla(evento) {
      if (evento.key === 'Escape') {
        cerrar(null);
        return;
      }
      if (evento.key !== 'Tab') return;
      const enfocables = obtenerEnfocables(modal);
      const primero = enfocables[0];
      const ultimo = enfocables.at(-1);
      if (evento.shiftKey && document.activeElement === primero) {
        evento.preventDefault();
        ultimo.focus();
      } else if (!evento.shiftKey && document.activeElement === ultimo) {
        evento.preventDefault();
        primero.focus();
      }
    }

    fondo.addEventListener('click', (evento) => {
      if (evento.target === fondo || evento.target.closest('[data-cerrar-modal]')) {
        cerrar(null);
        return;
      }
      const boton = evento.target.closest('[data-indice-accion]');
      if (!boton) return;
      const accion = acciones[Number(boton.dataset.indiceAccion)];
      if (typeof accion.alElegir !== 'function') {
        cerrar(accion.valor);
        return;
      }
      const valorValidado = accion.alElegir(modal);
      if (valorValidado !== undefined) cerrar(valorValidado);
    });

    document.addEventListener('keydown', alPresionarTecla);
    document.getElementById('capaModal').append(fondo);
    document.body.classList.add('modal-abierto');
    alMontar?.(modal);
    (modal.querySelector('[autofocus]') ?? modal.querySelector('.modal__pie .boton:last-child'))?.focus();
  });
}

export async function confirmarAccion({ titulo, mensaje, detalle = '', textoConfirmar = 'Confirmar', textoCancelar = 'Volver', peligro = false }) {
  const contenido = `
    <div class="confirmacion">
      <span class="confirmacion__icono${peligro ? ' confirmacion__icono--peligro' : ''}">${icono(peligro ? 'alerta' : 'info')}</span>
      <p>${escaparHtml(mensaje)}</p>
    </div>
    ${detalle}`;
  const respuesta = await abrirModal({
    titulo,
    contenido,
    acciones: [
      { texto: textoCancelar, valor: false, variante: 'secundario' },
      { texto: textoConfirmar, valor: true, variante: peligro ? 'peligro' : 'primario' },
    ],
  });
  return respuesta === true;
}

export function mostrarToast(mensaje, tipo = 'exito') {
  const contenedor = document.getElementById('contenedorToast');
  const iconoPorTipo = { exito: 'check', error: 'alerta', info: 'info' };
  const toast = document.createElement('div');
  toast.className = `toast toast--${tipo}`;
  toast.innerHTML = `${icono(iconoPorTipo[tipo] ?? 'info')}<span>${escaparHtml(mensaje)}</span>`;
  contenedor.append(toast);
  setTimeout(() => {
    toast.classList.add('toast--saliendo');
    toast.addEventListener('transitionend', () => toast.remove(), { once: true });
    setTimeout(() => toast.remove(), 400);
  }, DURACION_TOAST_MS);
}

export function enfocar(contenedor, selector) {
  contenedor.querySelector(selector)?.focus({ preventScroll: false });
}
