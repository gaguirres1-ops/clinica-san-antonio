import * as storage from './storage.js';
import {
  ESTADOS_CITA,
  ESTADOS_PAGO,
  ErrorDeDominio,
  corresponderReembolso,
  esHorarioReservable,
  liberarHorario,
  notificar,
  obtenerCitaDetallada,
  obtenerMedico,
  ocuparHorario,
  puedeCancelarCita,
  registrarEventoCita,
  validarReprogramacion,
} from './dominio.js';
import { combinarFechaHora, formatearFecha, ahoraISO, sumarMinutos } from './fechas.js';

const MINUTOS_MINIMOS_PARA_PAGAR = 30;
const MINUTOS_DE_UN_DIA = 24 * 60;

export function c_validarReprogramacion(citaId) {
  const cita = obtenerCitaDetallada(citaId);
  const reglas = cita ? validarReprogramacion(cita) : [];
  return { cita, reglas, valida: Boolean(cita) && reglas.every((regla) => regla.cumple) };
}

export function c_validarHorario(horarioId) {
  return esHorarioReservable(storage.obtenerPorId('horarios', horarioId));
}

export function c_actualizarCita(citaId, cambios) {
  return storage.actualizar('citas', citaId, cambios);
}

export function c_liberarHorario(horarioId) {
  return liberarHorario(horarioId);
}

export function c_reservarHorario(horarioId, citaId) {
  return ocuparHorario(horarioId, citaId);
}

export function c_enviarNotificacion(notificacion) {
  return notificar(notificacion);
}

function calcularNuevoLimiteDePago(fecha, hora) {
  const limiteMinimo = sumarMinutos(new Date(), MINUTOS_MINIMOS_PARA_PAGAR);
  const unDiaAntes = sumarMinutos(combinarFechaHora(fecha, hora), -MINUTOS_DE_UN_DIA);
  return new Date(Math.max(limiteMinimo.getTime(), unDiaAntes.getTime())).toISOString();
}

export function c_registrarReprogramacion({ citaId, horarioId, actor }) {
  return storage.ejecutarTransaccion(() => {
    const { cita, valida } = c_validarReprogramacion(citaId);
    if (!valida) throw new ErrorDeDominio('La cita ya no puede reprogramarse.', 'reprogramacion-no-permitida');

    const horario = storage.obtenerPorId('horarios', horarioId);
    const destino = horario && obtenerMedico(horario.medicoId);
    if (!destino || destino.especialidadId !== cita.especialidadId || horario.fecha <= cita.fecha) {
      throw new ErrorDeDominio('El horario elegido no es válido para esta cita.', 'horario-invalido');
    }
    if (!c_validarHorario(horarioId)) {
      throw new ErrorDeDominio('Este horario acaba de ser ocupado. Selecciona otra opción para continuar.', 'horario-no-disponible');
    }

    const medicoAnterior = cita.medico;
    const fechaAnterior = `${formatearFecha(cita.fecha)} a las ${cita.hora}`;
    const fechaNueva = `${formatearFecha(horario.fecha)} a las ${horario.hora}`;

    c_actualizarCita(citaId, {
      medicoId: destino.id,
      horarioId: horario.id,
      fecha: horario.fecha,
      hora: horario.hora,
      consultorio: destino.consultorio,
      estado: ESTADOS_CITA.REPROGRAMADA,
      reprogramaciones: (cita.reprogramaciones ?? 0) + 1,
    });
    c_liberarHorario(cita.horarioId);
    c_reservarHorario(horario.id, citaId);
    if (cita.pago?.estado === ESTADOS_PAGO.PENDIENTE) {
      storage.actualizar('pagos', cita.pago.id, { fechaLimite: calcularNuevoLimiteDePago(horario.fecha, horario.hora) });
    }
    registrarEventoCita(citaId, `Cita reprogramada del ${fechaAnterior} a ${fechaNueva}. Se liberó el horario anterior y se reservó el nuevo.`, actor);

    c_enviarNotificacion({
      destinatarioRol: 'paciente',
      destinatarioId: cita.pacienteId,
      titulo: 'Cita reprogramada',
      mensaje: `Tu cita fue reprogramada con ${destino.nombre} para el ${fechaNueva}.`,
      citaId,
    });
    c_enviarNotificacion({
      destinatarioRol: 'medico',
      destinatarioId: destino.id,
      titulo: 'Cita reprogramada',
      mensaje: `${cita.paciente.nombre} reprogramó su cita para el ${fechaNueva}.`,
      citaId,
    });
    if (medicoAnterior.id !== destino.id) {
      c_enviarNotificacion({
        destinatarioRol: 'medico',
        destinatarioId: medicoAnterior.id,
        titulo: 'Cita reprogramada',
        mensaje: `${cita.paciente.nombre} movió su cita del ${fechaAnterior} a otro médico. Tu horario quedó libre.`,
        citaId,
      });
    }
    return obtenerCitaDetallada(citaId);
  });
}

export function c_validarCancelacion(citaId) {
  const cita = obtenerCitaDetallada(citaId);
  return { cita, valida: Boolean(cita) && puedeCancelarCita(cita) };
}

export function c_verificarReembolso(cita) {
  const hayPago = cita.pago?.estado === ESTADOS_PAGO.PAGADO;
  return { hayPago, corresponde: hayPago && corresponderReembolso(cita) };
}

export function c_actualizarEstadoCita(citaId, estado, cambios = {}) {
  return c_actualizarCita(citaId, { estado, ...cambios });
}

export function c_registrarCancelacion({ citaId, motivo = '', actor, rol }) {
  return storage.ejecutarTransaccion(() => {
    const { cita, valida } = c_validarCancelacion(citaId);
    if (!valida) throw new ErrorDeDominio('La cita ya no puede cancelarse.', 'cancelacion-no-permitida');
    const { corresponde } = c_verificarReembolso(cita);

    c_actualizarEstadoCita(citaId, ESTADOS_CITA.CANCELADA, { motivoCancelacion: motivo, canceladaEn: ahoraISO() });
    c_liberarHorario(cita.horarioId);
    if (corresponde) {
      storage.actualizar('pagos', cita.pago.id, { estado: ESTADOS_PAGO.REEMBOLSO_PENDIENTE, reembolsoSolicitadoEn: ahoraISO() });
    }
    registrarEventoCita(
      citaId,
      corresponde ? 'Cita cancelada. Horario liberado y solicitud de reembolso generada en estado Pendiente.' : 'Cita cancelada. Horario liberado.',
      actor,
    );

    const fechaHora = `${formatearFecha(cita.fecha)} a las ${cita.hora}`;
    c_enviarNotificacion({
      destinatarioRol: 'paciente',
      destinatarioId: cita.pacienteId,
      titulo: 'Cita cancelada',
      mensaje: `Tu cita con ${cita.medico.nombre} del ${fechaHora} fue cancelada.${corresponde ? ' Se creó una solicitud de reembolso en estado Pendiente.' : ''}`,
      citaId,
    });
    c_enviarNotificacion({
      destinatarioRol: 'medico',
      destinatarioId: cita.medicoId,
      titulo: 'Cita cancelada',
      mensaje: `La cita de ${cita.paciente.nombre} del ${fechaHora} fue cancelada. Tu horario quedó libre.`,
      citaId,
    });
    if (rol !== 'paciente') {
      c_enviarNotificacion({
        destinatarioRol: 'administrador',
        destinatarioId: null,
        titulo: 'Cita cancelada',
        mensaje: `${cita.id} · ${cita.paciente.nombre} · ${fechaHora}. El horario fue liberado.`,
        citaId,
      });
    } else {
      c_enviarNotificacion({
        destinatarioRol: 'administrador',
        destinatarioId: null,
        titulo: 'Cita cancelada',
        mensaje: `${cita.paciente.nombre} canceló su cita de ${cita.medico.especialidad?.nombre ?? ''}. El horario fue liberado.`,
        citaId,
      });
    }
    return { cita: obtenerCitaDetallada(citaId), reembolso: corresponde };
  });
}
