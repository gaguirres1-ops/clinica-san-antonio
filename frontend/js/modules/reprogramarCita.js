import * as storage from '../core/storage.js';
import {
  ErrorDeDominio,
  ESTADOS_PAGO,
  esHorarioReservable,
  listarMedicos,
  obtenerCitaDetallada,
  obtenerMedico,
} from '../core/dominio.js';
import {
  c_registrarReprogramacion,
  c_validarReprogramacion,
} from '../core/controlesCita.js';
import { formatearDiaCorto, formatearFecha, formatearFechaLarga, formatearMomento } from '../core/fechas.js';
import { construirHash } from '../core/navigation.js';
import {
  abrirModal,
  escaparHtml,
  icono,
  mostrarToast,
  renderizarAviso,
  renderizarAvatarMedico,
  renderizarEncabezado,
  renderizarVacio,
} from '../core/ui.js';

const ID_MODULO = 'reprogramar-cita';
const LIMITE_FECHAS = 8;

function listarHorariosNuevos(medicoId, cita) {
  return storage
    .filtrar('horarios', (horario) => horario.medicoId === medicoId && horario.fecha > cita.fecha)
    .filter(esHorarioReservable)
    .sort((a, b) => `${a.fecha}${a.hora}`.localeCompare(`${b.fecha}${b.hora}`));
}

function agruparPorFecha(horarios) {
  return horarios.reduce((grupos, horario) => grupos.set(horario.fecha, [...(grupos.get(horario.fecha) ?? []), horario]), new Map());
}

function c_mostrarConfirmacion(cita) {
  const pagoPendiente = cita.pago?.estado === ESTADOS_PAGO.PENDIENTE;
  return abrirModal({
    titulo: 'Cita reprogramada',
    contenido: `
      <div class="confirmacion-final">
        <span class="exito-reserva__anillo"><span>${icono('check')}</span></span>
        <h3>Reprogramación registrada correctamente</h3>
        <div class="ticket">
          <div class="ticket__fila">${icono('estetoscopio')}<span>Médico</span><b>${escaparHtml(cita.medico.nombre)}</b></div>
          <div class="ticket__fila">${icono('calendario')}<span>Fecha</span><b>${escaparHtml(formatearFechaLarga(cita.fecha))}</b></div>
          <div class="ticket__fila">${icono('reloj')}<span>Hora</span><b>${escaparHtml(cita.hora)}</b></div>
        </div>
        <p class="confirmacion-final__nota">La cita conserva su código y ya no podrá ser reprogramada nuevamente.</p>
        ${pagoPendiente ? renderizarAviso({ tipo: 'alerta', titulo: 'Nuevo límite de pago', mensaje: formatearMomento(cita.pago.fechaLimite) }) : ''}
      </div>`,
    acciones: [{ texto: 'Cerrar', valor: null, variante: 'primario' }],
  });
}

function renderizarSelectorDeMedico(cita, medicoId) {
  const medicos = listarMedicos().filter((medico) => medico.especialidadId === cita.especialidadId);
  return `
    <div class="rejilla-medicos">
      ${medicos.map((medico) => `
        <button class="tarjeta-medico${medico.id === medicoId ? ' tarjeta-medico--seleccionada' : ''}" type="button" data-accion="elegir-medico" data-medico="${escaparHtml(medico.id)}" aria-pressed="${medico.id === medicoId}">
          ${renderizarAvatarMedico(medico, 'tarjeta')}
          <span class="tarjeta-medico__cuerpo">
            <span class="tarjeta-medico__especialidad">${escaparHtml(medico.especialidad?.nombre ?? '')}</span>
            <span class="tarjeta-medico__nombre">${escaparHtml(medico.nombre)}</span>
            <span class="tarjeta-medico__dato">CMP ${escaparHtml(medico.cmp)}</span>
          </span>
          ${medico.id === medicoId ? `<span class="tarjeta-medico__marca">${icono('check')}</span>` : ''}
        </button>`).join('')}
    </div>`;
}

function renderizarFechas(grupos, estado) {
  if (!grupos.size) {
    return renderizarVacio({ iconoVacio: 'calendario', titulo: 'Sin horarios disponibles', mensaje: 'Este médico no tiene horarios libres posteriores a la fecha actual de tu cita. Elige otro médico.' });
  }
  return `
    <ul class="fechas-sugeridas">
      ${[...grupos.entries()].slice(0, LIMITE_FECHAS).map(([fecha, horarios]) => `
        <li>
          <button class="fecha-sugerida" type="button" data-accion="elegir-fecha" data-fecha="${fecha}" aria-pressed="${fecha === estado.fecha}">
            <span class="fecha-sugerida__dia">${escaparHtml(formatearDiaCorto(fecha))}</span>
            <span class="fecha-sugerida__cupos">${horarios.length} libres</span>
          </button>
        </li>`).join('')}
    </ul>`;
}

function renderizarHorarios(grupos, estado) {
  if (!estado.fecha) return '<p class="agenda-reserva__sugerencia">Selecciona primero una fecha.</p>';
  return `
    <div class="grupo-franjas__lista">
      ${(grupos.get(estado.fecha) ?? []).map((horario) => `
        <button class="franja" type="button" data-accion="elegir-horario" data-horario="${escaparHtml(horario.id)}" aria-pressed="${horario.id === estado.horarioId}">
          <span class="franja__hora">${escaparHtml(horario.hora)}</span>
          <span class="franja__estado">Libre</span>
        </button>`).join('')}
    </div>`;
}

function renderizarComparacion(cita, horarioNuevo) {
  if (!horarioNuevo) return '';
  const medicoNuevo = obtenerMedico(horarioNuevo.medicoId);
  return `
    <h2 class="panel__titulo panel__titulo--separado">Confirma los nuevos datos</h2>
    <div class="comparacion comparacion--doble">
      <div class="comparacion__medico"><small>Cita actual</small><strong>${escaparHtml(cita.medico.nombre)}</strong><span>${escaparHtml(formatearFecha(cita.fecha))} · ${escaparHtml(cita.hora)}</span></div>
      ${icono('flechaDerecha')}
      <div class="comparacion__medico"><small>Nueva programación</small><strong>${escaparHtml(medicoNuevo.nombre)}</strong><span>${escaparHtml(formatearFecha(horarioNuevo.fecha))} · ${escaparHtml(horarioNuevo.hora)}</span></div>
    </div>`;
}

function renderizarInterfaz(estado) {
  const cita = obtenerCitaDetallada(estado.citaId);
  const grupos = agruparPorFecha(listarHorariosNuevos(estado.medicoId, cita));
  const horarioNuevo = estado.horarioId ? storage.obtenerPorId('horarios', estado.horarioId) : null;
  return `
    ${renderizarEncabezado({
    titulo: 'Reprogramar cita',
    migas: [{ texto: 'Detalle de cita', href: construirHash('detalle-cita', { id: cita.id }) }],
  })}
    <section class="panel">
      ${renderizarAviso({ tipo: 'info', titulo: 'Regla de reprogramación', mensaje: `Solo puede hacerse una vez. La nueva fecha debe ser posterior al ${formatearFecha(cita.fecha)}. Si el pago está pendiente, su límite se recalculará.` })}
      ${estado.error ? renderizarAviso({ tipo: 'peligro', titulo: 'Horario no disponible', mensaje: estado.error }) : ''}
      <h2 class="panel__titulo panel__titulo--separado">1. Selecciona un médico</h2>
      ${renderizarSelectorDeMedico(cita, estado.medicoId)}
      <h2 class="panel__titulo panel__titulo--separado">2. Consulta disponibilidad</h2>
      ${renderizarFechas(grupos, estado)}
      <h2 class="panel__titulo panel__titulo--separado">3. Selecciona un horario</h2>
      ${renderizarHorarios(grupos, estado)}
      ${renderizarComparacion(cita, horarioNuevo)}
      <div class="acciones-paso">
        <a class="boton boton--secundario" href="${construirHash('detalle-cita', { id: cita.id })}">Cancelar proceso</a>
        <button class="boton boton--primario" type="button" data-accion="reprogramar"${horarioNuevo ? '' : ' disabled'}>${icono('reprogramar')}Confirmar reprogramación</button>
      </div>
    </section>`;
}

export default {
  id: ID_MODULO,
  titulo: 'Reprogramar cita',
  icono: 'reprogramar',
  roles: ['paciente'],
  seccion: 'Citas',
  menu: false,
  montar(contenedor, { usuario, params, navegar }) {
    const citaId = params.cita ?? null;
    const { cita, reglas, valida } = c_validarReprogramacion(citaId);

    if (!cita || cita.pacienteId !== usuario.id) {
      mostrarToast('Selecciona una cita desde «Mis citas» para reprogramarla.', 'info');
      navegar('inicio');
      return null;
    }
    if (!valida) {
      const motivo = reglas.find((regla) => !regla.cumple)?.texto ?? 'La cita no admite reprogramación.';
      mostrarToast(`No se puede reprogramar: ${motivo.toLowerCase()}.`, 'error');
      navegar('detalle-cita', { id: cita.id });
      return null;
    }

    const estado = { citaId, medicoId: cita.medicoId, fecha: null, horarioId: null, error: '' };

    function renderizar() {
      contenedor.innerHTML = renderizarInterfaz(estado);
    }

    function confirmarReprogramacion() {
      try {
        const citaActualizada = c_registrarReprogramacion({ citaId, horarioId: estado.horarioId, actor: usuario.nombre });
        navegar('detalle-cita', { id: citaId });
        c_mostrarConfirmacion(citaActualizada);
      } catch (error) {
        if (!(error instanceof ErrorDeDominio)) throw error;
        estado.error = error.message;
        estado.horarioId = null;
        renderizar();
        mostrarToast(error.message, 'error');
      }
    }

    const acciones = {
      'elegir-medico': (elemento) => Object.assign(estado, { medicoId: elemento.dataset.medico, fecha: null, horarioId: null, error: '' }),
      'elegir-fecha': (elemento) => Object.assign(estado, { fecha: elemento.dataset.fecha, horarioId: null, error: '' }),
      'elegir-horario': (elemento) => Object.assign(estado, { horarioId: elemento.dataset.horario, error: '' }),
    };

    contenedor.addEventListener('click', (evento) => {
      const elemento = evento.target.closest('[data-accion]');
      if (!elemento || elemento.disabled) return;
      if (elemento.dataset.accion === 'reprogramar') {
        confirmarReprogramacion();
        return;
      }
      if (acciones[elemento.dataset.accion]) {
        acciones[elemento.dataset.accion](elemento);
        renderizar();
      }
    });

    renderizar();
    return null;
  },
};
