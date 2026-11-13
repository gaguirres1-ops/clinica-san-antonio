import * as storage from '../core/storage.js';
import { ESTADOS_CITA, listarCitas } from '../core/dominio.js';
import { construirHash } from '../core/navigation.js';
import {
  renderizarEncabezado,
  renderizarEnConstruccion,
  renderizarListaCitas,
  renderizarStepper,
  renderizarVacio,
} from '../core/ui.js';

const ID_MODULO = 'diagnostico';
const PASOS = ['Seleccionar cita', 'Registrar diagnóstico', 'Confirmación'];
const ESTADOS_ATENDIBLES = [ESTADOS_CITA.CONFIRMADA, ESTADOS_CITA.REPROGRAMADA];

function listarCitasPorAtender(medicoId) {
  return listarCitas((cita) => cita.medicoId === medicoId && ESTADOS_ATENDIBLES.includes(cita.estado));
}

function renderizarPasoSeleccion(estado, medicoId) {
  const citas = listarCitasPorAtender(medicoId);
  if (!citas.length) {
    return renderizarVacio({ iconoVacio: 'diagnostico', titulo: 'No tienes citas por atender', mensaje: 'Las citas confirmadas aparecerán aquí.' });
  }
  return renderizarListaCitas(citas, {
    mostrar: 'paciente',
    seleccionadaId: estado.citaId,
    crearEnlace: (cita) => construirHash(ID_MODULO, { cita: cita.id }),
  });
}

export default {
  id: ID_MODULO,
  titulo: 'Registrar diagnóstico',
  icono: 'diagnostico',
  roles: ['medico'],
  seccion: 'Atención médica',
  montar(contenedor, { usuario, params }) {
    const estado = { paso: 0, citaId: params.cita ?? null };

    function renderizar() {
      contenedor.innerHTML = `
        ${renderizarEncabezado({ titulo: 'Registrar diagnóstico', descripcion: 'Documenta la atención del paciente en su historial clínico.' })}
        ${renderizarStepper(PASOS, estado.paso)}
        <section class="panel">
          ${renderizarEnConstruccion({
            casoUso: 'CU-04 Registrar diagnóstico',
            responsable: 'Pool / Jean',
            alcance: 'Seleccionar la cita, consultar el historial clínico previo, registrar diagnóstico (CIE-10), tratamiento e indicaciones, marcar la cita como Atendida y notificar al paciente.',
          })}
          <h2 class="panel__titulo panel__titulo--separado">Citas por atender</h2>
          ${renderizarPasoSeleccion(estado, usuario.id)}
        </section>`;
    }

    renderizar();
    return storage.suscribir(renderizar);
  },
};
