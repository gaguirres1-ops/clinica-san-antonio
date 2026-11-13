import * as storage from '../core/storage.js';
import { ESTADOS_HORARIO, listarMedicos } from '../core/dominio.js';
import { hoyISO } from '../core/fechas.js';
import { construirHash } from '../core/navigation.js';
import {
  escaparHtml,
  icono,
  renderizarAvatar,
  renderizarEncabezado,
  renderizarEnConstruccion,
  renderizarStepper,
} from '../core/ui.js';

const ID_MODULO = 'gestionar-agenda';
const PASOS = ['Seleccionar médico', 'Horarios de atención', 'Confirmación'];

function contarHorariosFuturos(medicoId) {
  const hoy = hoyISO();
  const horarios = storage.filtrar('horarios', (horario) => horario.medicoId === medicoId && horario.fecha >= hoy);
  return Object.values(ESTADOS_HORARIO).reduce((conteo, estadoHorario) => ({
    ...conteo,
    [estadoHorario]: horarios.filter((horario) => horario.estado === estadoHorario).length,
  }), {});
}

function listarMedicosGestionables({ rol, usuario }) {
  const medicos = listarMedicos({ soloActivos: false });
  return rol === 'medico' ? medicos.filter((medico) => medico.id === usuario.id) : medicos;
}

function renderizarFilaMedico(medico, seleccionado) {
  const conteo = contarHorariosFuturos(medico.id);
  return `
    <li>
      <a class="fila-medico${seleccionado ? ' fila-medico--seleccionada' : ''}" href="${construirHash(ID_MODULO, { medico: medico.id })}">
        ${renderizarAvatar(medico.nombre)}
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

export default {
  id: ID_MODULO,
  titulo: 'Gestionar agenda',
  icono: 'agenda',
  roles: ['medico', 'administrador'],
  seccion: 'Gestión',
  montar(contenedor, contexto) {
    const estado = {
      paso: 0,
      medicoId: contexto.rol === 'medico' ? contexto.usuario.id : contexto.params.medico ?? null,
    };

    function renderizar() {
      const medicos = listarMedicosGestionables(contexto);
      contenedor.innerHTML = `
        ${renderizarEncabezado({ titulo: 'Gestionar agenda', descripcion: 'Publica, bloquea o libera los horarios de atención de los médicos.' })}
        ${renderizarStepper(PASOS, estado.paso)}
        <section class="panel">
          ${renderizarEnConstruccion({
            casoUso: 'CU-05 Gestionar agenda',
            responsable: 'Pool / Jean',
            alcance: 'Seleccionar el médico, visualizar sus horarios por fecha, crear nuevos bloques de atención, bloquear o liberar horarios sin citas y notificar los cambios.',
          })}
          <h2 class="panel__titulo panel__titulo--separado">Agenda de los próximos días</h2>
          <ul class="lista-citas">${medicos.map((medico) => renderizarFilaMedico(medico, medico.id === estado.medicoId)).join('')}</ul>
        </section>`;
    }

    renderizar();
    return storage.suscribir(renderizar);
  },
};
