import * as storage from './storage.js';
import { ESTADOS_CITA, esCitaActiva, esCitaFutura, obtenerCitaDetallada, puedeVerCita } from './dominio.js';
import { formatearFecha, formatearFechaLarga, formatearMomento } from './fechas.js';
import { construirHash, puedeAcceder } from './navigation.js';
import {
  escaparHtml,
  formatearMoneda,
  icono,
  insigniaEstado,
  renderizarAviso,
  renderizarAvatar,
  renderizarEncabezado,
  renderizarVacio,
} from './ui.js';

const ACCIONES_DISPONIBLES = [
  {
    ruta: 'reprogramar-cita', texto: 'Reprogramar cita', iconoAccion: 'reprogramar', variante: 'secundario',
    aplica: (cita) => esCitaActiva(cita) && esCitaFutura(cita),
  },
  {
    ruta: 'reasignar-medico', texto: 'Reasignar médico', iconoAccion: 'reasignar', variante: 'secundario',
    aplica: (cita) => esCitaActiva(cita) && esCitaFutura(cita),
  },
  {
    ruta: 'diagnostico', texto: 'Registrar diagnóstico', iconoAccion: 'diagnostico', variante: 'primario',
    aplica: (cita) => [ESTADOS_CITA.CONFIRMADA, ESTADOS_CITA.REPROGRAMADA].includes(cita.estado) && !cita.diagnostico,
  },
  {
    ruta: 'cancelar-cita', texto: 'Cancelar cita', iconoAccion: 'cancelar', variante: 'peligro-suave',
    aplica: (cita) => esCitaActiva(cita) && esCitaFutura(cita),
  },
];

function renderizarFila(iconoFila, etiqueta, valor) {
  return `
    <div class="ficha__fila">
      ${icono(iconoFila)}
      <span class="ficha__etiqueta">${escaparHtml(etiqueta)}</span>
      <span class="ficha__valor">${valor}</span>
    </div>`;
}

function renderizarPago(pago) {
  if (!pago) return renderizarVacio({ iconoVacio: 'dinero', titulo: 'Sin registro de pago' });
  const fechaReferencia = pago.fechaPago
    ? `Pagado el ${formatearMomento(pago.fechaPago)}`
    : `Fecha límite: ${formatearMomento(pago.fechaLimite)}`;
  return `
    <dl class="lista-datos">
      <div><dt>Monto</dt><dd class="lista-datos__monto">${formatearMoneda(pago.monto)}</dd></div>
      <div><dt>Estado</dt><dd>${insigniaEstado(pago.estado)}</dd></div>
      <div><dt>Método</dt><dd>${escaparHtml(pago.metodo ?? 'Por definir')}</dd></div>
      <div><dt>Referencia</dt><dd>${escaparHtml(fechaReferencia)}</dd></div>
    </dl>`;
}

function renderizarDiagnostico(diagnostico) {
  if (!diagnostico) return '';
  return `
    <section class="panel">
      <header class="panel__cabecera"><h2 class="panel__titulo">Diagnóstico registrado</h2></header>
      <dl class="lista-datos lista-datos--apilada">
        <div><dt>Diagnóstico</dt><dd>${escaparHtml(diagnostico.diagnostico)} <span class="codigo">${escaparHtml(diagnostico.codigoCie10)}</span></dd></div>
        <div><dt>Tratamiento</dt><dd>${escaparHtml(diagnostico.tratamiento)}</dd></div>
        <div><dt>Indicaciones</dt><dd>${escaparHtml(diagnostico.indicaciones)}</dd></div>
        <div><dt>Observaciones</dt><dd>${escaparHtml(diagnostico.observaciones)}</dd></div>
      </dl>
    </section>`;
}

function renderizarLineaDeTiempo(eventos) {
  const ordenados = [...eventos].sort((a, b) => b.fecha.localeCompare(a.fecha));
  return `
    <ol class="linea-tiempo">
      ${ordenados.map((evento) => `
        <li class="linea-tiempo__evento">
          <time datetime="${escaparHtml(evento.fecha)}">${escaparHtml(formatearMomento(evento.fecha))}</time>
          <p>${escaparHtml(evento.descripcion)}</p>
          <small>${escaparHtml(evento.actor)}</small>
        </li>`).join('')}
    </ol>`;
}

function renderizarAcciones(cita, rol) {
  const acciones = ACCIONES_DISPONIBLES.filter((accion) => puedeAcceder(accion.ruta, rol) && accion.aplica(cita));
  if (!acciones.length) return '';
  return `
    <section class="panel">
      <header class="panel__cabecera"><h2 class="panel__titulo">Acciones</h2></header>
      <div class="acciones-detalle">
        ${acciones.map((accion) => `
          <a class="boton boton--${accion.variante} boton--bloque" href="${construirHash(accion.ruta, { cita: cita.id })}">
            ${icono(accion.iconoAccion)}${escaparHtml(accion.texto)}
          </a>`).join('')}
      </div>
    </section>`;
}

function renderizarDetalle(cita, rol) {
  const avisoPago = cita.estado === ESTADOS_CITA.PENDIENTE_PAGO && cita.pago
    ? renderizarAviso({ tipo: 'alerta', titulo: 'Pago pendiente', mensaje: `Completa el pago antes del ${formatearMomento(cita.pago.fechaLimite)} para confirmar la cita; de lo contrario, el horario será liberado.` })
    : '';

  return `
    ${renderizarEncabezado({ titulo: `Cita ${cita.id}`, descripcion: `Registrada el ${formatearMomento(cita.creadaEn)}` })}
    <div class="detalle-cita">
      <div class="detalle-cita__principal">
        <section class="ficha">
          <header class="ficha__cabecera">
            <div>
              <span>Código de cita</span>
              <b>${escaparHtml(cita.id)}</b>
            </div>
            ${insigniaEstado(cita.estado)}
          </header>
          <div class="ficha__medico">
            ${renderizarAvatar(cita.medico?.nombre ?? '', 'grande')}
            <div>
              <p class="ficha__especialidad">${escaparHtml(cita.medico?.especialidad?.nombre ?? '')}</p>
              <h2>${escaparHtml(cita.medico?.nombre ?? 'Médico no disponible')}</h2>
              <p class="ficha__cmp">CMP ${escaparHtml(cita.medico?.cmp ?? '—')}</p>
            </div>
          </div>
          ${renderizarFila('calendario', 'Fecha', escaparHtml(formatearFechaLarga(cita.fecha)))}
          ${renderizarFila('reloj', 'Hora', escaparHtml(cita.hora))}
          ${renderizarFila('ubicacion', 'Lugar', escaparHtml(cita.consultorio))}
          ${renderizarFila('usuario', 'Paciente', `${escaparHtml(cita.paciente?.nombre ?? '')} <small>DNI ${escaparHtml(cita.paciente?.dni ?? '')}</small>`)}
          ${renderizarFila('documento', 'Motivo', escaparHtml(cita.motivo || 'Sin motivo registrado'))}
        </section>
        ${avisoPago}
        ${renderizarDiagnostico(cita.diagnostico)}
      </div>
      <aside class="detalle-cita__lateral">
        ${renderizarAcciones(cita, rol)}
        <section class="panel">
          <header class="panel__cabecera"><h2 class="panel__titulo">Pago</h2></header>
          ${renderizarPago(cita.pago)}
        </section>
        <section class="panel">
          <header class="panel__cabecera"><h2 class="panel__titulo">Historial de la cita</h2></header>
          ${renderizarLineaDeTiempo(cita.eventos)}
        </section>
      </aside>
    </div>`;
}

function renderizarNoDisponible(titulo, mensaje) {
  return `
    ${renderizarEncabezado({ titulo: 'Detalle de cita' })}
    <section class="panel">
      ${renderizarVacio({
        iconoVacio: 'candado',
        titulo,
        mensaje,
        accion: `<a class="boton boton--secundario" href="${construirHash('inicio')}">${icono('flechaIzquierda')}Volver al inicio</a>`,
      })}
    </section>`;
}

export default {
  id: 'detalle-cita',
  titulo: 'Detalle de cita',
  icono: 'documento',
  roles: ['paciente', 'medico', 'administrador'],
  menu: false,
  montar(contenedor, { params, rol, sesion }) {
    const renderizar = () => {
      const cita = params.id ? obtenerCitaDetallada(params.id) : null;
      if (!cita) {
        contenedor.innerHTML = renderizarNoDisponible('Cita no encontrada', `No existe una cita con el código ${params.id ?? ''}.`);
        return;
      }
      if (!puedeVerCita(cita, sesion)) {
        contenedor.innerHTML = renderizarNoDisponible('Sin acceso a esta cita', `La cita del ${formatearFecha(cita.fecha)} no pertenece al perfil activo.`);
        return;
      }
      contenedor.innerHTML = renderizarDetalle(cita, rol);
    };
    renderizar();
    return storage.suscribir(renderizar);
  },
};
