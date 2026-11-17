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
import {
  abrirModal,
  confirmarAccion,
  escaparHtml,
  icono,
  mostrarToast,
  renderizarAvatarMedico,
  renderizarEncabezado,
  renderizarVacio,
} from '../core/ui.js';

const ID_MODULO = 'gestionar-agenda';
const DIAS_POR_SEMANA = 6;
const SEMANAS_ADELANTE = 8;
const HORA_MINIMA = '06:00';
const HORA_MAXIMA = '22:00';

const ETIQUETAS_DE_ESTADO = {
  [ESTADOS_HORARIO.DISPONIBLE]: 'Disponible',
  [ESTADOS_HORARIO.OCUPADO]: 'Ocupado',
  [ESTADOS_HORARIO.BLOQUEADO]: 'Bloqueado',
};

function obtenerLunes(fechaIso) {
  const desplazamiento = (desdeISO(fechaIso).getDay() + 6) % 7;
  return sumarDias(fechaIso, -desplazamiento);
}

function listarHorariosDeSemana(medicoId, lunes) {
  const finDeSemana = sumarDias(lunes, DIAS_POR_SEMANA);
  return storage
    .filtrar('horarios', (horario) => horario.medicoId === medicoId && horario.fecha >= lunes && horario.fecha < finDeSemana)
    .sort((a, b) => `${a.fecha}${a.hora}`.localeCompare(`${b.fecha}${b.hora}`));
}

function buscarHorario(medicoId, seleccion) {
  return seleccion
    ? storage.buscar('horarios', (horario) => horario.medicoId === medicoId && horario.fecha === seleccion.fecha && horario.hora === seleccion.hora)
    : null;
}

function hayCruceDeHorario(medicoId, fecha, hora, duracionMinutos) {
  const inicio = aMinutos(hora);
  const fin = inicio + duracionMinutos;
  return Boolean(storage.buscar('horarios', (horario) => horario.medicoId === medicoId
    && horario.fecha === fecha
    && aMinutos(horario.hora) < fin
    && inicio < aMinutos(horario.hora) + horario.duracionMinutos));
}

function notificarCambioDeAgenda({ medico, mensaje }) {
  notificar({ destinatarioRol: 'medico', destinatarioId: medico.id, titulo: 'Agenda actualizada', mensaje });
}

function agregarHorario({ medicoId, fecha, hora }) {
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
    notificarCambioDeAgenda({ medico, mensaje: `Se agregó un horario de atención el ${formatearFecha(fecha)} a las ${hora}.` });
    return horario;
  });
}

function eliminarHorario({ horarioId }) {
  return storage.ejecutarTransaccion(() => {
    const horario = storage.obtenerPorId('horarios', horarioId);
    if (!horario || horario.estado !== ESTADOS_HORARIO.DISPONIBLE) {
      throw new ErrorDeDominio('Solo puedes eliminar horarios disponibles.');
    }
    if (!esFuturo(horario.fecha, horario.hora)) throw new ErrorDeDominio('No se pueden eliminar horarios pasados.');
    storage.eliminar('horarios', horarioId);
    notificarCambioDeAgenda({
      medico: obtenerMedico(horario.medicoId),
      mensaje: `Se eliminó el horario de atención del ${formatearFecha(horario.fecha)} a las ${horario.hora}.`,
    });
    return horario;
  });
}

function renderizarListaDeMedicos(medicos, medicoId) {
  return `
    <section class="panel" aria-labelledby="tituloMedicos">
      <header class="gestion-agenda__cabecera">
        <h2 class="panel__titulo" id="tituloMedicos">Médicos registrados</h2>
        <p>Selecciona un médico para consultar su agenda.</p>
      </header>
      <ul class="medicos-agenda">
        ${medicos.map((medico) => `
          <li>
            <button class="medico-agenda${medico.id === medicoId ? ' medico-agenda--seleccionado' : ''}" type="button" data-accion="seleccionar-medico" data-medico="${escaparHtml(medico.id)}" aria-pressed="${medico.id === medicoId}">
              ${renderizarAvatarMedico(medico)}
              <span class="medico-agenda__info">
                <strong>${escaparHtml(medico.nombre)}</strong>
                <small>${escaparHtml(medico.especialidad?.nombre ?? '')}</small>
              </span>
              ${medico.id === medicoId ? icono('check', 'medico-agenda__marca') : ''}
            </button>
          </li>`).join('')}
      </ul>
    </section>`;
}

function renderizarCelda(fecha, hora, horario, seleccion) {
  const seleccionada = seleccion?.fecha === fecha && seleccion?.hora === hora;
  const etiqueta = horario ? ETIQUETAS_DE_ESTADO[horario.estado] : 'Sin registrar';
  const clases = [
    'celda-agenda',
    `celda-agenda--${horario ? horario.estado : 'vacia'}`,
    seleccionada && 'celda-agenda--seleccionada',
    !esFuturo(fecha, hora) && 'celda-agenda--pasada',
  ].filter(Boolean).join(' ');
  return `
    <td>
      <button class="${clases}" type="button" data-accion="seleccionar-horario" data-fecha="${fecha}" data-hora="${escaparHtml(hora)}"
        aria-pressed="${seleccionada}" aria-label="${escaparHtml(`${formatearDiaCorto(fecha)} ${hora}: ${etiqueta}${seleccionada ? ', seleccionado' : ''}`)}">
        ${etiqueta}${seleccionada ? '<small>Seleccionado</small>' : ''}
      </button>
    </td>`;
}

function renderizarTablaSemanal(horarios, lunes, seleccion) {
  const dias = Array.from({ length: DIAS_POR_SEMANA }, (_, indice) => sumarDias(lunes, indice));
  const horas = [...new Set(horarios.map((horario) => horario.hora))].sort();
  const porClave = new Map(horarios.map((horario) => [`${horario.fecha}|${horario.hora}`, horario]));
  return `
    <div class="agenda-semanal__tabla-contenedor" role="region" aria-label="Agenda semanal desplazable" tabindex="0">
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
              ${dias.map((dia) => renderizarCelda(dia, hora, porClave.get(`${dia}|${hora}`), seleccion)).join('')}
            </tr>`).join('')}
        </tbody>
      </table>
    </div>`;
}

function renderizarLeyenda() {
  const elementos = [
    ['disponible', 'Disponible'],
    ['ocupado', 'Ocupado'],
    ['bloqueado', 'Bloqueado'],
    ['seleccionada', 'Seleccionado'],
  ];
  return `
    <ul class="agenda-semanal__leyenda" aria-label="Leyenda de horarios">
      ${elementos.map(([clase, texto]) => `<li><span class="agenda-semanal__muestra agenda-semanal__muestra--${clase}" aria-hidden="true"></span>${texto}</li>`).join('')}
    </ul>`;
}

function renderizarAgenda(estado) {
  const medico = obtenerMedico(estado.medicoId);
  const horarios = listarHorariosDeSemana(medico.id, estado.lunes);
  const horarioSeleccionado = buscarHorario(medico.id, estado.seleccion);
  const lunesActual = obtenerLunes(hoyISO());
  const puedeRetroceder = estado.lunes > lunesActual;
  const puedeAvanzar = estado.lunes < sumarDias(lunesActual, SEMANAS_ADELANTE * 7);
  const puedeEliminar = horarioSeleccionado?.estado === ESTADOS_HORARIO.DISPONIBLE
    && esFuturo(horarioSeleccionado.fecha, horarioSeleccionado.hora);
  const textoSeleccion = estado.seleccion
    ? `${formatearFechaLarga(estado.seleccion.fecha)}, ${estado.seleccion.hora}`
    : 'Ninguno';

  return `
    <section class="panel agenda-semanal" aria-labelledby="tituloAgenda">
      <header class="agenda-semanal__cabecera">
        <div>
          <h2 class="panel__titulo" id="tituloAgenda">Agenda del médico seleccionado</h2>
          <p>${escaparHtml(medico.nombre)} · ${escaparHtml(medico.especialidad?.nombre ?? '')}</p>
        </div>
        <div class="agenda-semanal__navegacion">
          <button class="boton-icono boton-icono--claro" type="button" data-accion="semana-anterior" aria-label="Semana anterior"${puedeRetroceder ? '' : ' disabled'}>${icono('chevronIzquierda')}</button>
          <span class="agenda-semanal__periodo">${escaparHtml(formatearFecha(estado.lunes))} – ${escaparHtml(formatearFecha(sumarDias(estado.lunes, DIAS_POR_SEMANA - 1)))}</span>
          <button class="boton-icono boton-icono--claro" type="button" data-accion="semana-siguiente" aria-label="Semana siguiente"${puedeAvanzar ? '' : ' disabled'}>${icono('chevronDerecha')}</button>
        </div>
      </header>
      ${horarios.length
    ? renderizarTablaSemanal(horarios, estado.lunes, estado.seleccion)
    : renderizarVacio({ iconoVacio: 'agenda', titulo: 'Este médico no tiene horarios registrados', mensaje: 'Puedes agregar su primer horario de atención.' })}
      ${renderizarLeyenda()}
      <div class="agenda-semanal__acciones-area">
        <p class="agenda-semanal__seleccion">Horario seleccionado: <strong>${escaparHtml(textoSeleccion)}</strong></p>
        <div class="agenda-semanal__acciones">
          <button class="boton boton--primario" type="button" data-accion="agregar-horario">${icono('mas')}Agregar horario de atención</button>
          <button class="boton boton--secundario" type="button" data-accion="eliminar-horario"${puedeEliminar ? '' : ' disabled'}>Eliminar horario de atención</button>
        </div>
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
    <p class="modal__texto">Solo se pueden agregar horarios en espacios sin registrar.</p>
    <p class="campo__error" id="errorNuevoHorario" role="alert" hidden></p>`;
}

function mostrarErrorDelFormulario(modal, mensaje) {
  const marcador = modal.querySelector('#errorNuevoHorario');
  marcador.textContent = mensaje;
  marcador.hidden = false;
}

export default {
  id: ID_MODULO,
  titulo: 'Gestionar agenda médica',
  icono: 'agenda',
  roles: ['administrador'],
  seccion: 'Gestión',
  montar(contenedor, contexto) {
    const medicos = listarMedicos({ soloActivos: false });
    const medicoInicial = medicos.find((medico) => medico.id === contexto.params.medico) ?? medicos[0];
    const estado = {
      medicoId: medicoInicial?.id ?? null,
      lunes: obtenerLunes(hoyISO()),
      seleccion: null,
    };

    function renderizar() {
      const cuerpo = estado.medicoId
        ? `<div class="gestion-agenda">${renderizarListaDeMedicos(medicos, estado.medicoId)}${renderizarAgenda(estado)}</div>`
        : `<section class="panel">${renderizarVacio({ iconoVacio: 'estetoscopio', titulo: 'No hay agendas disponibles para gestionar', mensaje: 'No se encontraron médicos registrados.' })}</section>`;
      contenedor.innerHTML = `
        ${renderizarEncabezado({ titulo: 'Gestionar agenda médica', descripcion: 'Consulta los médicos registrados, revisa sus horarios de atención y gestiona la disponibilidad de la agenda médica.' })}
        ${cuerpo}`;
    }

    async function solicitarNuevoHorario() {
      const medico = obtenerMedico(estado.medicoId);
      const horario = await abrirModal({
        titulo: 'Agregar horario de atención',
        contenido: renderizarFormularioHorario(medico, estado.seleccion?.fecha ?? sumarDias(hoyISO(), 1), estado.seleccion?.hora ?? '08:00'),
        acciones: [
          { texto: 'Cancelar', valor: null },
          {
            texto: 'Guardar horario',
            variante: 'primario',
            alElegir(modal) {
              const fecha = modal.querySelector('#fechaNuevoHorario').value;
              const hora = modal.querySelector('#horaNuevoHorario').value;
              if (!fecha || !hora) {
                mostrarErrorDelFormulario(modal, 'Completa la fecha y la hora.');
                return undefined;
              }
              try {
                return agregarHorario({ medicoId: medico.id, fecha, hora });
              } catch (error) {
                if (!(error instanceof ErrorDeDominio)) throw error;
                mostrarErrorDelFormulario(modal, error.message);
                return undefined;
              }
            },
          },
        ],
      });
      if (!horario) return;
      estado.seleccion = { fecha: horario.fecha, hora: horario.hora };
      estado.lunes = obtenerLunes(horario.fecha);
      renderizar();
      mostrarToast(`Horario agregado correctamente: ${formatearFecha(horario.fecha)} a las ${horario.hora}.`);
    }

    async function solicitarEliminacion() {
      const horario = buscarHorario(estado.medicoId, estado.seleccion);
      if (!horario) return;
      const confirmado = await confirmarAccion({
        titulo: 'Eliminar horario de atención',
        mensaje: `¿Eliminar el horario disponible del ${formatearFechaLarga(horario.fecha)} a las ${horario.hora}? Esta acción no se puede deshacer.`,
        textoConfirmar: 'Eliminar',
        peligro: true,
      });
      if (!confirmado) return;
      try {
        eliminarHorario({ horarioId: horario.id });
      } catch (error) {
        if (!(error instanceof ErrorDeDominio)) throw error;
        mostrarToast(error.message, 'error');
        return;
      }
      estado.seleccion = null;
      renderizar();
      mostrarToast('Horario eliminado correctamente.');
    }

    function cambiarSemana(direccion) {
      estado.lunes = sumarDias(estado.lunes, direccion * 7);
      estado.seleccion = null;
      renderizar();
    }

    const acciones = {
      'seleccionar-medico': (elemento) => {
        Object.assign(estado, { medicoId: elemento.dataset.medico, seleccion: null, lunes: obtenerLunes(hoyISO()) });
        renderizar();
        contenedor.querySelector('.medico-agenda--seleccionado')?.focus();
      },
      'seleccionar-horario': (elemento) => {
        estado.seleccion = { fecha: elemento.dataset.fecha, hora: elemento.dataset.hora };
        renderizar();
        contenedor.querySelector('.celda-agenda--seleccionada')?.focus();
      },
      'semana-anterior': () => cambiarSemana(-1),
      'semana-siguiente': () => cambiarSemana(1),
      'agregar-horario': solicitarNuevoHorario,
      'eliminar-horario': solicitarEliminacion,
    };

    contenedor.addEventListener('click', (evento) => {
      const elemento = evento.target.closest('[data-accion]');
      if (elemento && !elemento.disabled) acciones[elemento.dataset.accion]?.(elemento);
    });

    renderizar();
    return storage.suscribir(renderizar);
  },
};
