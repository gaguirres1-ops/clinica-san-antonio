import * as storage from '../core/storage.js';
import { esCitaActiva, esCitaFutura, listarCitas, listarMedicos } from '../core/dominio.js';
import { hoyISO, partesDeFecha } from '../core/fechas.js';
import { construirHash } from '../core/navigation.js';
import {
  escaparHtml,
  icono,
  insigniaEstado,
  renderizarAvatarMedico,
  renderizarEncabezado,
  renderizarVacio,
} from '../core/ui.js';

const ID_MODULO = 'citas-existentes';

function agruparCitasPorMedico() {
  const hoy = hoyISO();
  const pendientes = listarCitas((cita) => esCitaActiva(cita) && cita.fecha >= hoy);
  return pendientes.reduce((grupos, cita) => grupos.set(cita.medicoId, [...(grupos.get(cita.medicoId) ?? []), cita]), new Map());
}

function renderizarAccionReasignar(cita) {
  if (!esCitaFutura(cita)) {
    return `<button class="boton boton--secundario boton--pequeno" type="button" disabled>${icono('reasignar')}Reasignar médico</button>`;
  }
  return `<a class="boton boton--suave boton--pequeno" href="${construirHash('reasignar-medico', { cita: cita.id })}">${icono('reasignar')}Reasignar médico</a>`;
}

function renderizarFilaCita(cita) {
  const { dia, mes } = partesDeFecha(cita.fecha);
  return `
    <li class="cita-pendiente">
      <span class="cita-pendiente__fecha"><b>${dia}</b><small>${escaparHtml(mes)}</small></span>
      <span class="cita-pendiente__info">
        <strong>${escaparHtml(cita.hora)} · ${escaparHtml(cita.paciente?.nombre ?? '')}</strong>
        <small>${escaparHtml(cita.id)} · ${escaparHtml(cita.consultorio)}</small>
      </span>
      ${insigniaEstado(cita.estado)}
      <span class="cita-pendiente__acciones">
        <a class="boton boton--secundario boton--pequeno" href="${construirHash('detalle-cita', { id: cita.id })}">${icono('documento')}Ver detalle</a>
        ${renderizarAccionReasignar(cita)}
      </span>
    </li>`;
}

function renderizarMedico(medico, citas) {
  return `
    <section class="panel medico-citas" aria-label="Citas pendientes de ${escaparHtml(medico.nombre)}">
      <header class="medico-citas__cabecera">
        ${renderizarAvatarMedico(medico, 'tarjeta')}
        <div class="medico-citas__datos">
          <h2 class="panel__titulo">${escaparHtml(medico.nombre)}</h2>
          <p>${escaparHtml(medico.especialidad?.nombre ?? '')} · ${escaparHtml(medico.consultorio)}</p>
        </div>
        <span class="insignia insignia--${citas.length ? 'info' : 'neutro'}">${citas.length} ${citas.length === 1 ? 'cita pendiente' : 'citas pendientes'}</span>
      </header>
      ${citas.length
    ? `<ul class="medico-citas__lista">${citas.map(renderizarFilaCita).join('')}</ul>`
    : '<p class="medico-citas__vacio">Sin citas pendientes.</p>'}
    </section>`;
}

export default {
  id: ID_MODULO,
  titulo: 'Detalles de citas existentes',
  icono: 'calendario',
  roles: ['administrador'],
  seccion: 'Gestión',
  montar(contenedor) {
    function renderizar() {
      const medicos = listarMedicos({ soloActivos: false });
      const grupos = agruparCitasPorMedico();
      contenedor.innerHTML = `
        ${renderizarEncabezado({
    titulo: 'Detalles de citas existentes',
    descripcion: 'Consulta los médicos y las citas que cada uno tiene pendientes. Si un médico no puede atender en un horario, usa «Reasignar médico».',
  })}
        <div class="citas-existentes">
          ${medicos.length
    ? medicos.map((medico) => renderizarMedico(medico, grupos.get(medico.id) ?? [])).join('')
    : `<section class="panel">${renderizarVacio({ iconoVacio: 'estetoscopio', titulo: 'No hay médicos registrados' })}</section>`}
        </div>`;
    }

    renderizar();
    return storage.suscribir(renderizar);
  },
};
