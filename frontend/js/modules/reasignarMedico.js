import * as storage from '../core/storage.js';
import { esCitaActiva, esCitaFutura, listarCitas } from '../core/dominio.js';
import { construirHash } from '../core/navigation.js';
import {
  renderizarEncabezado,
  renderizarEnConstruccion,
  renderizarListaCitas,
  renderizarStepper,
  renderizarVacio,
} from '../core/ui.js';

const ID_MODULO = 'reasignar-medico';
const PASOS = ['Seleccionar cita', 'Nuevo médico', 'Confirmación'];

function listarCitasReasignables() {
  return listarCitas((cita) => esCitaActiva(cita) && esCitaFutura(cita));
}

function renderizarPasoSeleccion(estado) {
  const citas = listarCitasReasignables();
  if (!citas.length) {
    return renderizarVacio({ iconoVacio: 'reasignar', titulo: 'No hay citas que puedan reasignarse' });
  }
  return renderizarListaCitas(citas, {
    mostrar: 'ambos',
    seleccionadaId: estado.citaId,
    crearEnlace: (cita) => construirHash(ID_MODULO, { cita: cita.id }),
  });
}

export default {
  id: ID_MODULO,
  titulo: 'Reasignar médico',
  icono: 'reasignar',
  roles: ['administrador'],
  seccion: 'Gestión',
  montar(contenedor, { params }) {
    const estado = { paso: 0, citaId: params.cita ?? null, medicoDestinoId: null };

    function renderizar() {
      contenedor.innerHTML = `
        ${renderizarEncabezado({ titulo: 'Reasignar médico', descripcion: 'Transfiere una cita a otro médico de la misma especialidad con horario libre.' })}
        ${renderizarStepper(PASOS, estado.paso)}
        <section class="panel">
          ${renderizarEnConstruccion({
            casoUso: 'CU-06 Reasignar médico',
            responsable: 'Susana',
            alcance: 'Seleccionar la cita, listar médicos de la misma especialidad con el mismo horario libre, confirmar la reasignación, mover la ocupación del horario y notificar al paciente y a ambos médicos.',
          })}
          <h2 class="panel__titulo panel__titulo--separado">Citas activas</h2>
          ${renderizarPasoSeleccion(estado)}
        </section>`;
    }

    renderizar();
    return storage.suscribir(renderizar);
  },
};
