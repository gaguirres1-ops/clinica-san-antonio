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

const ID_MODULO = 'cancelar-cita';
const PASOS = ['Seleccionar cita', 'Motivo de cancelación', 'Confirmación'];

function listarCitasCancelables({ rol, usuario }) {
  return listarCitas((cita) => esCitaActiva(cita)
    && esCitaFutura(cita)
    && (rol === 'administrador' || cita.pacienteId === usuario.id));
}

function renderizarPasoSeleccion(estado, contexto) {
  const citas = listarCitasCancelables(contexto);
  if (!citas.length) {
    return renderizarVacio({ iconoVacio: 'cancelar', titulo: 'No hay citas que puedan cancelarse', mensaje: 'Solo se cancelan citas activas con fecha futura.' });
  }
  return renderizarListaCitas(citas, {
    mostrar: contexto.rol === 'administrador' ? 'ambos' : 'medico',
    seleccionadaId: estado.citaId,
    crearEnlace: (cita) => construirHash(ID_MODULO, { cita: cita.id }),
  });
}

export default {
  id: ID_MODULO,
  titulo: 'Cancelar cita',
  icono: 'cancelar',
  roles: ['paciente', 'administrador'],
  seccion: 'Citas',
  montar(contenedor, contexto) {
    const estado = { paso: 0, citaId: contexto.params.cita ?? null, motivo: '' };

    function renderizar() {
      contenedor.innerHTML = `
        ${renderizarEncabezado({ titulo: 'Cancelar cita', descripcion: 'Anula una cita activa y libera su horario para otros pacientes.' })}
        ${renderizarStepper(PASOS, estado.paso)}
        <section class="panel">
          ${renderizarEnConstruccion({
            casoUso: 'CU-03 Cancelar cita',
            responsable: 'Diego',
            alcance: 'Seleccionar la cita, registrar el motivo, confirmar mediante modal de acción destructiva, cambiar el estado a Cancelada, liberar el horario, gestionar el reembolso y notificar a los involucrados.',
          })}
          <h2 class="panel__titulo panel__titulo--separado">Citas que pueden cancelarse</h2>
          ${renderizarPasoSeleccion(estado, contexto)}
        </section>`;
    }

    renderizar();
    return storage.suscribir(renderizar);
  },
};
