import * as storage from '../core/storage.js';
import {
  ESTADOS_CITA,
  ESTADOS_PAGO,
  ErrorDeDominio,
  esHorarioReservable,
  liberarHorario,
  listarCitas,
  listarMedicos,
  notificar,
  obtenerCitaDetallada,
  obtenerMedico,
  ocuparHorario,
  puedeReprogramarCita,
  registrarEventoCita,
  validarReprogramacion,
} from '../core/dominio.js';
import {
  combinarFechaHora,
  formatearDiaCorto,
  formatearFecha,
  formatearFechaLarga,
  sumarMinutos,
} from '../core/fechas.js';
import { construirHash } from '../core/navigation.js';
import {
  confirmarAccion,
  escaparHtml,
  icono,
  mostrarToast,
  renderizarAviso,
  renderizarAvatarMedico,
  renderizarEncabezado,
  renderizarListaCitas,
  renderizarStepper,
  renderizarVacio,
} from '../core/ui.js';

const ID_MODULO = 'reprogramar-cita';
const PASOS = ['Validar reprogramación', 'Nuevo horario', 'Confirmación'];
const PASO_VALIDACION = 0;
const PASO_HORARIO = 1;
const PASO_CONFIRMACION = 2;
const MINUTOS_MINIMOS_PARA_PAGAR = 30;
const MINUTOS_DE_UN_DIA = 24 * 60;

function listarCitasReprogramables(pacienteId) {
  return listarCitas((cita) => cita.pacienteId === pacienteId).filter(puedeReprogramarCita);
}

function listarHorariosNuevos(medicoId, cita) {
  return storage
    .filtrar('horarios', (horario) => horario.medicoId === medicoId && horario.fecha > cita.fecha)
    .filter(esHorarioReservable)
    .sort((a, b) => `${a.fecha}${a.hora}`.localeCompare(`${b.fecha}${b.hora}`));
}

function agruparPorFecha(horarios) {
  return horarios.reduce((grupos, horario) => grupos.set(horario.fecha, [...(grupos.get(horario.fecha) ?? []), horario]), new Map());
}

function calcularNuevoLimiteDePago(fecha, hora) {
  const limiteMinimo = sumarMinutos(new Date(), MINUTOS_MINIMOS_PARA_PAGAR);
  const unDiaAntes = sumarMinutos(combinarFechaHora(fecha, hora), -MINUTOS_DE_UN_DIA);
  return new Date(Math.max(limiteMinimo.getTime(), unDiaAntes.getTime())).toISOString();
}

function reprogramarCita({ citaId, horarioId, actor }) {
  return storage.ejecutarTransaccion(() => {
    const cita = obtenerCitaDetallada(citaId);
    if (!cita || !puedeReprogramarCita(cita)) {
      throw new ErrorDeDominio('La cita ya no puede reprogramarse.', 'reprogramacion-no-permitida');
    }
    const horario = storage.obtenerPorId('horarios', horarioId);
    const destino = horario && obtenerMedico(horario.medicoId);
    if (!destino || destino.especialidadId !== cita.especialidadId || horario.fecha <= cita.fecha) {
      throw new ErrorDeDominio('El horario elegido no es válido para esta cita.', 'horario-invalido');
    }

    const medicoAnterior = cita.medico;
    const fechaAnterior = `${formatearFecha(cita.fecha)} a las ${cita.hora}`;
    ocuparHorario(horario.id, citaId);
    liberarHorario(cita.horarioId);
    storage.actualizar('citas', citaId, {
      medicoId: destino.id,
      horarioId: horario.id,
      fecha: horario.fecha,
      hora: horario.hora,
      consultorio: destino.consultorio,
      estado: ESTADOS_CITA.REPROGRAMADA,
      reprogramaciones: (cita.reprogramaciones ?? 0) + 1,
    });
    if (cita.pago?.estado === ESTADOS_PAGO.PENDIENTE) {
      storage.actualizar('pagos', cita.pago.id, { fechaLimite: calcularNuevoLimiteDePago(horario.fecha, horario.hora) });
    }
    registrarEventoCita(citaId, `Cita reprogramada del ${fechaAnterior} a ${formatearFecha(horario.fecha)} a las ${horario.hora}. Se liberó el horario anterior y se reservó el nuevo.`, actor);

    const fechaNueva = `${formatearFecha(horario.fecha)} a las ${horario.hora}`;
    notificar({
      destinatarioRol: 'paciente',
      destinatarioId: cita.pacienteId,
      titulo: 'Cita reprogramada',
      mensaje: `Tu cita con ${destino.nombre} quedó para el ${fechaNueva}.`,
      citaId,
    });
    notificar({
      destinatarioRol: 'medico',
      destinatarioId: destino.id,
      titulo: 'Cita reprogramada',
      mensaje: `${cita.paciente.nombre} reprogramó su cita para el ${fechaNueva}.`,
      citaId,
    });
    if (medicoAnterior.id !== destino.id) {
      notificar({
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

function renderizarPasoSeleccion(estado, pacienteId) {
  const citas = listarCitasReprogramables(pacienteId);
  const aviso = estado.avisoSeleccion ? renderizarAviso({ tipo: 'alerta', mensaje: estado.avisoSeleccion }) : '';
  if (!citas.length) {
    return `<section class="panel">${aviso}${renderizarVacio({ titulo: 'No tienes citas que puedan reprogramarse', mensaje: 'Solo se reprograman citas activas, con fecha futura y una única vez.' })}</section>`;
  }
  return `
    <section class="panel">
      <h2 class="panel__titulo">Citas que puedes reprogramar</h2>
      ${aviso}
      ${renderizarListaCitas(citas, { mostrar: 'medico', crearEnlace: (cita) => construirHash(ID_MODULO, { cita: cita.id }) })}
    </section>`;
}

function renderizarPasoValidacion(estado) {
  const cita = obtenerCitaDetallada(estado.citaId);
  const reglas = validarReprogramacion(cita);
  const valida = reglas.every((regla) => regla.cumple);
  return `
    <section class="panel">
      <h2 class="panel__titulo">Validar reprogramación</h2>
      <dl class="lista-datos lista-datos--apilada">
        <div><dt>Cita</dt><dd>${escaparHtml(cita.id)}</dd></div>
        <div><dt>Médico</dt><dd>${escaparHtml(cita.medico.nombre)}</dd></div>
        <div><dt>Fecha actual</dt><dd>${escaparHtml(formatearFechaLarga(cita.fecha))}, ${escaparHtml(cita.hora)}</dd></div>
      </dl>
      <ul class="validacion">
        ${reglas.map((regla) => `
          <li class="validacion__regla validacion__regla--${regla.cumple ? 'cumple' : 'falla'}">
            ${icono(regla.cumple ? 'check' : 'cerrar')}${escaparHtml(regla.texto)}
          </li>`).join('')}
      </ul>
      <div class="acciones-paso">
        <a class="boton boton--secundario" href="${construirHash('detalle-cita', { id: cita.id })}">${icono('flechaIzquierda')}Volver al detalle de cita</a>
        <button class="boton boton--primario" type="button" data-accion="continuar"${valida ? '' : ' disabled'}>Continuar${icono('flechaDerecha')}</button>
      </div>
    </section>`;
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

function renderizarSelectorDeHorario(grupos, estado) {
  if (!grupos.size) {
    return renderizarVacio({ iconoVacio: 'calendario', titulo: 'Sin horarios disponibles', mensaje: 'Este médico no tiene horarios libres posteriores a la fecha actual de tu cita. Elige otro médico.' });
  }
  const horariosDelDia = estado.fecha ? grupos.get(estado.fecha) ?? [] : [];
  return `
    <ul class="fechas-sugeridas">
      ${[...grupos.entries()].slice(0, 8).map(([fecha, horarios]) => `
        <li>
          <button class="fecha-sugerida" type="button" data-accion="elegir-fecha" data-fecha="${fecha}" aria-pressed="${fecha === estado.fecha}">
            <span class="fecha-sugerida__dia">${escaparHtml(formatearDiaCorto(fecha))}</span>
            <span class="fecha-sugerida__cupos">${horarios.length} libres</span>
          </button>
        </li>`).join('')}
    </ul>
    ${estado.fecha ? `
      <div class="franjas franjas--separadas">
        <div class="grupo-franjas__lista">
          ${horariosDelDia.map((horario) => `
            <button class="franja" type="button" data-accion="elegir-horario" data-horario="${escaparHtml(horario.id)}" aria-pressed="${horario.id === estado.horarioId}">
              <span class="franja__hora">${escaparHtml(horario.hora)}</span>
              <span class="franja__estado">Libre</span>
            </button>`).join('')}
        </div>
      </div>` : ''}`;
}

function renderizarComparacion(cita, horarioNuevo) {
  if (!horarioNuevo) return '';
  const medicoNuevo = obtenerMedico(horarioNuevo.medicoId);
  return `
    <div class="comparacion comparacion--doble">
      <div class="comparacion__medico"><small>Cita actual</small><strong>${escaparHtml(cita.medico.nombre)}</strong><span>${escaparHtml(formatearFecha(cita.fecha))} · ${escaparHtml(cita.hora)}</span></div>
      ${icono('flechaDerecha')}
      <div class="comparacion__medico"><small>Nueva programación</small><strong>${escaparHtml(medicoNuevo.nombre)}</strong><span>${escaparHtml(formatearFecha(horarioNuevo.fecha))} · ${escaparHtml(horarioNuevo.hora)}</span></div>
    </div>`;
}

function renderizarPasoHorario(estado) {
  const cita = obtenerCitaDetallada(estado.citaId);
  const grupos = agruparPorFecha(listarHorariosNuevos(estado.medicoId, cita));
  const horarioNuevo = estado.horarioId ? storage.obtenerPorId('horarios', estado.horarioId) : null;
  return `
    <section class="panel">
      ${renderizarAviso({ tipo: 'info', titulo: 'Regla de reprogramación', mensaje: `Solo puede hacerse una vez. La nueva fecha debe ser posterior al ${formatearFecha(cita.fecha)}.` })}
      ${estado.error ? renderizarAviso({ tipo: 'peligro', titulo: 'Horario no disponible', mensaje: estado.error }) : ''}
      <h2 class="panel__titulo panel__titulo--separado">1. Selecciona un médico</h2>
      ${renderizarSelectorDeMedico(cita, estado.medicoId)}
      <h2 class="panel__titulo panel__titulo--separado">2. Elige fecha y horario</h2>
      ${renderizarSelectorDeHorario(grupos, estado)}
      ${renderizarComparacion(cita, horarioNuevo)}
      <div class="acciones-paso">
        <a class="boton boton--secundario" href="${construirHash('detalle-cita', { id: cita.id })}">Cancelar proceso</a>
        <button class="boton boton--primario" type="button" data-accion="reprogramar"${horarioNuevo ? '' : ' disabled'}>${icono('reprogramar')}Confirmar reprogramación</button>
      </div>
    </section>`;
}

function renderizarPasoConfirmacion({ resultado }) {
  const cita = resultado;
  return `
    <section class="panel exito-reserva">
      <span class="exito-reserva__anillo"><span>${icono('check')}</span></span>
      <h2 class="exito-reserva__titulo" data-titulo-paso tabindex="-1">Cita reprogramada correctamente</h2>
      <div class="ticket">
        <div class="ticket__fila">${icono('estetoscopio')}<span>Médico</span><b>${escaparHtml(cita.medico.nombre)}</b></div>
        <div class="ticket__fila">${icono('calendario')}<span>Fecha</span><b>${escaparHtml(formatearFechaLarga(cita.fecha))}</b></div>
        <div class="ticket__fila">${icono('reloj')}<span>Hora</span><b>${escaparHtml(cita.hora)}</b></div>
      </div>
      <div class="exito-reserva__acciones">
        <a class="boton boton--primario" href="${construirHash('detalle-cita', { id: cita.id })}">${icono('documento')}Ver detalle de la cita</a>
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
  montar(contenedor, { usuario, params }) {
    const citaSolicitada = params.cita ? obtenerCitaDetallada(params.cita) : null;
    const citaValida = Boolean(citaSolicitada) && citaSolicitada.pacienteId === usuario.id;
    const estado = {
      paso: citaValida ? PASO_VALIDACION : -1,
      citaId: citaValida ? params.cita : null,
      medicoId: citaValida ? citaSolicitada.medicoId : null,
      fecha: null,
      horarioId: null,
      error: '',
      resultado: null,
      avisoSeleccion: params.cita && !citaValida ? 'La cita elegida no pertenece a tu perfil.' : '',
    };

    function renderizar() {
      const contenidoPorPaso = {
        [-1]: () => renderizarPasoSeleccion(estado, usuario.id),
        [PASO_VALIDACION]: () => renderizarPasoValidacion(estado),
        [PASO_HORARIO]: () => renderizarPasoHorario(estado),
        [PASO_CONFIRMACION]: () => renderizarPasoConfirmacion(estado),
      };
      contenedor.innerHTML = `
        ${renderizarEncabezado({ titulo: 'Reprogramar cita' })}
        ${renderizarStepper(PASOS, Math.max(estado.paso, 0))}
        ${contenidoPorPaso[estado.paso]()}`;
    }

    async function confirmarReprogramacion() {
      const cita = obtenerCitaDetallada(estado.citaId);
      const horario = storage.obtenerPorId('horarios', estado.horarioId);
      const confirmado = await confirmarAccion({
        titulo: 'Confirmar reprogramación',
        mensaje: cita.pago?.estado === ESTADOS_PAGO.PENDIENTE
          ? 'Se liberará el horario anterior y se reservará el nuevo. El límite de pago se recalculará a un día antes de la nueva atención.'
          : 'Se liberará el horario anterior y se reservará el nuevo. Esta acción solo puede hacerse una vez.',
        detalle: renderizarComparacion(cita, horario),
        textoConfirmar: 'Confirmar reprogramación',
      });
      if (!confirmado) return;

      try {
        estado.resultado = reprogramarCita({ citaId: estado.citaId, horarioId: estado.horarioId, actor: usuario.nombre });
        estado.paso = PASO_CONFIRMACION;
        renderizar();
        contenedor.querySelector('[data-titulo-paso]')?.focus();
      } catch (error) {
        if (!(error instanceof ErrorDeDominio)) throw error;
        estado.error = error.message;
        estado.horarioId = null;
        mostrarToast(error.message, 'error');
        renderizar();
      }
    }

    const acciones = {
      continuar: () => {
        estado.paso = PASO_HORARIO;
        renderizar();
      },
      'elegir-medico': (elemento) => {
        estado.medicoId = elemento.dataset.medico;
        Object.assign(estado, { fecha: null, horarioId: null, error: '' });
        renderizar();
      },
      'elegir-fecha': (elemento) => {
        Object.assign(estado, { fecha: elemento.dataset.fecha, horarioId: null, error: '' });
        renderizar();
      },
      'elegir-horario': (elemento) => {
        Object.assign(estado, { horarioId: elemento.dataset.horario, error: '' });
        renderizar();
      },
      reprogramar: confirmarReprogramacion,
    };

    contenedor.addEventListener('click', (evento) => {
      const elemento = evento.target.closest('[data-accion]');
      if (elemento && !elemento.disabled) acciones[elemento.dataset.accion]?.(elemento);
    });

    renderizar();
    return storage.suscribir(() => {
      if (estado.paso !== PASO_CONFIRMACION && estado.paso !== PASO_HORARIO) renderizar();
    });
  },
};
