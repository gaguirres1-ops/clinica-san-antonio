import * as storage from '../core/storage.js';
import {
  ErrorDeDominio,
  esCitaActiva,
  esCitaFutura,
  esHorarioReservable,
  liberarHorario,
  listarCitas,
  listarMedicos,
  notificar,
  obtenerCitaDetallada,
  obtenerMedico,
  ocuparHorario,
  registrarEventoCita,
} from '../core/dominio.js';
import { formatearFecha, formatearFechaLarga } from '../core/fechas.js';
import { construirHash } from '../core/navigation.js';
import {
  confirmarAccion,
  escaparHtml,
  icono,
  mostrarToast,
  renderizarAviso,
  renderizarAvatar,
  renderizarEncabezado,
  renderizarListaCitas,
  renderizarStepper,
  renderizarVacio,
} from '../core/ui.js';

const ID_MODULO = 'reasignar-medico';
const PASOS = ['Seleccionar cita', 'Nuevo médico', 'Confirmación'];
const PASO_SELECCION = 0;
const PASO_MEDICO = 1;
const PASO_CONFIRMACION = 2;

function esCitaReasignable(cita) {
  return Boolean(cita) && esCitaActiva(cita) && esCitaFutura(cita);
}

function buscarHorarioEquivalente(medicoId, cita) {
  return storage.buscar('horarios', (horario) => horario.medicoId === medicoId
    && horario.fecha === cita.fecha
    && horario.hora === cita.hora);
}

function listarMedicosCompatibles(cita) {
  return listarMedicos()
    .filter((medico) => medico.id !== cita.medicoId && medico.especialidadId === cita.especialidadId)
    .filter((medico) => esHorarioReservable(buscarHorarioEquivalente(medico.id, cita)));
}

function reasignarCita({ citaId, medicoDestinoId, actor }) {
  return storage.ejecutarTransaccion(() => {
    const cita = obtenerCitaDetallada(citaId);
    if (!esCitaReasignable(cita)) {
      throw new ErrorDeDominio('La cita ya no admite reasignación.', 'cita-no-reasignable');
    }
    const destino = obtenerMedico(medicoDestinoId);
    if (!destino?.activo || destino.especialidadId !== cita.especialidadId || destino.id === cita.medicoId) {
      throw new ErrorDeDominio('El médico elegido no es compatible con esta cita.', 'medico-incompatible');
    }
    const horarioDestino = buscarHorarioEquivalente(destino.id, cita);
    if (!horarioDestino) throw new ErrorDeDominio('El médico elegido no tiene ese horario.', 'horario-inexistente');

    const medicoSaliente = cita.medico;
    ocuparHorario(horarioDestino.id, citaId);
    liberarHorario(cita.horarioId);
    storage.actualizar('citas', citaId, {
      medicoId: destino.id,
      horarioId: horarioDestino.id,
      consultorio: destino.consultorio,
    });
    registrarEventoCita(citaId, `Médico reasignado de ${medicoSaliente.nombre} a ${destino.nombre}.`, actor);

    const fechaHora = `${formatearFecha(cita.fecha)} a las ${cita.hora}`;
    notificar({
      destinatarioRol: 'paciente',
      destinatarioId: cita.pacienteId,
      titulo: 'Cambio de médico',
      mensaje: `Tu cita del ${fechaHora} ahora será atendida por ${destino.nombre}.`,
      citaId,
    });
    notificar({
      destinatarioRol: 'medico',
      destinatarioId: medicoSaliente.id,
      titulo: 'Cita reasignada',
      mensaje: `La cita del ${fechaHora} fue transferida a ${destino.nombre}. Tu horario quedó libre.`,
      citaId,
    });
    notificar({
      destinatarioRol: 'medico',
      destinatarioId: destino.id,
      titulo: 'Nueva cita asignada',
      mensaje: `Se te asignó la cita de ${cita.paciente.nombre} del ${fechaHora}.`,
      citaId,
    });
    return { cita: obtenerCitaDetallada(citaId), medicoSaliente, medicoDestino: destino };
  });
}

function renderizarPasoSeleccion(estado) {
  const citas = listarCitas(esCitaReasignable);
  const aviso = estado.avisoSeleccion ? renderizarAviso({ tipo: 'alerta', mensaje: estado.avisoSeleccion }) : '';
  if (!citas.length) {
    return `<section class="panel">${aviso}${renderizarVacio({ iconoVacio: 'reasignar', titulo: 'No hay citas que puedan reasignarse' })}</section>`;
  }
  return `
    <section class="panel">
      <h2 class="panel__titulo">Citas activas</h2>
      ${aviso}
      ${renderizarListaCitas(citas, { mostrar: 'ambos', crearEnlace: (cita) => construirHash(ID_MODULO, { cita: cita.id }) })}
    </section>`;
}

function renderizarTarjetaMedico(medico, seleccionado) {
  return `
    <button class="tarjeta-medico${seleccionado ? ' tarjeta-medico--seleccionada' : ''}" type="button" data-accion="elegir-medico" data-medico="${escaparHtml(medico.id)}" aria-pressed="${seleccionado}">
      ${renderizarAvatar(medico.nombre)}
      <span class="tarjeta-medico__cuerpo">
        <span class="tarjeta-medico__especialidad">${escaparHtml(medico.especialidad?.nombre ?? '')}</span>
        <span class="tarjeta-medico__nombre">${escaparHtml(medico.nombre)}</span>
        <span class="tarjeta-medico__dato">${escaparHtml(medico.consultorio)}</span>
      </span>
      ${seleccionado ? `<span class="tarjeta-medico__marca">${icono('check')}</span>` : ''}
    </button>`;
}

function renderizarPasoMedico(estado) {
  const cita = obtenerCitaDetallada(estado.citaId);
  const compatibles = listarMedicosCompatibles(cita);
  return `
    <div class="reasignacion">
      <section class="panel">
        <h2 class="panel__titulo">Médicos disponibles en este horario</h2>
        ${compatibles.length
    ? `<div class="rejilla-medicos">${compatibles.map((medico) => renderizarTarjetaMedico(medico, medico.id === estado.medicoDestinoId)).join('')}</div>`
    : renderizarVacio({ iconoVacio: 'estetoscopio', titulo: 'No hay médicos disponibles', mensaje: `Ningún médico de ${cita.medico.especialidad?.nombre ?? 'la misma especialidad'} tiene libre este horario.` })}
        <div class="acciones-paso">
          <a class="boton boton--secundario" href="${construirHash(ID_MODULO)}">${icono('flechaIzquierda')}Cambiar cita</a>
          <button class="boton boton--primario" type="button" data-accion="reasignar"${estado.medicoDestinoId ? '' : ' disabled'}>${icono('reasignar')}Reasignar médico</button>
        </div>
      </section>
      <aside class="panel">
        <h2 class="panel__titulo">Datos que no cambian</h2>
        <dl class="lista-datos lista-datos--apilada">
          <div><dt>Paciente</dt><dd>${escaparHtml(cita.paciente.nombre)}</dd></div>
          <div><dt>Fecha</dt><dd>${escaparHtml(formatearFechaLarga(cita.fecha))}</dd></div>
          <div><dt>Hora</dt><dd>${escaparHtml(cita.hora)}</dd></div>
          <div><dt>Médico actual</dt><dd>${escaparHtml(cita.medico.nombre)}</dd></div>
        </dl>
      </aside>
    </div>`;
}

function renderizarComparacion(cita, medicoDestino) {
  return `
    <div class="comparacion">
      <div class="comparacion__medico"><small>Médico actual</small><strong>${escaparHtml(cita.medico.nombre)}</strong></div>
      ${icono('flechaDerecha')}
      <div class="comparacion__medico"><small>Nuevo médico</small><strong>${escaparHtml(medicoDestino.nombre)}</strong></div>
    </div>`;
}

function renderizarPasoConfirmacion({ resultado }) {
  const { cita, medicoSaliente, medicoDestino } = resultado;
  return `
    <section class="panel exito-reserva">
      <span class="exito-reserva__anillo"><span>${icono('check')}</span></span>
      <h2 class="exito-reserva__titulo" data-titulo-paso tabindex="-1">Médico reasignado correctamente</h2>
      <div class="ticket">
        <div class="ticket__fila">${icono('usuario')}<span>Paciente</span><b>${escaparHtml(cita.paciente.nombre)}</b></div>
        <div class="ticket__fila">${icono('calendario')}<span>Fecha</span><b>${escaparHtml(formatearFechaLarga(cita.fecha))}, ${escaparHtml(cita.hora)}</b></div>
        <div class="ticket__fila">${icono('estetoscopio')}<span>Anterior</span><b>${escaparHtml(medicoSaliente.nombre)}</b></div>
        <div class="ticket__fila">${icono('reasignar')}<span>Nuevo</span><b>${escaparHtml(medicoDestino.nombre)}</b></div>
      </div>
      <div class="exito-reserva__acciones">
        <a class="boton boton--primario" href="${construirHash('detalle-cita', { id: cita.id })}">${icono('documento')}Ver detalle de la cita</a>
        <a class="boton boton--secundario" href="${construirHash(ID_MODULO)}">Reasignar otra cita</a>
      </div>
    </section>`;
}

export default {
  id: ID_MODULO,
  titulo: 'Reasignar médico',
  icono: 'reasignar',
  roles: ['administrador'],
  seccion: 'Gestión',
  montar(contenedor, { usuario, params }) {
    const citaSolicitada = params.cita ? obtenerCitaDetallada(params.cita) : null;
    const citaValida = esCitaReasignable(citaSolicitada);
    const estado = {
      paso: citaValida ? PASO_MEDICO : PASO_SELECCION,
      citaId: citaValida ? params.cita : null,
      medicoDestinoId: null,
      resultado: null,
      avisoSeleccion: params.cita && !citaValida ? 'La cita elegida no admite reasignación.' : '',
    };

    function renderizar() {
      if (estado.paso === PASO_MEDICO && !esCitaReasignable(obtenerCitaDetallada(estado.citaId))) {
        estado.paso = PASO_SELECCION;
        estado.citaId = null;
      }
      const contenidoPorPaso = {
        [PASO_SELECCION]: () => renderizarPasoSeleccion(estado),
        [PASO_MEDICO]: () => renderizarPasoMedico(estado),
        [PASO_CONFIRMACION]: () => renderizarPasoConfirmacion(estado),
      };
      contenedor.innerHTML = `
        ${renderizarEncabezado({ titulo: 'Reasignar médico' })}
        ${renderizarStepper(PASOS, estado.paso)}
        ${contenidoPorPaso[estado.paso]()}`;
    }

    async function confirmarReasignacion() {
      const cita = obtenerCitaDetallada(estado.citaId);
      const medicoDestino = obtenerMedico(estado.medicoDestinoId);
      const confirmado = await confirmarAccion({
        titulo: 'Confirmar reasignación',
        mensaje: 'Se conservarán la fecha, la hora y la especialidad. Se notificará al paciente y a ambos médicos.',
        detalle: renderizarComparacion(cita, medicoDestino),
        textoConfirmar: 'Confirmar reasignación',
      });
      if (!confirmado) return;

      try {
        estado.resultado = reasignarCita({ citaId: estado.citaId, medicoDestinoId: estado.medicoDestinoId, actor: usuario.nombre });
        estado.paso = PASO_CONFIRMACION;
        renderizar();
        contenedor.querySelector('[data-titulo-paso]')?.focus();
      } catch (error) {
        if (!(error instanceof ErrorDeDominio)) throw error;
        mostrarToast(error.message, 'error');
        estado.medicoDestinoId = null;
        renderizar();
      }
    }

    contenedor.addEventListener('click', (evento) => {
      const elemento = evento.target.closest('[data-accion]');
      if (!elemento || elemento.disabled) return;
      if (elemento.dataset.accion === 'elegir-medico') {
        estado.medicoDestinoId = elemento.dataset.medico;
        renderizar();
        contenedor.querySelector('.tarjeta-medico--seleccionada')?.focus();
      }
      if (elemento.dataset.accion === 'reasignar') confirmarReasignacion();
    });

    renderizar();
    return storage.suscribir(() => {
      if (estado.paso !== PASO_CONFIRMACION) renderizar();
    });
  },
};
