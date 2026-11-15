import * as storage from './storage.js';
import {
  ESTADOS_CITA,
  ESTADOS_HORARIO,
  esCitaActiva,
  esCitaFutura,
  listarCitas,
  listarMedicos,
  proximaFechaDisponible,
} from './dominio.js';
import { esFuturo, formatearDiaCorto, hoyISO, sumarDias } from './fechas.js';
import { construirHash } from './navigation.js';
import {
  escaparHtml,
  formatearMoneda,
  icono,
  renderizarAvatar,
  renderizarEncabezado,
  renderizarListaCitas,
  renderizarVacio,
} from './ui.js';

const LIMITE_FILAS = 6;
const LIMITE_MEDICOS_DISPONIBLES = 6;
const RUTA_FOTO_EQUIPO = 'img/equipo-medico.jpg';

function renderizarIndicador({ iconoIndicador, etiqueta, valor, variante = '' }) {
  return `
    <article class="indicador${variante ? ` indicador--${variante}` : ''}">
      <span class="indicador__icono">${icono(iconoIndicador)}</span>
      <div>
        <p class="indicador__etiqueta">${escaparHtml(etiqueta)}</p>
        <p class="indicador__valor">${escaparHtml(valor)}</p>
      </div>
    </article>`;
}

function renderizarSeccionCitas({ titulo, citas, mostrar, vacio }) {
  return `
    <section class="panel">
      <header class="panel__cabecera">
        <h2 class="panel__titulo">${escaparHtml(titulo)}</h2>
      </header>
      ${citas.length ? renderizarListaCitas(citas.slice(0, LIMITE_FILAS), { mostrar }) : renderizarVacio(vacio)}
    </section>`;
}

function primerNombre(nombreCompleto) {
  return nombreCompleto.replace(/^(Dr|Dra)\.\s+/i, '').split(' ')[0];
}

function listarMedicosConDisponibilidad() {
  return listarMedicos()
    .map((medico) => ({ medico, proximaFecha: proximaFechaDisponible(medico.id) }))
    .filter(({ proximaFecha }) => proximaFecha)
    .sort((a, b) => a.proximaFecha.localeCompare(b.proximaFecha) || a.medico.nombre.localeCompare(b.medico.nombre))
    .slice(0, LIMITE_MEDICOS_DISPONIBLES);
}

function renderizarTarjetaMedico({ medico, proximaFecha }, { rutaDestino, textoDestino }) {
  return `
    <li>
      <a class="medico-disponible" href="${construirHash(rutaDestino, { medico: medico.id })}">
        ${renderizarAvatar(medico.nombre, 'grande')}
        <span class="medico-disponible__info">
          <small>${escaparHtml(medico.especialidad?.nombre ?? '')}</small>
          <strong>${escaparHtml(medico.nombre)}</strong>
          <span class="medico-disponible__fecha">${icono('calendario')}${escaparHtml(formatearDiaCorto(proximaFecha))}</span>
        </span>
        <span class="medico-disponible__accion">${escaparHtml(textoDestino)}${icono('flechaDerecha')}</span>
      </a>
    </li>`;
}

function renderizarMedicosDisponibles(destino) {
  const medicos = listarMedicosConDisponibilidad();
  if (!medicos.length) return '';
  return `
    <section class="panel medicos-disponibles" aria-labelledby="tituloMedicosDisponibles">
      <header class="panel__cabecera">
        <h2 class="panel__titulo" id="tituloMedicosDisponibles">Médicos disponibles</h2>
      </header>
      <figure class="medicos-disponibles__equipo">
        <img src="${RUTA_FOTO_EQUIPO}" alt="Equipo médico de la Clínica San Antonio" width="1672" height="941" loading="lazy">
      </figure>
      <ul class="medicos-disponibles__lista">
        ${medicos.map((item) => renderizarTarjetaMedico(item, destino)).join('')}
      </ul>
    </section>`;
}

function renderizarPortadaPaciente({ usuario, siguiente }) {
  const enlaceSiguiente = siguiente
    ? `<a class="boton boton--portada" href="${construirHash('detalle-cita', { id: siguiente.id })}">${icono('calendario')}Mi próxima cita · ${escaparHtml(formatearDiaCorto(siguiente.fecha))}</a>`
    : '';
  return `
    <section class="portada" aria-labelledby="tituloPortada">
      <div class="portada__texto">
        <h1 class="portada__titulo" id="tituloPortada">Hola, ${escaparHtml(primerNombre(usuario.nombre))}</h1>
        <p class="portada__lema">Tu salud, <strong>nuestra prioridad</strong></p>
        <div class="portada__acciones">
          <a class="boton boton--claro" href="${construirHash('reservar-cita')}">${icono('calendarioMas')}Reservar cita</a>
          ${enlaceSiguiente}
        </div>
      </div>
    </section>`;
}

function renderizarInicioPaciente({ usuario }) {
  const citasDelPaciente = listarCitas((cita) => cita.pacienteId === usuario.id);
  const proximas = citasDelPaciente.filter((cita) => esCitaActiva(cita) && esCitaFutura(cita));
  const anteriores = citasDelPaciente.filter((cita) => !proximas.includes(cita)).reverse();
  const pendientesDePago = proximas.filter((cita) => cita.estado === ESTADOS_CITA.PENDIENTE_PAGO);
  const montoPendiente = pendientesDePago.reduce((total, cita) => total + (cita.pago?.monto ?? 0), 0);
  const atenciones = citasDelPaciente.filter((cita) => cita.estado === ESTADOS_CITA.ATENDIDA).length;

  return `
    ${renderizarPortadaPaciente({ usuario, siguiente: proximas[0] })}
    <div class="indicadores indicadores--tres">
      ${renderizarIndicador({ iconoIndicador: 'calendario', etiqueta: 'Citas programadas', valor: String(proximas.length) })}
      ${renderizarIndicador({ iconoIndicador: 'dinero', etiqueta: 'Pagos pendientes', valor: formatearMoneda(montoPendiente), variante: pendientesDePago.length ? 'alerta' : '' })}
      ${renderizarIndicador({ iconoIndicador: 'diagnostico', etiqueta: 'Atenciones', valor: String(atenciones) })}
    </div>
    <div class="rejilla-inicio">
      ${renderizarSeccionCitas({
        titulo: 'Próximas citas',
        citas: proximas,
        mostrar: 'medico',
        vacio: { titulo: 'No tienes citas programadas' },
      })}
      ${renderizarSeccionCitas({
        titulo: 'Historial de citas',
        citas: anteriores,
        mostrar: 'medico',
        vacio: { iconoVacio: 'documento', titulo: 'Aún no tienes atenciones registradas' },
      })}
    </div>
    ${renderizarMedicosDisponibles({ rutaDestino: 'reservar-cita', textoDestino: 'Reservar' })}`;
}

function renderizarInicioMedico({ usuario }) {
  const hoy = hoyISO();
  const finDeSemana = sumarDias(hoy, 7);
  const citasDelMedico = listarCitas((cita) => cita.medicoId === usuario.id && esCitaActiva(cita));
  const deHoy = citasDelMedico.filter((cita) => cita.fecha === hoy);
  const proximas = citasDelMedico.filter((cita) => esCitaFutura(cita));
  const semana = proximas.filter((cita) => cita.fecha <= finDeSemana);
  const porAtender = citasDelMedico.filter((cita) => !esCitaFutura(cita) && cita.estado !== ESTADOS_CITA.PENDIENTE_PAGO);
  const horariosLibres = storage.contar('horarios', (horario) => horario.medicoId === usuario.id
    && horario.estado === ESTADOS_HORARIO.DISPONIBLE
    && horario.fecha >= hoy
    && horario.fecha <= finDeSemana
    && esFuturo(horario.fecha, horario.hora));

  return `
    ${renderizarEncabezado({ titulo: `Buen día, ${usuario.nombre.split(' ').slice(0, 2).join(' ')}`, conMigas: false })}
    <div class="indicadores">
      ${renderizarIndicador({ iconoIndicador: 'calendario', etiqueta: 'Citas de hoy', valor: String(deHoy.length) })}
      ${renderizarIndicador({ iconoIndicador: 'usuarios', etiqueta: 'Próximos 7 días', valor: String(semana.length) })}
      ${renderizarIndicador({ iconoIndicador: 'diagnostico', etiqueta: 'Por registrar', valor: String(porAtender.length), variante: porAtender.length ? 'alerta' : '' })}
      ${renderizarIndicador({ iconoIndicador: 'agenda', etiqueta: 'Horarios libres', valor: String(horariosLibres) })}
    </div>
    <div class="rejilla-inicio">
      ${renderizarSeccionCitas({
        titulo: 'Agenda próxima',
        citas: proximas,
        mostrar: 'paciente',
        vacio: { titulo: 'No hay pacientes programados' },
      })}
      ${renderizarSeccionCitas({
        titulo: 'Pendientes de diagnóstico',
        citas: porAtender.reverse(),
        mostrar: 'paciente',
        vacio: { iconoVacio: 'check', titulo: 'Todo al día' },
      })}
    </div>`;
}

function renderizarInicioAdministrador() {
  const hoy = hoyISO();
  const activasFuturas = listarCitas((cita) => esCitaActiva(cita) && esFuturo(cita.fecha, cita.hora));
  const pendientesDePago = activasFuturas.filter((cita) => cita.estado === ESTADOS_CITA.PENDIENTE_PAGO);
  const horariosFuturos = storage.filtrar('horarios', (horario) => horario.fecha >= hoy && horario.estado !== ESTADOS_HORARIO.BLOQUEADO && esFuturo(horario.fecha, horario.hora));
  const ocupados = horariosFuturos.filter((horario) => horario.estado === ESTADOS_HORARIO.OCUPADO).length;
  const ocupacion = horariosFuturos.length ? Math.round((ocupados / horariosFuturos.length) * 100) : 0;
  const recientes = listarCitas(() => true).sort((a, b) => b.creadaEn.localeCompare(a.creadaEn));

  return `
    ${renderizarEncabezado({ titulo: 'Panel de administración', conMigas: false })}
    <div class="indicadores">
      ${renderizarIndicador({ iconoIndicador: 'calendario', etiqueta: 'Citas programadas', valor: String(activasFuturas.length) })}
      ${renderizarIndicador({ iconoIndicador: 'dinero', etiqueta: 'Pendientes de pago', valor: String(pendientesDePago.length), variante: pendientesDePago.length ? 'alerta' : '' })}
      ${renderizarIndicador({ iconoIndicador: 'estetoscopio', etiqueta: 'Médicos activos', valor: String(listarMedicos().length) })}
      ${renderizarIndicador({ iconoIndicador: 'grafico', etiqueta: 'Ocupación de agenda', valor: `${ocupacion} %` })}
    </div>
    <div class="rejilla-inicio">
      ${renderizarSeccionCitas({
        titulo: 'Próximas citas',
        citas: activasFuturas,
        mostrar: 'ambos',
        vacio: { titulo: 'No hay citas programadas' },
      })}
      ${renderizarSeccionCitas({
        titulo: 'Actividad reciente',
        citas: recientes,
        mostrar: 'ambos',
        vacio: { iconoVacio: 'pulso', titulo: 'Sin actividad registrada' },
      })}
    </div>
    ${renderizarMedicosDisponibles({ rutaDestino: 'gestionar-agenda', textoDestino: 'Agenda' })}`;
}

const VISTAS_POR_ROL = {
  paciente: renderizarInicioPaciente,
  medico: renderizarInicioMedico,
  administrador: renderizarInicioAdministrador,
};

export default {
  id: 'inicio',
  titulo: 'Inicio',
  icono: 'inicio',
  roles: ['paciente', 'medico', 'administrador'],
  seccion: 'General',
  montar(contenedor, contexto) {
    const renderizar = () => {
      contenedor.innerHTML = VISTAS_POR_ROL[contexto.rol](contexto);
    };
    renderizar();
    return storage.suscribir(renderizar);
  },
};
