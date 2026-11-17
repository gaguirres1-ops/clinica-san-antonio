import * as storage from '../core/storage.js';
import {
  ESTADOS_CITA,
  ESTADOS_PAGO,
  ErrorDeDominio,
  corresponderReembolso,
  liberarHorario,
  listarCitas,
  notificar,
  obtenerCitaDetallada,
  puedeCancelarCita,
  registrarEventoCita,
} from '../core/dominio.js';
import { formatearFecha, formatearFechaLarga } from '../core/fechas.js';
import { construirHash } from '../core/navigation.js';
import {
  confirmarAccion,
  escaparHtml,
  icono,
  insigniaEstado,
  mostrarToast,
  renderizarAviso,
  renderizarEncabezado,
  renderizarListaCitas,
  renderizarStepper,
  renderizarVacio,
} from '../core/ui.js';

const ID_MODULO = 'cancelar-cita';
const PASOS = ['Seleccionar cita', 'Motivo de cancelación', 'Confirmación'];
const PASO_SELECCION = 0;
const PASO_MOTIVO = 1;
const PASO_CONFIRMACION = 2;
const LIMITE_MOTIVO = 250;

function puedeGestionarCita(cita, { rol, usuario }) {
  return Boolean(cita) && (rol === 'administrador' || cita.pacienteId === usuario.id);
}

function listarCitasCancelables(contexto) {
  return listarCitas((cita) => puedeGestionarCita(cita, contexto)).filter(puedeCancelarCita);
}

function cancelarCita({ citaId, motivo, actor, rol }) {
  return storage.ejecutarTransaccion(() => {
    const cita = obtenerCitaDetallada(citaId);
    if (!cita || !puedeCancelarCita(cita)) {
      throw new ErrorDeDominio('La cita ya no puede cancelarse.', 'cancelacion-no-permitida');
    }
    const reembolso = corresponderReembolso(cita);

    liberarHorario(cita.horarioId);
    storage.actualizar('citas', citaId, { estado: ESTADOS_CITA.CANCELADA, motivoCancelacion: motivo });
    if (reembolso) storage.actualizar('pagos', cita.pago.id, { estado: ESTADOS_PAGO.REEMBOLSADO });
    registrarEventoCita(
      citaId,
      reembolso ? 'Cita cancelada. Horario liberado y reembolso generado.' : 'Cita cancelada. Horario liberado.',
      actor,
    );

    const fechaHora = `${formatearFecha(cita.fecha)} a las ${cita.hora}`;
    notificar({
      destinatarioRol: 'medico',
      destinatarioId: cita.medicoId,
      titulo: 'Cita cancelada',
      mensaje: `La cita de ${cita.paciente.nombre} del ${fechaHora} fue cancelada. Tu horario quedó libre.`,
      citaId,
    });
    if (rol === 'administrador') {
      notificar({
        destinatarioRol: 'paciente',
        destinatarioId: cita.pacienteId,
        titulo: 'Cita cancelada',
        mensaje: `Tu cita con ${cita.medico.nombre} del ${fechaHora} fue cancelada por administración.`,
        citaId,
      });
    } else {
      notificar({
        destinatarioRol: 'administrador',
        destinatarioId: null,
        titulo: 'Cita cancelada',
        mensaje: `${cita.paciente.nombre} canceló su cita de ${cita.medico.especialidad?.nombre ?? ''}. El horario fue liberado.`,
        citaId,
      });
    }
    return { cita: obtenerCitaDetallada(citaId), reembolso };
  });
}

function renderizarAvisoDeReembolso(cita) {
  if (cita.pago?.estado !== ESTADOS_PAGO.PAGADO) {
    return renderizarAviso({ tipo: 'info', titulo: 'Sin pago registrado', mensaje: 'La cita se cancelará y el horario quedará libre. No se genera reembolso.' });
  }
  return corresponderReembolso(cita)
    ? renderizarAviso({ tipo: 'exito', titulo: 'Reembolso aplicable', mensaje: 'Faltan más de 24 horas. Se generará el reembolso del pago realizado.' })
    : renderizarAviso({ tipo: 'peligro', titulo: 'Pago no reembolsable', mensaje: 'Puedes cancelar la cita, pero al faltar 24 horas o menos el pago realizado no se reembolsa.' });
}

function renderizarPasoSeleccion(estado, contexto) {
  const citas = listarCitasCancelables(contexto);
  const aviso = estado.avisoSeleccion ? renderizarAviso({ tipo: 'alerta', mensaje: estado.avisoSeleccion }) : '';
  if (!citas.length) {
    return `<section class="panel">${aviso}${renderizarVacio({ iconoVacio: 'cancelar', titulo: 'No hay citas que puedan cancelarse', mensaje: 'Solo se cancelan citas activas con fecha futura.' })}</section>`;
  }
  return `
    <section class="panel">
      <h2 class="panel__titulo">Citas que pueden cancelarse</h2>
      ${aviso}
      ${renderizarListaCitas(citas, {
    mostrar: contexto.rol === 'administrador' ? 'ambos' : 'medico',
    crearEnlace: (cita) => construirHash(ID_MODULO, { cita: cita.id }),
  })}
    </section>`;
}

function renderizarPasoMotivo(estado) {
  const cita = obtenerCitaDetallada(estado.citaId);
  return `
    <section class="panel">
      <h2 class="panel__titulo">Cancelar cita</h2>
      <dl class="lista-datos lista-datos--apilada">
        <div><dt>Médico</dt><dd>${escaparHtml(cita.medico.nombre)}</dd></div>
        <div><dt>Fecha</dt><dd>${escaparHtml(formatearFechaLarga(cita.fecha))}, ${escaparHtml(cita.hora)}</dd></div>
        <div><dt>Lugar</dt><dd>${escaparHtml(cita.consultorio)}</dd></div>
        <div><dt>Estado</dt><dd>${insigniaEstado(cita.estado)}</dd></div>
      </dl>
      ${renderizarAvisoDeReembolso(cita)}
      <div class="campo campo--separado">
        <label class="campo__etiqueta" for="motivoCancelacion">Motivo de cancelación <span class="campo__opcional">(opcional)</span></label>
        <textarea class="entrada" id="motivoCancelacion" maxlength="${LIMITE_MOTIVO}" rows="3">${escaparHtml(estado.motivo)}</textarea>
      </div>
      <div class="acciones-paso">
        <a class="boton boton--secundario" href="${construirHash('detalle-cita', { id: cita.id })}">${icono('flechaIzquierda')}Volver al detalle de cita</a>
        <button class="boton boton--peligro" type="button" data-accion="cancelar">${icono('cancelar')}Cancelar cita</button>
      </div>
    </section>`;
}

function renderizarPasoConfirmacion({ resultado }) {
  const { cita, reembolso } = resultado;
  return `
    <section class="panel exito-reserva">
      <span class="exito-reserva__anillo"><span>${icono('check')}</span></span>
      <h2 class="exito-reserva__titulo" data-titulo-paso tabindex="-1">Cita cancelada</h2>
      <p class="exito-reserva__texto">${reembolso ? 'El horario quedó libre y se generó el reembolso del pago.' : 'El horario quedó libre.'}</p>
      <div class="ticket">
        <div class="ticket__fila">${icono('estetoscopio')}<span>Médico</span><b>${escaparHtml(cita.medico.nombre)}</b></div>
        <div class="ticket__fila">${icono('calendario')}<span>Fecha</span><b>${escaparHtml(formatearFechaLarga(cita.fecha))}, ${escaparHtml(cita.hora)}</b></div>
        <div class="ticket__fila">${icono('info')}<span>Estado</span><b>${insigniaEstado(cita.estado)}</b></div>
      </div>
      <div class="exito-reserva__acciones">
        <a class="boton boton--primario" href="${construirHash('detalle-cita', { id: cita.id })}">${icono('documento')}Ver detalle de la cita</a>
      </div>
    </section>`;
}

export default {
  id: ID_MODULO,
  titulo: 'Cancelar cita',
  icono: 'cancelar',
  roles: ['paciente', 'administrador'],
  seccion: 'Citas',
  menu: false,
  montar(contenedor, contexto) {
    const citaSolicitada = contexto.params.cita ? obtenerCitaDetallada(contexto.params.cita) : null;
    const citaValida = puedeGestionarCita(citaSolicitada, contexto) && puedeCancelarCita(citaSolicitada);
    const estado = {
      paso: citaValida ? PASO_MOTIVO : PASO_SELECCION,
      citaId: citaValida ? contexto.params.cita : null,
      motivo: '',
      resultado: null,
      avisoSeleccion: contexto.params.cita && !citaValida ? 'La cita elegida no puede cancelarse.' : '',
    };

    function renderizar() {
      const contenidoPorPaso = {
        [PASO_SELECCION]: () => renderizarPasoSeleccion(estado, contexto),
        [PASO_MOTIVO]: () => renderizarPasoMotivo(estado),
        [PASO_CONFIRMACION]: () => renderizarPasoConfirmacion(estado),
      };
      contenedor.innerHTML = `
        ${renderizarEncabezado({ titulo: 'Cancelar cita' })}
        ${renderizarStepper(PASOS, estado.paso)}
        ${contenidoPorPaso[estado.paso]()}`;
    }

    async function solicitarCancelacion() {
      estado.motivo = contenedor.querySelector('#motivoCancelacion').value.trim();
      const confirmado = await confirmarAccion({
        titulo: 'Cancelar cita',
        mensaje: 'El estado cambiará a Cancelada y el horario será liberado en la agenda médica. Esta acción no se puede deshacer.',
        textoConfirmar: 'Sí, cancelar cita',
        textoCancelar: 'Volver',
        peligro: true,
      });
      if (!confirmado) return;

      try {
        estado.resultado = cancelarCita({ citaId: estado.citaId, motivo: estado.motivo, actor: contexto.usuario.nombre, rol: contexto.rol });
        estado.paso = PASO_CONFIRMACION;
        renderizar();
        contenedor.querySelector('[data-titulo-paso]')?.focus();
      } catch (error) {
        if (!(error instanceof ErrorDeDominio)) throw error;
        mostrarToast(error.message, 'error');
        contexto.navegar(ID_MODULO);
      }
    }

    contenedor.addEventListener('click', (evento) => {
      if (evento.target.closest('[data-accion="cancelar"]')) solicitarCancelacion();
    });

    renderizar();
    return storage.suscribir(() => {
      if (estado.paso === PASO_SELECCION) renderizar();
    });
  },
};
