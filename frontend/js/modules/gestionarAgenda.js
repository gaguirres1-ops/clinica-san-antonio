import * as storage from '../core/storage.js';
import {
  ESTADOS_HORARIO,
  ErrorDeDominio,
  listarMedicos,
  notificar,
  obtenerMedico,
} from '../core/dominio.js';
import {
  aMinutos,
  desdeISO,
  esFuturo,
  formatearDiaCorto,
  formatearFecha,
  formatearFechaLarga,
  hoyISO,
  sumarDias,
} from '../core/fechas.js';
import { construirHash } from '../core/navigation.js';
import {
  abrirModal,
  confirmarAccion,
  escaparHtml,
  icono,
  insigniaEstado,
  mostrarToast,
  renderizarAvatarMedico,
  renderizarEncabezado,
  renderizarStepper,
  renderizarVacio,
} from '../core/ui.js';

const ID_MODULO = 'gestionar-agenda';
const PASOS = ['Seleccionar médico', 'Horarios de atención', 'Confirmación'];
const PASO_MEDICO = 0;
const PASO_AGENDA = 1;
const PASO_CONFIRMACION = 2;
const DIAS_POR_SEMANA = 6;
const SEMANAS_ADELANTE = 8;
const HORA_MINIMA = '06:00';
const HORA_MAXIMA = '22:00';

const ETIQUETAS_DE_ESTADO = {
  [ESTADOS_HORARIO.DISPONIBLE]: 'Libre',
  [ESTADOS_HORARIO.OCUPADO]: 'Ocupado',
  [ESTADOS_HORARIO.BLOQUEADO]: 'Bloqueado',
};

function obtenerLunes(fechaIso) {
  const desplazamiento = (desdeISO(fechaIso).getDay() + 6) % 7;
  return sumarDias(fechaIso, -desplazamiento);
}

function contarPorEstado(horarios) {
  return Object.values(ESTADOS_HORARIO).reduce((conteo, estado) => ({
    ...conteo,
    [estado]: horarios.filter((horario) => horario.estado === estado).length,
  }), {});
}

function listarHorariosDeSemana(medicoId, lunes) {
  const domingo = sumarDias(lunes, DIAS_POR_SEMANA);
  return storage
    .filtrar('horarios', (horario) => horario.medicoId === medicoId && horario.fecha >= lunes && horario.fecha < domingo)
    .sort((a, b) => `${a.fecha}${a.hora}`.localeCompare(`${b.fecha}${b.hora}`));
}

function listarMedicosGestionables({ rol, usuario }) {
  const medicos = listarMedicos({ soloActivos: false });
  return rol === 'medico' ? medicos.filter((medico) => medico.id === usuario.id) : medicos;
}

function hayCruceDeHorario(medicoId, fecha, hora, duracionMinutos) {
  const inicio = aMinutos(hora);
  const fin = inicio + duracionMinutos;
  return Boolean(storage.buscar('horarios', (horario) => horario.medicoId === medicoId
    && horario.fecha === fecha
    && aMinutos(horario.hora) < fin
    && inicio < aMinutos(horario.hora) + horario.duracionMinutos));
}

function notificarCambioDeAgenda({ rol, medico, titulo, mensaje }) {
  notificar(rol === 'administrador'
    ? { destinatarioRol: 'medico', destinatarioId: medico.id, titulo, mensaje }
    : { destinatarioRol: 'administrador', destinatarioId: null, titulo, mensaje: `${medico.nombre}: ${mensaje}` });
}

function agregarHorario({ medicoId, fecha, hora, rol }) {
  return storage.ejecutarTransaccion(() => {
    const medico = obtenerMedico(medicoId);
    const duracion = medico.jornada.duracionMinutos;
    if (!esFuturo(fecha, hora)) throw new ErrorDeDominio('Elige una fecha y hora posteriores al momento actual.');
    if (hora < HORA_MINIMA || aMinutos(hora) + duracion > aMinutos(HORA_MAXIMA)) {
      throw new ErrorDeDominio(`El horario debe estar entre las ${HORA_MINIMA} y las ${HORA_MAXIMA}.`);
    }
    if (hayCruceDeHorario(medicoId, fecha, hora, duracion)) {
      throw new ErrorDeDominio('Ese espacio ya tiene un horario registrado. Elige uno sin registrar.');
    }
    const horario = storage.insertar('horarios', {
      medicoId,
      fecha,
      hora,
      duracionMinutos: duracion,
      estado: ESTADOS_HORARIO.DISPONIBLE,
      citaId: null,
    });
    notificarCambioDeAgenda({
      rol,
      medico,
      titulo: 'Agenda actualizada',
      mensaje: `Se agregó un horario de atención el ${formatearFecha(fecha)} a las ${hora}.`,
    });
    return horario;
  });
}

function validarHorarioModificable(horario, estadosPermitidos) {
  if (!horario || !estadosPermitidos.includes(horario.estado)) {
    throw new ErrorDeDominio('El horario cambió y ya no admite esta operación.');
  }
  if (!esFuturo(horario.fecha, horario.hora)) throw new ErrorDeDominio('No se pueden modificar horarios pasados.');
}

function eliminarHorario({ horarioId, rol }) {
  return storage.ejecutarTransaccion(() => {
    const horario = storage.obtenerPorId('horarios', horarioId);
    validarHorarioModificable(horario, [ESTADOS_HORARIO.DISPONIBLE, ESTADOS_HORARIO.BLOQUEADO]);
    storage.eliminar('horarios', horarioId);
    notificarCambioDeAgenda({
      rol,
      medico: obtenerMedico(horario.medicoId),
      titulo: 'Agenda actualizada',
      mensaje: `Se eliminó el horario del ${formatearFecha(horario.fecha)} a las ${horario.hora}.`,
    });
    return horario;
  });
}

function alternarBloqueo({ horarioId, rol }) {
  return storage.ejecutarTransaccion(() => {
    const horario = storage.obtenerPorId('horarios', horarioId);
    validarHorarioModificable(horario, [ESTADOS_HORARIO.DISPONIBLE, ESTADOS_HORARIO.BLOQUEADO]);
    const bloquear = horario.estado === ESTADOS_HORARIO.DISPONIBLE;
    const actualizado = storage.actualizar('horarios', horarioId, {
      estado: bloquear ? ESTADOS_HORARIO.BLOQUEADO : ESTADOS_HORARIO.DISPONIBLE,
    });
    notificarCambioDeAgenda({
      rol,
      medico: obtenerMedico(horario.medicoId),
      titulo: 'Agenda actualizada',
      mensaje: `El horario del ${formatearFecha(horario.fecha)} a las ${horario.hora} fue ${bloquear ? 'bloqueado' : 'liberado'}.`,
    });
    return actualizado;
  });
}

function renderizarFilaMedico(medico) {
  const conteo = contarPorEstado(storage.filtrar('horarios', (horario) => horario.medicoId === medico.id && horario.fecha >= hoyISO()));
  return `
    <li>
      <a class="fila-medico" href="${construirHash(ID_MODULO, { medico: medico.id })}">
        ${renderizarAvatarMedico(medico, 'tarjeta')}
        <span class="fila-medico__info">
          <strong>${escaparHtml(medico.nombre)}</strong>
          <small>${escaparHtml(medico.especialidad?.nombre ?? '')} · ${escaparHtml(medico.consultorio)}</small>
        </span>
        <span class="fila-medico__conteos">
          <span class="insignia insignia--exito">${conteo.disponible} libres</span>
          <span class="insignia insignia--info">${conteo.ocupado} ocupados</span>
          <span class="insignia insignia--neutro">${conteo.bloqueado} bloqueados</span>
        </span>
        ${icono('chevronDerecha', 'fila-medico__ir')}
      </a>
    </li>`;
}

function renderizarPasoMedico(contexto) {
  const medicos = listarMedicosGestionables(contexto);
  if (!medicos.length) {
    return `<section class="panel">${renderizarVacio({ iconoVacio: 'estetoscopio', titulo: 'No hay agendas disponibles para gestionar' })}</section>`;
  }
  return `
    <section class="panel">
      <h2 class="panel__titulo">Selecciona un médico</h2>
      <ul class="lista-citas">${medicos.map(renderizarFilaMedico).join('')}</ul>
    </section>`;
}

function renderizarCelda(horario, seleccionadoId) {
  if (!horario) return '<td><span class="celda-agenda celda-agenda--vacia" aria-label="Sin registrar">—</span></td>';
  const pasado = !esFuturo(horario.fecha, horario.hora);
  const seleccionado = horario.id === seleccionadoId;
  const clases = ['celda-agenda', `celda-agenda--${horario.estado}`, seleccionado && 'celda-agenda--seleccionada', pasado && 'celda-agenda--pasada']
    .filter(Boolean).join(' ');
  return `
    <td>
      <button class="${clases}" type="button" data-accion="seleccionar-horario" data-horario="${escaparHtml(horario.id)}"
        aria-pressed="${seleccionado}" aria-label="${escaparHtml(`${formatearDiaCorto(horario.fecha)} ${horario.hora}: ${ETIQUETAS_DE_ESTADO[horario.estado]}${seleccionado ? ', seleccionado' : ''}`)}">
        ${ETIQUETAS_DE_ESTADO[horario.estado]}
      </button>
    </td>`;
}

function renderizarTablaSemanal(horarios, lunes, seleccionadoId) {
  const dias = Array.from({ length: DIAS_POR_SEMANA }, (_, indice) => sumarDias(lunes, indice));
  const horas = [...new Set(horarios.map((horario) => horario.hora))].sort();
  const porClave = new Map(horarios.map((horario) => [`${horario.fecha}|${horario.hora}`, horario]));
  return `
    <div class="agenda-semanal__tabla-contenedor" role="region" aria-label="Agenda semanal" tabindex="0">
      <table class="agenda-semanal__tabla">
        <thead>
          <tr>
            <th scope="col">Hora</th>
            ${dias.map((dia) => `<th scope="col">${escaparHtml(formatearDiaCorto(dia))}</th>`).join('')}
          </tr>
        </thead>
        <tbody>
          ${horas.map((hora) => `
            <tr>
              <th scope="row">${escaparHtml(hora)}</th>
              ${dias.map((dia) => renderizarCelda(porClave.get(`${dia}|${hora}`), seleccionadoId)).join('')}
            </tr>`).join('')}
        </tbody>
      </table>
    </div>`;
}

function renderizarSeleccion(horario) {
  if (!horario) return '<p class="agenda-semanal__seleccion">Selecciona un horario de la tabla para modificarlo.</p>';
  const detalleCita = horario.citaId
    ? ` · <a href="${construirHash('detalle-cita', { id: horario.citaId })}">Ver cita ${escaparHtml(horario.citaId)}</a>`
    : '';
  return `<p class="agenda-semanal__seleccion"><strong>${escaparHtml(formatearFechaLarga(horario.fecha))}, ${escaparHtml(horario.hora)}</strong> ${insigniaEstado(horario.estado)}${detalleCita}</p>`;
}

function renderizarAcciones(horario) {
  const modificable = Boolean(horario)
    && horario.estado !== ESTADOS_HORARIO.OCUPADO
    && esFuturo(horario.fecha, horario.hora);
  const bloqueado = horario?.estado === ESTADOS_HORARIO.BLOQUEADO;
  return `
    <div class="agenda-semanal__acciones">
      <button class="boton boton--primario" type="button" data-accion="agregar-horario">${icono('mas')}Agregar horario</button>
      <button class="boton boton--secundario" type="button" data-accion="alternar-bloqueo"${modificable ? '' : ' disabled'}>
        ${icono('bloquear')}${bloqueado ? 'Liberar horario' : 'Bloquear horario'}
      </button>
      <button class="boton boton--peligro-suave" type="button" data-accion="eliminar-horario"${modificable ? '' : ' disabled'}>${icono('papelera')}Eliminar horario</button>
    </div>`;
}

function renderizarPasoAgenda(estado, contexto) {
  const medico = obtenerMedico(estado.medicoId);
  if (!medico) return `<section class="panel">${renderizarVacio({ iconoVacio: 'alerta', titulo: 'Médico no encontrado' })}</section>`;

  const horarios = listarHorariosDeSemana(medico.id, estado.lunes);
  const horarioSeleccionado = horarios.find((horario) => horario.id === estado.horarioId) ?? null;
  const conteo = contarPorEstado(horarios);
  const lunesActual = obtenerLunes(hoyISO());
  const puedeRetroceder = estado.lunes > lunesActual;
  const puedeAvanzar = estado.lunes < sumarDias(lunesActual, SEMANAS_ADELANTE * 7);

  return `
    <section class="panel agenda-semanal">
      <header class="agenda-semanal__cabecera">
        <div class="agenda-semanal__medico">
          ${renderizarAvatarMedico(medico, 'tarjeta')}
          <div>
            <h2 class="panel__titulo">${escaparHtml(medico.nombre)}</h2>
            <p>${escaparHtml(medico.especialidad?.nombre ?? '')}</p>
          </div>
        </div>
        <div class="agenda-semanal__navegacion">
          <button class="boton-icono boton-icono--claro" type="button" data-accion="semana-anterior" aria-label="Semana anterior"${puedeRetroceder ? '' : ' disabled'}>${icono('chevronIzquierda')}</button>
          <span class="agenda-semanal__periodo">${escaparHtml(formatearFecha(estado.lunes))} – ${escaparHtml(formatearFecha(sumarDias(estado.lunes, DIAS_POR_SEMANA - 1)))}</span>
          <button class="boton-icono boton-icono--claro" type="button" data-accion="semana-siguiente" aria-label="Semana siguiente"${puedeAvanzar ? '' : ' disabled'}>${icono('chevronDerecha')}</button>
        </div>
      </header>
      ${horarios.length
    ? renderizarTablaSemanal(horarios, estado.lunes, estado.horarioId)
    : renderizarVacio({ iconoVacio: 'agenda', titulo: 'Este médico no tiene horarios registrados en esta semana' })}
      <ul class="agenda-semanal__leyenda" aria-label="Resumen de la semana">
        <li><span class="insignia insignia--exito">${conteo.disponible} libres</span></li>
        <li><span class="insignia insignia--info">${conteo.ocupado} ocupados</span></li>
        <li><span class="insignia insignia--neutro">${conteo.bloqueado} bloqueados</span></li>
      </ul>
      ${renderizarSeleccion(horarioSeleccionado)}
      ${renderizarAcciones(horarioSeleccionado)}
      ${contexto.rol === 'administrador' ? `<button class="boton boton--fantasma" type="button" data-accion="cambiar-medico">${icono('flechaIzquierda')}Cambiar de médico</button>` : ''}
    </section>`;
}

function renderizarPasoConfirmacion(estado, contexto) {
  const { titulo, horario } = estado.resultado;
  const medico = obtenerMedico(horario.medicoId);
  return `
    <section class="panel exito-reserva">
      <span class="exito-reserva__anillo"><span>${icono('check')}</span></span>
      <h2 class="exito-reserva__titulo" data-titulo-paso tabindex="-1">${escaparHtml(titulo)}</h2>
      <div class="ticket">
        <div class="ticket__fila">${icono('estetoscopio')}<span>Médico</span><b>${escaparHtml(medico.nombre)}</b></div>
        <div class="ticket__fila">${icono('calendario')}<span>Fecha</span><b>${escaparHtml(formatearFechaLarga(horario.fecha))}</b></div>
        <div class="ticket__fila">${icono('reloj')}<span>Hora</span><b>${escaparHtml(horario.hora)}</b></div>
      </div>
      <div class="exito-reserva__acciones">
        <button class="boton boton--primario" type="button" data-accion="seguir-gestionando">${icono('agenda')}Seguir gestionando la agenda</button>
        ${contexto.rol === 'administrador' ? `<button class="boton boton--secundario" type="button" data-accion="cambiar-medico">Cambiar de médico</button>` : ''}
      </div>
    </section>`;
}

function renderizarFormularioHorario(medico, fechaInicial, horaInicial) {
  return `
    <p class="modal__texto">Médico: <strong>${escaparHtml(medico.nombre)}</strong> · bloques de ${medico.jornada.duracionMinutos} minutos.</p>
    <div class="campo">
      <label class="campo__etiqueta" for="fechaNuevoHorario">Fecha</label>
      <input class="entrada" id="fechaNuevoHorario" type="date" min="${hoyISO()}" value="${escaparHtml(fechaInicial)}" required autofocus>
    </div>
    <div class="campo">
      <label class="campo__etiqueta" for="horaNuevoHorario">Hora</label>
      <input class="entrada" id="horaNuevoHorario" type="time" min="${HORA_MINIMA}" max="${HORA_MAXIMA}" step="300" value="${escaparHtml(horaInicial)}" required>
    </div>
    <p class="campo__error" id="errorNuevoHorario" role="alert" hidden></p>`;
}

function leerFormularioHorario(modal) {
  const fecha = modal.querySelector('#fechaNuevoHorario').value;
  const hora = modal.querySelector('#horaNuevoHorario').value;
  const error = modal.querySelector('#errorNuevoHorario');
  if (!fecha || !hora) {
    error.textContent = 'Completa la fecha y la hora.';
    error.hidden = false;
    return undefined;
  }
  error.hidden = true;
  return { fecha, hora };
}

export default {
  id: ID_MODULO,
  titulo: 'Gestionar agenda',
  icono: 'agenda',
  roles: ['medico', 'administrador'],
  seccion: 'Gestión',
  montar(contenedor, contexto) {
    const medicoInicial = contexto.rol === 'medico' ? contexto.usuario.id : contexto.params.medico ?? null;
    const estado = {
      paso: medicoInicial ? PASO_AGENDA : PASO_MEDICO,
      medicoId: medicoInicial,
      lunes: obtenerLunes(hoyISO()),
      horarioId: null,
      resultado: null,
    };

    function renderizar() {
      const contenidoPorPaso = {
        [PASO_MEDICO]: () => renderizarPasoMedico(contexto),
        [PASO_AGENDA]: () => renderizarPasoAgenda(estado, contexto),
        [PASO_CONFIRMACION]: () => renderizarPasoConfirmacion(estado, contexto),
      };
      contenedor.innerHTML = `
        ${renderizarEncabezado({ titulo: 'Gestionar agenda' })}
        ${renderizarStepper(PASOS, estado.paso)}
        ${contenidoPorPaso[estado.paso]()}`;
    }

    function completar(titulo, horario) {
      estado.resultado = { titulo, horario };
      estado.paso = PASO_CONFIRMACION;
      estado.horarioId = null;
      renderizar();
      contenedor.querySelector('[data-titulo-paso]')?.focus();
    }

    function ejecutar(operacion) {
      try {
        return operacion();
      } catch (error) {
        if (!(error instanceof ErrorDeDominio)) throw error;
        mostrarToast(error.message, 'error');
        return null;
      }
    }

    async function solicitarNuevoHorario() {
      const medico = obtenerMedico(estado.medicoId);
      const horarioSeleccionado = storage.obtenerPorId('horarios', estado.horarioId);
      const datos = await abrirModal({
        titulo: 'Agregar horario de atención',
        contenido: renderizarFormularioHorario(medico, horarioSeleccionado?.fecha ?? sumarDias(hoyISO(), 1), horarioSeleccionado?.hora ?? '08:00'),
        acciones: [
          { texto: 'Cancelar', valor: null },
          {
            texto: 'Guardar horario',
            variante: 'primario',
            alElegir(modal) {
              const valores = leerFormularioHorario(modal);
              if (!valores) return undefined;
              try {
                return agregarHorario({ medicoId: medico.id, ...valores, rol: contexto.rol });
              } catch (error) {
                if (!(error instanceof ErrorDeDominio)) throw error;
                const marcador = modal.querySelector('#errorNuevoHorario');
                marcador.textContent = error.message;
                marcador.hidden = false;
                return undefined;
              }
            },
          },
        ],
      });
      if (datos) completar('Horario agregado correctamente', datos);
    }

    async function solicitarEliminacion() {
      const horario = storage.obtenerPorId('horarios', estado.horarioId);
      if (!horario) return;
      const confirmado = await confirmarAccion({
        titulo: 'Eliminar horario de atención',
        mensaje: `¿Eliminar el horario del ${formatearFechaLarga(horario.fecha)} a las ${horario.hora}? Esta acción no se puede deshacer.`,
        textoConfirmar: 'Eliminar horario',
        peligro: true,
      });
      if (!confirmado) return;
      const eliminado = ejecutar(() => eliminarHorario({ horarioId: horario.id, rol: contexto.rol }));
      if (eliminado) completar('Horario eliminado correctamente', eliminado);
    }

    function solicitarBloqueo() {
      const horario = ejecutar(() => alternarBloqueo({ horarioId: estado.horarioId, rol: contexto.rol }));
      if (!horario) return;
      const bloqueado = horario.estado === ESTADOS_HORARIO.BLOQUEADO;
      completar(bloqueado ? 'Horario bloqueado correctamente' : 'Horario liberado correctamente', horario);
    }

    function cambiarSemana(direccion) {
      estado.lunes = sumarDias(estado.lunes, direccion * 7);
      estado.horarioId = null;
      renderizar();
    }

    const acciones = {
      'seleccionar-horario': (elemento) => {
        estado.horarioId = estado.horarioId === elemento.dataset.horario ? null : elemento.dataset.horario;
        renderizar();
        contenedor.querySelector('.celda-agenda--seleccionada')?.focus();
      },
      'semana-anterior': () => cambiarSemana(-1),
      'semana-siguiente': () => cambiarSemana(1),
      'agregar-horario': solicitarNuevoHorario,
      'eliminar-horario': solicitarEliminacion,
      'alternar-bloqueo': solicitarBloqueo,
      'seguir-gestionando': () => {
        estado.paso = PASO_AGENDA;
        renderizar();
      },
      'cambiar-medico': () => contexto.navegar(ID_MODULO),
    };

    contenedor.addEventListener('click', (evento) => {
      const elemento = evento.target.closest('[data-accion]');
      if (elemento && !elemento.disabled) acciones[elemento.dataset.accion]?.(elemento);
    });

    renderizar();
    return storage.suscribir(() => {
      if (estado.paso !== PASO_CONFIRMACION) renderizar();
    });
  },
};
