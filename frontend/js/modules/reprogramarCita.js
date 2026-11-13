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

const ID_MODULO = 'reprogramar-cita';
const PASOS = ['Seleccionar cita', 'Nuevo horario', 'Confirmación'];

function listarCitasReprogramables(pacienteId) {
  return listarCitas((cita) => cita.pacienteId === pacienteId && esCitaActiva(cita) && esCitaFutura(cita));
}

function renderizarPasoSeleccion(estado, pacienteId) {
  const citas = listarCitasReprogramables(pacienteId);
  if (!citas.length) {
    return renderizarVacio({ titulo: 'No tienes citas que puedan reprogramarse', mensaje: 'Solo se reprograman citas activas con fecha futura.' });
  }
  return renderizarListaCitas(citas, {
    mostrar: 'medico',
    seleccionadaId: estado.citaId,
    crearEnlace: (cita) => construirHash(ID_MODULO, { cita: cita.id }),
  });
}

export default {
  id: ID_MODULO,
  titulo: 'Reprogramar cita',
  icono: 'reprogramar',
  roles: ['paciente'],
  seccion: 'Citas',
  montar(contenedor, { usuario, params }) {
    const estado = { paso: 0, citaId: params.cita ?? null, horarioId: null };

    function renderizar() {
      contenedor.innerHTML = `
        ${renderizarEncabezado({ titulo: 'Reprogramar cita', descripcion: 'Cambia la fecha u hora de una cita activa con el mismo médico.' })}
        ${renderizarStepper(PASOS, estado.paso)}
        <section class="panel">
          ${renderizarEnConstruccion({
            casoUso: 'CU-02 Reprogramar cita',
            responsable: 'Diego',
            alcance: 'Seleccionar la cita, elegir un nuevo horario disponible del mismo médico, liberar el horario anterior, ocupar el nuevo, registrar el evento y notificar al paciente y al médico.',
          })}
          <h2 class="panel__titulo panel__titulo--separado">Citas que puedes reprogramar</h2>
          ${renderizarPasoSeleccion(estado, usuario.id)}
        </section>`;
    }

    renderizar();
    return storage.suscribir(renderizar);
  },
};
