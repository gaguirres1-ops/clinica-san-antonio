import * as storage from './storage.js';
import { ahoraISO, combinarFechaHora, compararFechaHora, esFuturo, hoyISO } from './fechas.js';

export const ESTADOS_CITA = Object.freeze({
  PENDIENTE_PAGO: 'Pendiente de pago',
  CONFIRMADA: 'Confirmada',
  REPROGRAMADA: 'Reprogramada',
  ATENDIDA: 'Atendida',
  CANCELADA: 'Cancelada',
});

export const ESTADOS_ACTIVOS = Object.freeze([
  ESTADOS_CITA.PENDIENTE_PAGO,
  ESTADOS_CITA.CONFIRMADA,
  ESTADOS_CITA.REPROGRAMADA,
]);

export const ESTADOS_HORARIO = Object.freeze({
  DISPONIBLE: 'disponible',
  OCUPADO: 'ocupado',
  BLOQUEADO: 'bloqueado',
});

export const ESTADOS_PAGO = Object.freeze({
  PENDIENTE: 'Pendiente',
  PAGADO: 'Pagado',
  REEMBOLSADO: 'Reembolsado',
});

export const HORAS_LIMITE_PAGO = 24;

export const ROLES = Object.freeze({
  paciente: { id: 'paciente', etiqueta: 'Paciente' },
  medico: { id: 'medico', etiqueta: 'Médico' },
  administrador: { id: 'administrador', etiqueta: 'Administrador' },
});

export class ErrorDeDominio extends Error {
  constructor(mensaje, codigo = 'regla-de-negocio') {
    super(mensaje);
    this.name = 'ErrorDeDominio';
    this.codigo = codigo;
  }
}

export function obtenerEspecialidad(id) {
  return storage.obtenerPorId('especialidades', id);
}

export function listarEspecialidades() {
  return storage.obtenerTodos('especialidades');
}

export function obtenerPaciente(id) {
  return storage.obtenerPorId('pacientes', id);
}

export function obtenerMedico(id) {
  const medico = storage.obtenerPorId('medicos', id);
  return medico ? { ...medico, especialidad: obtenerEspecialidad(medico.especialidadId) } : null;
}

export function listarMedicos({ soloActivos = true } = {}) {
  const especialidades = new Map(listarEspecialidades().map((especialidad) => [especialidad.id, especialidad]));
  return storage
    .filtrar('medicos', (medico) => !soloActivos || medico.activo)
    .map((medico) => ({ ...medico, especialidad: especialidades.get(medico.especialidadId) ?? null }));
}

export function usuarioDeSesion(sesion) {
  const id = sesion.usuarios[sesion.rol];
  if (sesion.rol === 'paciente') {
    const paciente = obtenerPaciente(id);
    return paciente && { id, nombre: paciente.nombre, detalle: `DNI ${paciente.dni}` };
  }
  if (sesion.rol === 'medico') {
    const medico = obtenerMedico(id);
    return medico && { id, nombre: medico.nombre, detalle: medico.especialidad?.nombre ?? 'Médico' };
  }
  const administrador = storage.obtenerPorId('administradores', id);
  return administrador && { id, nombre: administrador.nombre, detalle: administrador.cargo };
}

export function esHorarioReservable(horario) {
  return horario?.estado === ESTADOS_HORARIO.DISPONIBLE && esFuturo(horario.fecha, horario.hora);
}

export function horariosDelMedico(medicoId, fecha = null) {
  return storage
    .filtrar('horarios', (horario) => horario.medicoId === medicoId && (!fecha || horario.fecha === fecha))
    .sort(compararFechaHora);
}

export function disponibilidadPorFecha(medicoId) {
  const hoy = hoyISO();
  const resumen = new Map();
  horariosDelMedico(medicoId)
    .filter((horario) => horario.fecha >= hoy)
    .forEach((horario) => {
      const dia = resumen.get(horario.fecha) ?? { libres: 0, total: 0 };
      dia.total += 1;
      if (esHorarioReservable(horario)) dia.libres += 1;
      resumen.set(horario.fecha, dia);
    });
  return resumen;
}

export function proximaFechaDisponible(medicoId) {
  for (const [fecha, dia] of disponibilidadPorFecha(medicoId)) {
    if (dia.libres > 0) return fecha;
  }
  return null;
}

export function ocuparHorario(horarioId, citaId) {
  const horario = storage.obtenerPorId('horarios', horarioId);
  if (!esHorarioReservable(horario)) {
    throw new ErrorDeDominio('El horario seleccionado ya no está disponible.', 'horario-no-disponible');
  }
  return storage.actualizar('horarios', horarioId, { estado: ESTADOS_HORARIO.OCUPADO, citaId });
}

export function liberarHorario(horarioId) {
  if (!horarioId) return null;
  return storage.actualizar('horarios', horarioId, { estado: ESTADOS_HORARIO.DISPONIBLE, citaId: null });
}

export function registrarEventoCita(citaId, descripcion, actor) {
  const cita = storage.obtenerPorId('citas', citaId);
  if (!cita) throw new ErrorDeDominio('La cita no existe.', 'cita-inexistente');
  return storage.actualizar('citas', citaId, {
    eventos: [...cita.eventos, { fecha: ahoraISO(), descripcion, actor }],
  });
}

export function notificar({ destinatarioRol, destinatarioId = null, titulo, mensaje, citaId = null }) {
  return storage.insertar('notificaciones', {
    destinatarioRol,
    destinatarioId,
    titulo,
    mensaje,
    citaId,
    fecha: ahoraISO(),
    leida: false,
  });
}

function esNotificacionDe(notificacion, sesion) {
  return notificacion.destinatarioRol === sesion.rol
    && (notificacion.destinatarioId === null || notificacion.destinatarioId === sesion.usuarios[sesion.rol]);
}

export function notificacionesDe(sesion) {
  return storage
    .filtrar('notificaciones', (notificacion) => esNotificacionDe(notificacion, sesion))
    .sort((a, b) => b.fecha.localeCompare(a.fecha));
}

export function marcarNotificacionLeida(id) {
  return storage.actualizar('notificaciones', id, { leida: true });
}

export function marcarNotificacionesLeidas(sesion) {
  storage.ejecutarTransaccion(() => {
    notificacionesDe(sesion)
      .filter((notificacion) => !notificacion.leida)
      .forEach((notificacion) => marcarNotificacionLeida(notificacion.id));
  });
}

export function obtenerPagoDeCita(citaId) {
  return storage.buscar('pagos', (pago) => pago.citaId === citaId);
}

export function obtenerDiagnosticoDeCita(citaId) {
  return storage.buscar('historialClinico', (registro) => registro.citaId === citaId);
}

export function esCitaActiva(cita) {
  return ESTADOS_ACTIVOS.includes(cita.estado);
}

export function esCitaFutura(cita) {
  return esFuturo(cita.fecha, cita.hora);
}

export function detallarCita(cita) {
  return {
    ...cita,
    paciente: obtenerPaciente(cita.pacienteId),
    medico: obtenerMedico(cita.medicoId),
    pago: obtenerPagoDeCita(cita.id),
    diagnostico: obtenerDiagnosticoDeCita(cita.id),
  };
}

export function obtenerCitaDetallada(citaId) {
  const cita = storage.obtenerPorId('citas', citaId);
  return cita ? detallarCita(cita) : null;
}

export function listarCitas(predicado = () => true, { orden = 'ascendente' } = {}) {
  const citas = storage.filtrar('citas', predicado).sort(compararFechaHora);
  return (orden === 'descendente' ? citas.reverse() : citas).map(detallarCita);
}

export function puedeVerCita(cita, sesion) {
  const usuarioId = sesion.usuarios[sesion.rol];
  if (sesion.rol === 'paciente') return cita.pacienteId === usuarioId;
  if (sesion.rol === 'medico') return cita.medicoId === usuarioId;
  return sesion.rol === 'administrador';
}

export function normalizarTexto(texto) {
  return String(texto ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
}

export const MAXIMO_REPROGRAMACIONES = 1;
export const HORAS_MINIMAS_REEMBOLSO = 24;

export function validarReprogramacion(cita) {
  const usadas = cita.reprogramaciones ?? (cita.estado === ESTADOS_CITA.REPROGRAMADA ? MAXIMO_REPROGRAMACIONES : 0);
  return [
    { texto: 'La cita está activa', cumple: esCitaActiva(cita) },
    { texto: 'La fecha de la cita aún no ha pasado', cumple: esCitaFutura(cita) },
    { texto: 'La cita no fue reprogramada antes (solo se permite una vez)', cumple: usadas < MAXIMO_REPROGRAMACIONES },
  ];
}

export function puedeReprogramarCita(cita) {
  return validarReprogramacion(cita).every((regla) => regla.cumple);
}

export function puedeCancelarCita(cita) {
  return esCitaActiva(cita) && esCitaFutura(cita);
}

export function corresponderReembolso(cita) {
  const horasRestantes = (combinarFechaHora(cita.fecha, cita.hora).getTime() - Date.now()) / 3600000;
  return cita.pago?.estado === ESTADOS_PAGO.PAGADO && horasRestantes > HORAS_MINIMAS_REEMBOLSO;
}

export function puedeRegistrarDiagnostico(cita) {
  return [ESTADOS_CITA.CONFIRMADA, ESTADOS_CITA.REPROGRAMADA].includes(cita.estado)
    && !cita.diagnostico
    && cita.fecha <= hoyISO();
}

export function listarCitasPorAtender(medicoId) {
  return listarCitas((cita) => cita.medicoId === medicoId).filter(puedeRegistrarDiagnostico);
}
