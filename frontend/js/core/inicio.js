import * as storage from './storage.js';
import {
  ESTADOS_CITA,
  ESTADOS_HORARIO,
  esCitaActiva,
  esCitaFutura,
  listarCitas,
  listarCitasPorAtender,
  listarMedicos,
} from './dominio.js';
import { esFuturo, formatearFecha, hoyISO } from './fechas.js';
import { construirHash } from './navigation.js';
import {
  escaparHtml,
  formatearMoneda,
  icono,
  insigniaEstado,
  renderizarAvatarMedico,
  renderizarEncabezado,
  renderizarListaCitas,
  renderizarVacio,
} from './ui.js';

const LIMITE_FILAS = 6;
const LIMITE_MIS_CITAS = 8;
const TODAS_LAS_ESPECIALIDADES = '';

const SERVICIOS = [
  { icono: 'calendarioMas', titulo: 'Citas en línea', detalle: 'Agenda tu consulta en minutos.' },
  { icono: 'usuarios', titulo: 'Especialistas', detalle: 'Médicos altamente calificados.' },
  { icono: 'dinero', titulo: 'Pago seguro', detalle: 'Diversos métodos de pago.' },
  { icono: 'campana', titulo: 'Notificaciones', detalle: 'Recibe recordatorios de tus citas.' },
];

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

function renderizarFiltros(especialidades, filtroActivo) {
  const opciones = [TODAS_LAS_ESPECIALIDADES, ...especialidades];
  return `
    <div class="filtros" role="group" aria-label="Filtrar por especialidad">
      ${opciones.map((nombre) => `<button class="filtro" type="button" data-filtro="${escaparHtml(nombre)}" aria-pressed="${nombre === filtroActivo}">${escaparHtml(nombre || 'Todos')}</button>`).join('')}
    </div>`;
}

function renderizarTarjetaMedico(medico, destino) {
  return `
    <article class="tarjeta-especialista">
      <div class="tarjeta-especialista__foto">${renderizarAvatarMedico(medico, 'completo')}</div>
      <div class="tarjeta-especialista__cuerpo">
        <span class="tarjeta-especialista__especialidad">${escaparHtml(medico.especialidad?.nombre ?? '')}</span>
        <h3 class="tarjeta-especialista__nombre">${escaparHtml(medico.nombre)}</h3>
        <span class="tarjeta-especialista__cmp">CMP ${escaparHtml(medico.cmp)}</span>
        <div class="tarjeta-especialista__pie">
          <div class="tarjeta-especialista__precio"><small>Consulta</small><b>${escaparHtml(formatearMoneda(medico.tarifa))}</b></div>
          <a class="boton boton--suave boton--pequeno" href="${construirHash(destino.ruta, { medico: medico.id })}">${escaparHtml(destino.texto)}${icono('calendario')}</a>
        </div>
      </div>
    </article>`;
}

function renderizarEspecialistas(filtroActivo, destino) {
  const medicos = listarMedicos();
  const especialidades = [...new Set(medicos.map((medico) => medico.especialidad?.nombre).filter(Boolean))];
  const visibles = medicos.filter((medico) => !filtroActivo || medico.especialidad?.nombre === filtroActivo);
  return `
    <section class="especialistas" id="especialistas" aria-labelledby="tituloEspecialistas">
      <header class="bloque__cabecera">
        <h2 class="bloque__titulo" id="tituloEspecialistas">Nuestros especialistas</h2>
        ${renderizarFiltros(especialidades, filtroActivo)}
      </header>
      <div class="especialistas__rejilla">${visibles.map((medico) => renderizarTarjetaMedico(medico, destino)).join('')}</div>
    </section>`;
}

function renderizarPortadaPaciente() {
  return `
    <section class="portada" aria-labelledby="tituloPortada">
      <div class="portada__texto">
        <span class="portada__etiqueta">Cuidamos tu salud</span>
        <h1 class="portada__titulo" id="tituloPortada">Tu salud,<br><span>nuestra prioridad</span></h1>
        <p class="portada__lema">Agenda tu cita médica de forma rápida, segura y desde donde estés.</p>
        <div class="portada__acciones">
          <a class="boton boton--primario" href="${construirHash('reservar-cita')}">${icono('calendario')}Reservar cita${icono('flechaDerecha')}</a>
          <button class="boton boton--secundario" type="button" data-accion="ver-especialistas">${icono('estetoscopio')}Ver especialistas</button>
        </div>
      </div>
      <div class="portada__foto" role="img" aria-label="Médica sonriendo frente a la fachada de la Clínica San Antonio"></div>
    </section>
    <section class="servicios" aria-label="Servicios">
      ${SERVICIOS.map((servicio) => `
        <article class="servicio">
          <span class="servicio__icono">${icono(servicio.icono)}</span>
          <h3>${escaparHtml(servicio.titulo)}</h3>
          <p>${escaparHtml(servicio.detalle)}</p>
        </article>`).join('')}
    </section>`;
}

function renderizarMisCitas(citas) {
  if (!citas.length) {
    return `
      <section class="panel mis-citas">
        <header class="panel__cabecera"><h2 class="panel__titulo">Mis citas</h2></header>
        ${renderizarVacio({ titulo: 'Aún no tienes citas registradas', accion: `<a class="boton boton--primario boton--pequeno" href="${construirHash('reservar-cita')}">Registrar cita</a>` })}
      </section>`;
  }
  return `
    <section class="panel mis-citas" aria-labelledby="tituloMisCitas">
      <header class="panel__cabecera">
        <h2 class="panel__titulo" id="tituloMisCitas">Mis citas</h2>
        <a class="boton boton--primario boton--pequeno" href="${construirHash('reservar-cita')}">${icono('calendarioMas')}Nueva cita</a>
      </header>
      <ul class="mis-citas__lista">
        ${citas.slice(0, LIMITE_MIS_CITAS).map((cita) => `
          <li>
            <a class="mis-citas__fila" href="${construirHash('detalle-cita', { id: cita.id })}">
              ${renderizarAvatarMedico(cita.medico, 'lista')}
              <span class="mis-citas__info">
                <strong>${escaparHtml(cita.medico?.nombre ?? '')}</strong>
                <small>${escaparHtml(cita.medico?.especialidad?.nombre ?? '')} · <span class="codigo">${escaparHtml(cita.id)}</span></small>
              </span>
              <span class="mis-citas__fecha">${icono('calendario')}${escaparHtml(formatearFecha(cita.fecha))} · ${escaparHtml(cita.hora)}</span>
              ${insigniaEstado(cita.estado)}
            </a>
          </li>`).join('')}
      </ul>
    </section>`;
}

function renderizarInicioPaciente({ usuario }, filtroActivo) {
  const citas = listarCitas((cita) => cita.pacienteId === usuario.id && cita.estado !== ESTADOS_CITA.CANCELADA);
  return `
    ${renderizarPortadaPaciente()}
    ${renderizarEspecialistas(filtroActivo, { ruta: 'reservar-cita', texto: 'Reservar' })}
    ${renderizarMisCitas(citas)}`;
}

function renderizarInicioMedico({ usuario }) {
  const porAtender = listarCitasPorAtender(usuario.id);
  const idsPorAtender = new Set(porAtender.map((cita) => cita.id));
  const proximas = listarCitas((cita) => cita.medicoId === usuario.id && esCitaActiva(cita) && esCitaFutura(cita))
    .filter((cita) => !idsPorAtender.has(cita.id));

  return `
    ${renderizarEncabezado({ titulo: 'Citas por atender', conMigas: false })}
    <div class="rejilla-inicio">
      ${renderizarSeccionCitas({
    titulo: 'Citas para atender hoy',
    citas: porAtender,
    mostrar: 'paciente',
    vacio: { iconoVacio: 'check', titulo: 'No tienes citas por atender hoy' },
  })}
      ${renderizarSeccionCitas({
    titulo: 'Próximas citas pendientes',
    citas: proximas,
    mostrar: 'paciente',
    vacio: { titulo: 'No hay pacientes programados' },
  })}
    </div>`;
}

function renderizarInicioAdministrador(_contexto, filtroActivo) {
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
    ${renderizarEspecialistas(filtroActivo, { ruta: 'gestionar-agenda', texto: 'Agenda' })}`;
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
    let filtroActivo = TODAS_LAS_ESPECIALIDADES;
    const renderizar = () => {
      contenedor.innerHTML = VISTAS_POR_ROL[contexto.rol](contexto, filtroActivo);
    };

    contenedor.addEventListener('click', (evento) => {
      const filtro = evento.target.closest('[data-filtro]');
      if (filtro) {
        filtroActivo = filtro.dataset.filtro;
        renderizar();
        contenedor.querySelector(`[data-filtro="${CSS.escape(filtroActivo)}"]`)?.focus();
        return;
      }
      if (evento.target.closest('[data-accion="ver-especialistas"]')) {
        contenedor.querySelector('#especialistas')?.scrollIntoView({ behavior: 'smooth' });
      }
    });

    renderizar();
    return storage.suscribir(renderizar);
  },
};
