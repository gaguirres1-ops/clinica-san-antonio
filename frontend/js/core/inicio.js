import * as storage from './storage.js';
import {
  ESTADOS_CITA,
  ESTADOS_HORARIO,
  esCitaActiva,
  esCitaFutura,
  listarCitas,
  listarMedicos,
} from './dominio.js';
import { esFuturo, formatearDiaCorto, formatearFechaLarga, hoyISO, sumarDias } from './fechas.js';
import { construirHash } from './navigation.js';
import {
  escaparHtml,
  formatearMoneda,
  icono,
  renderizarEncabezado,
  renderizarListaCitas,
  renderizarVacio,
} from './ui.js';

const LIMITE_FILAS = 6;

function renderizarIndicador({ iconoIndicador, etiqueta, valor, detalle = '', variante = '' }) {
  return `
    <article class="indicador${variante ? ` indicador--${variante}` : ''}">
      <span class="indicador__icono">${icono(iconoIndicador)}</span>
      <div>
        <p class="indicador__etiqueta">${escaparHtml(etiqueta)}</p>
        <p class="indicador__valor">${escaparHtml(valor)}</p>
        ${detalle ? `<p class="indicador__detalle">${escaparHtml(detalle)}</p>` : ''}
      </div>
    </article>`;
}

function renderizarSeccionCitas({ titulo, citas, mostrar, vacio, enlace = '' }) {
  return `
    <section class="panel">
      <header class="panel__cabecera">
        <h2 class="panel__titulo">${escaparHtml(titulo)}</h2>
        ${enlace}
      </header>
      ${citas.length ? renderizarListaCitas(citas.slice(0, LIMITE_FILAS), { mostrar }) : renderizarVacio(vacio)}
    </section>`;
}

function primerNombre(nombreCompleto) {
  return nombreCompleto.replace(/^(Dr|Dra)\.\s+/i, '').split(' ')[0];
}

function renderizarInicioPaciente({ usuario }) {
  const citasDelPaciente = listarCitas((cita) => cita.pacienteId === usuario.id);
  const proximas = citasDelPaciente.filter((cita) => esCitaActiva(cita) && esCitaFutura(cita));
  const anteriores = citasDelPaciente.filter((cita) => !proximas.includes(cita)).reverse();
  const pendientesDePago = proximas.filter((cita) => cita.estado === ESTADOS_CITA.PENDIENTE_PAGO);
  const montoPendiente = pendientesDePago.reduce((total, cita) => total + (cita.pago?.monto ?? 0), 0);
  const siguiente = proximas[0];
  const botonReservar = `<a class="boton boton--primario" href="${construirHash('reservar-cita')}">${icono('calendarioMas')}Reservar nueva cita</a>`;

  return `
    ${renderizarEncabezado({
      titulo: `Hola, ${primerNombre(usuario.nombre)}`,
      descripcion: 'Revisa tus próximas citas, pagos pendientes y atenciones anteriores.',
      acciones: botonReservar,
      conMigas: false,
    })}
    <div class="indicadores">
      ${renderizarIndicador({
        iconoIndicador: 'calendario',
        etiqueta: 'Próxima cita',
        valor: siguiente ? formatearDiaCorto(siguiente.fecha) : 'Sin citas',
        detalle: siguiente ? `${siguiente.hora} · ${siguiente.medico?.especialidad?.nombre ?? ''}` : 'Agenda tu siguiente atención',
      })}
      ${renderizarIndicador({ iconoIndicador: 'reloj', etiqueta: 'Citas programadas', valor: String(proximas.length), detalle: 'Activas a futuro' })}
      ${renderizarIndicador({
        iconoIndicador: 'dinero',
        etiqueta: 'Pagos pendientes',
        valor: formatearMoneda(montoPendiente),
        detalle: `${pendientesDePago.length} cita(s) por pagar`,
        variante: pendientesDePago.length ? 'alerta' : '',
      })}
      ${renderizarIndicador({
        iconoIndicador: 'diagnostico',
        etiqueta: 'Atenciones',
        valor: String(citasDelPaciente.filter((cita) => cita.estado === ESTADOS_CITA.ATENDIDA).length),
        detalle: 'Con historial clínico',
      })}
    </div>
    <div class="rejilla-inicio">
      ${renderizarSeccionCitas({
        titulo: 'Próximas citas',
        citas: proximas,
        mostrar: 'medico',
        vacio: { titulo: 'No tienes citas programadas', mensaje: 'Reserva una cita con cualquiera de nuestros especialistas.', accion: botonReservar },
      })}
      ${renderizarSeccionCitas({
        titulo: 'Historial de citas',
        citas: anteriores,
        mostrar: 'medico',
        vacio: { iconoVacio: 'documento', titulo: 'Aún no tienes atenciones registradas' },
      })}
    </div>`;
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
    ${renderizarEncabezado({
      titulo: `Buen día, ${usuario.nombre.split(' ').slice(0, 2).join(' ')}`,
      descripcion: `${formatearFechaLarga(hoy)} · ${usuario.detalle}`,
      conMigas: false,
    })}
    <div class="indicadores">
      ${renderizarIndicador({ iconoIndicador: 'calendario', etiqueta: 'Citas de hoy', valor: String(deHoy.length), detalle: deHoy[0] ? `Primera a las ${deHoy[0].hora}` : 'Sin pacientes hoy' })}
      ${renderizarIndicador({ iconoIndicador: 'usuarios', etiqueta: 'Próximos 7 días', valor: String(semana.length), detalle: 'Pacientes programados' })}
      ${renderizarIndicador({ iconoIndicador: 'diagnostico', etiqueta: 'Por registrar', valor: String(porAtender.length), detalle: 'Citas pasadas sin diagnóstico', variante: porAtender.length ? 'alerta' : '' })}
      ${renderizarIndicador({ iconoIndicador: 'agenda', etiqueta: 'Horarios libres', valor: String(horariosLibres), detalle: 'En los próximos 7 días' })}
    </div>
    <div class="rejilla-inicio">
      ${renderizarSeccionCitas({
        titulo: 'Agenda próxima',
        citas: proximas,
        mostrar: 'paciente',
        vacio: { titulo: 'No hay pacientes programados', mensaje: 'Las nuevas reservas aparecerán aquí automáticamente.' },
      })}
      ${renderizarSeccionCitas({
        titulo: 'Pendientes de diagnóstico',
        citas: porAtender.reverse(),
        mostrar: 'paciente',
        vacio: { iconoVacio: 'check', titulo: 'Todo al día', mensaje: 'No tienes atenciones pendientes de registro.' },
      })}
    </div>`;
}

function renderizarInicioAdministrador({ usuario }) {
  const hoy = hoyISO();
  const activasFuturas = listarCitas((cita) => esCitaActiva(cita) && esFuturo(cita.fecha, cita.hora));
  const pendientesDePago = activasFuturas.filter((cita) => cita.estado === ESTADOS_CITA.PENDIENTE_PAGO);
  const horariosFuturos = storage.filtrar('horarios', (horario) => horario.fecha >= hoy && horario.estado !== ESTADOS_HORARIO.BLOQUEADO && esFuturo(horario.fecha, horario.hora));
  const ocupados = horariosFuturos.filter((horario) => horario.estado === ESTADOS_HORARIO.OCUPADO).length;
  const ocupacion = horariosFuturos.length ? Math.round((ocupados / horariosFuturos.length) * 100) : 0;
  const recientes = listarCitas(() => true).sort((a, b) => b.creadaEn.localeCompare(a.creadaEn));

  return `
    ${renderizarEncabezado({
      titulo: 'Panel de administración',
      descripcion: `${usuario.nombre} · ${usuario.detalle}`,
      conMigas: false,
    })}
    <div class="indicadores">
      ${renderizarIndicador({ iconoIndicador: 'calendario', etiqueta: 'Citas programadas', valor: String(activasFuturas.length), detalle: `${activasFuturas.filter((cita) => cita.fecha === hoy).length} para hoy` })}
      ${renderizarIndicador({ iconoIndicador: 'dinero', etiqueta: 'Pendientes de pago', valor: String(pendientesDePago.length), detalle: formatearMoneda(pendientesDePago.reduce((total, cita) => total + (cita.pago?.monto ?? 0), 0)), variante: pendientesDePago.length ? 'alerta' : '' })}
      ${renderizarIndicador({ iconoIndicador: 'estetoscopio', etiqueta: 'Médicos activos', valor: String(listarMedicos().length), detalle: `${storage.contar('especialidades')} especialidades` })}
      ${renderizarIndicador({ iconoIndicador: 'grafico', etiqueta: 'Ocupación de agenda', valor: `${ocupacion} %`, detalle: `${ocupados} de ${horariosFuturos.length} horarios` })}
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
    </div>`;
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
